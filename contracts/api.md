# API v0 (FE ↔ BE)

> 상태: 확정 v0 (D-28) · 담당: BE (검토 FE) · 최종 수정: 2026-11-14 · BE/Claude

결정 과정과 응답 예시 전체는 [P-BE-02](../coordination/proposals/P-BE-02-api-and-pipeline-v0.md), FE용 샘플 응답은 [sandbox/be/fe-fixtures/](../sandbox/be/fe-fixtures/README.md)에 있다. 만들어 보며 고치고, 바꿀 때는 제안서로 한다.

## 공통

- 필드는 `camelCase`, ID는 문자열이다. 번호 기준은 [docs/04](../docs/04-video-blueprint.md#번호-기준)와 같다(페이지 1부터, 문장과 클립 순서 0부터).
- 오래 걸리는 처리는 작업(Job)으로 접수하고 `202`와 `jobId`를 바로 돌려준다. BE는 작업을 DB에 저장하고 내부 실행기가 처리한다(P-BE-02 B안).
- FE는 약 3초마다 상태를 확인하고, 완료·실패·화면 이탈 시 멈춘다(D-21). 통신 실패만으로 새 생성 요청을 보내지 않는다.
- 모드 값: `intro`(처음 보기), `review`(복습), `exam`(시험 대비) (D-29).
- 모드를 고르면 분할 후 클립 전체를 자동으로 생성 등록한다(D-19).

## 1단계 API

| API | 요청 | 성공 응답 | 주요 오류 |
|---|---|---|---|
| `POST /lectures` | `multipart/form-data`, `file`; 선택 헤더 `X-Owner-Id` | `202 {lectureId, jobId, status}` | `415 UNSUPPORTED_FILE_TYPE`, `422 INVALID_PDF`, `422 PDF_PAGE_LIMIT_EXCEEDED`, `422 INVALID_REQUEST`(헤더 형식), `503 STORAGE_UNAVAILABLE` (아래 "PDF 업로드 정책") |
| `GET /lectures` | 선택 헤더 `X-Owner-Id` | `200 [{id, title, status, pageCount}]` 그 주인의 강의, 최신순 | `422 INVALID_REQUEST`(헤더 형식) |
| `GET /lectures/{id}` | | `200 {id, title, status, pageCount, preparationJobId, pages: [{number, imageUrl}]}` | `404 LECTURE_NOT_FOUND` |
| `POST /lectures/{id}/outlines` | `{mode}` | `202 {outlineId, jobId, status, reused}` | `404 LECTURE_NOT_FOUND`, `422 INVALID_MODE`, `409 LECTURE_NOT_READY` |
| `GET /jobs/{id}` | | `200 {id, type, status, stage, progress, error}` | `404 JOB_NOT_FOUND` |
| `GET /lectures/{id}/outlines/{mode}` | | `200 {id, mode, status, jobId, clips: [{id, planId, order, title, sourcePages, status, jobId, error}]}` | `404 LECTURE_NOT_FOUND`, `404 OUTLINE_NOT_FOUND`, `422 INVALID_MODE` |
| `GET /clips/{id}` | | `200 {id, planId, status, error, result}` | `404 CLIP_NOT_FOUND` |
| `POST /jobs/{id}/retry` | `{}` | `202 {jobId, retryOf, status}` | `404 JOB_NOT_FOUND`, `409 RETRY_NOT_ALLOWED` |
| `GET /assets/{id}` | | `200` 파일 (이미지, 음성) | `404 ASSET_NOT_FOUND` |

- 처리 중인 강의는 `pageCount: null`, `pages: []`이다. 분할 중인 Outline은 `status: "planning"`, `clips: []`이다.
- 클립이 아직 완료되지 않았으면 `result: null`이다. 존재하는 작업의 대기·실행·실패는 HTTP 200 안의 상태로 돌려준다.
- 같은 강의·모드 요청이 진행 중이면 기존 작업을, 완료됐으면 기존 Outline을 돌려주고 `reused: true`로 표시한다.
- `result` 모양은 [data-model.md](data-model.md#클립-결과-clipresult)를 따른다.
- 서버 내부 파일 경로는 주지 않는다. 이미지와 음성은 `/assets/{id}` 주소로만 준다. 음성은 브라우저에서 탐색할 수 있게 제공한다(Range 요청 확인).
- 개발 환경에서 FE와 BE의 포트가 다르므로 BE가 CORS를 허용한다.

## 오류 모양

```json
{"error": {"code": "CLIP_NOT_FOUND", "message": "클립을 찾을 수 없습니다.", "retryable": false}}
```

Job의 `error`도 같은 모양이다. 내부 예외를 그대로 보여 주지 않는다.

## 상태 값

| 대상 | 값 |
|---|---|
| Job | `pending` → `running` → `completed` / `failed` |
| Clip | `pending`(생성 전) / `running` / `completed` / `failed` |

### Job `type`과 `stage`

> 2026-11-12 BE/Claude: 새 이름 없이 `backend/app.py`에 이미 있는 값만 적었다. `backend/tests/test_integration_flow.py`와 로컬 HTTP로 확인했다.

Job `type`은 3가지이고 `jobId`를 받는 곳이 다르다.

| `type` | 하는 일 | `jobId`를 받는 곳 | `stage` 순서 |
|---|---|---|---|
| `prepare` | PDF의 페이지 글자·그림 추출, 페이지 해설 | `POST /lectures`, `GET /lectures/{id}`의 `preparationJobId` | `queued` → `starting` → `extracting` → `describing` → `finished` |
| `outline` | 강의·모드별 분할 계획 | `POST /lectures/{id}/outlines`, Outline의 `jobId` | `queued` → `starting` → `planning` → `finished` |
| `clip` | 클립 하나의 설계도와 음성 (분할이 끝나면 클립마다 자동 등록, D-19) | Outline `clips[].jobId` | `queued` → `starting` → `blueprint` → `audio` → `finished` |

| `stage` | Job `status` | 발생 조건과 의미 |
|---|---|---|
| `queued` | `pending` | 접수됐고 실행 순서를 기다린다. 개발 중 동시 실행은 1개라(D-28) 앞 작업이 끝나야 시작한다. |
| `starting` | `running` | 실행기가 작업을 집어 AI 모듈을 준비하는 중이다. |
| `extracting` | `running` | `prepare`만. PDF 페이지의 글자를 뽑고 페이지 그림을 저장한다. |
| `describing` | `running` | `prepare`만. 페이지 해설 단계. 샘플 모드에서는 해설을 만들지 않고 자리만 거친다. |
| `planning` | `running` | `outline`만. 자료를 클립으로 나누는 계획을 만든다. |
| `blueprint` | `running` | `clip`만. 영상 설계도를 만들고 형식 검사를 한다. |
| `audio` | `running` | `clip`만. 음성과 자막 시간을 만들고 검사한 뒤 결과를 저장한다. |
| `finished` | `completed` | 작업이 끝났다. `error`는 `null`이다. |
| `failed` | `failed` | 작업이 실패했다. `error`에 `{code, message, retryable}`이 있다. |
| `interrupted` | `failed` | 실행 중에 서버가 재시작돼 중단됐다. `error.code`는 `SERVER_RESTARTED`, `retryable: true`다. 자동으로 다시 실행하지 않는다. |

- `progress`는 지금 항상 `null`이다(D-21). 잴 수 없는 퍼센트를 만들지 않는다.
- 빠른 단계는 3초 간격 조회 사이에 지나가 FE가 못 볼 수 있다. 모든 `stage`를 볼 것이라고 가정하지 않는다.
- FE는 모르는 `stage` 값이 오면 일반 문구로 보여 준다. 값은 나중에 늘 수 있다.
- 실패한 Job은 `POST /jobs/{id}/retry`로 같은 `type`의 새 Job이 만들어진다(`retryOf`가 이전 `jobId`).

### PDF 업로드 정책 (파일 크기 제한 없음 · 최대 100페이지)

사용자·팀장·FE 담당자가 합의한 정책이다(사용자 전달, 11/14. `decisions.md`에는 아직 기록되지 않았다).

- **파일 크기 제한이 없다.** 이전의 `413 FILE_TOO_LARGE`는 더 이상 나오지 않는다. 파일은 1 MiB씩 디스크에 저장하며 크기로는 거부하지 않는다.
- **페이지 수는 실제 PDF 구조에서 읽는다.** 파일 크기로 추정하지 않으며, 페이지를 그림으로 만들거나 글자를 추출하지 않는다. **1~100페이지는 허용, 101페이지 이상은 거부**한다. 큰 파일이어도 100페이지 이하면 받는다.
- AI 파이프라인의 추출 단계도 100쪽을 넘으면 `PDF_TOO_LONG`으로 거절한다([pipeline.md](pipeline.md), D-67). 업로드에서 먼저 거절하므로 보통 도달하지 않는 **방어선**이며, 도달하면 준비 Job 실패로 보인다. 쪽수 상수는 BE `MAX_PDF_PAGES`와 AI `MAX_PAGES`가 따로 있어 바꿀 때 함께 맞춘다.
- 검사는 **업로드 요청 안에서, 강의·Job을 만들기 전에** 한다. 거부되면 강의와 Job이 **만들어지지 않고**, 임시 PDF와 폴더도 지우며, AI 파이프라인(유료 호출)도 시작하지 않는다. 기존 강의·자료에는 영향이 없다.

| 상황 | HTTP · `error.code` | `message` | `retryable` |
|---|---|---|---|
| 101페이지 이상 | `422 PDF_PAGE_LIMIT_EXCEEDED` | `PDF는 최대 100페이지까지 업로드할 수 있습니다.` | `false` |
| PDF가 아니거나(머리 `%PDF-` 없음), 손상·암호화·페이지 0개로 읽을 수 없음 | `422 INVALID_PDF` | `올바른 PDF 파일이 아닙니다.` 또는 `올바른 PDF 파일이 아니거나 읽을 수 없습니다.` | `false` |
| 확장자가 `.pdf`가 아님 | `415 UNSUPPORTED_FILE_TYPE` | `PDF 파일만 업로드할 수 있습니다.` | `false` |
| 저장 공간 부족 등으로 파일을 저장하지 못함 | `503 STORAGE_UNAVAILABLE` | `파일을 저장하지 못했습니다. …` | `true` |

오류 본문은 "오류 모양"과 같고, 내부 경로·라이브러리 예외는 보여 주지 않는다. FE는 `PDF_PAGE_LIMIT_EXCEEDED`일 때 위 `message`를 그대로 사용자에게 보여 주면 된다. 업로드 화면의 안내 문구는 FE 담당이다.

### 내 강의함: `X-Owner-Id` (D-50, 구현됨 · 목록 분리만, 팀장 결정 [Q-BE-06](../coordination/questions.md))

- FE가 브라우저마다 무작위 문자열을 한 번 만들어 저장하고, **강의 업로드와 `GET /lectures`에** `X-Owner-Id` 헤더로 보낸다. 헤더 이름은 팀장이 승인했다. 형식(영문·숫자·`-`·`_` 16~64자, 예: UUID에서 `-`를 뺀 32자)은 **BE의 구현안**이며 팀장이 별도로 승인한 값은 아니다. BE는 형식만 검사한다.
- 헤더가 **없으면** 업로드는 주인 없는 강의로 저장되고(기존과 같이 동작), `GET /lectures`는 `[]`를 돌려준다. 헤더가 **있으나 형식이 틀리면** 무시하지 않고 `422 INVALID_REQUEST`이다.
- 이 기능 이전에 저장된 강의는 주인이 없어 누구의 목록에도 나오지 않는다. 단, 강의 ID를 알면 아래 API로 그대로 열린다. 기존 데이터는 지우거나 바꾸지 않는다.
- **같은 PDF 중복 방지(P-FE-15 MVP):** 같은 `X-Owner-Id`가 같은 PDF(바이트 SHA-256)를 다시 올리면 새 강의를 만들지 않고 기존 `lectureId`와 그 강의의 최신 준비 `jobId`를 같은 `202 {lectureId, jobId, status}` 모양으로 돌려준다(`status`는 그 강의의 현재 상태). 실패한 강의는 재사용하지 않고 새로 만든다. `GET /lectures`는 같은 PDF의 강의를 대표 한 건만 보여 준다(다른 강의는 삭제 없이 ID로 계속 열림). 응답 필드는 늘지 않았다.
- 다른 API의 요청·응답은 바뀌지 않았다. 응답에 주인 ID는 나오지 않는다. CORS는 모든 요청 헤더를 허용해 새 헤더를 받는다.
- **보안 한계:** 팀장이 1단계는 목록만 분리하는 1안으로 정했다(Q-BE-06). 회원가입, 개별 API 접근 통제 확대, 서명 URL은 후순위다. 이 ID는 기기 구분표일 뿐 인증이 아니다. ID 문자열을 알면 그 사람의 목록이 보인다. **목록만 분리**하므로 `GET /lectures/{id}`, outlines, `/clips/{id}`, `/jobs/{id}`, `/assets/{id}`는 주인 검사 없이 ID만으로 열린다(`<audio>`·`<img>`는 헤더를 보내지 못한다). ID는 추측하기 어려운 무작위 값(64비트)이지만 비밀번호가 아니다. 이들 API의 접근 통제 확대·서명 URL은 구현하지 않았다(후순위).

## 2단계

| API | 하는 일 |
|---|---|
| `POST /clips/{id}/save` | 클립 저장 표시 |
| `POST /clips/{id}/regenerate` | 요청을 적어서 다시 만들기 (Q-AI-21) |
