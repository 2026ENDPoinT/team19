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
| `POST /lectures` | `multipart/form-data`, `file`; 선택 헤더 `X-Owner-Id` | `202 {lectureId, jobId, status}` | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `422 INVALID_PDF`, `422 INVALID_REQUEST`(헤더 형식), `503 STORAGE_UNAVAILABLE` |
| `GET /lectures` | 선택 헤더 `X-Owner-Id` | `200 [{id, title, status, pageCount}]` 그 주인의 강의, 최신순 | `422 INVALID_REQUEST`(헤더 형식) |
| `GET /lectures/{id}` | | `200 {id, title, status, pageCount, preparationJobId, pages: [{number, imageUrl}]}` | `404 LECTURE_NOT_FOUND` |
| `DELETE /lectures/{id}` | **필수** 헤더 `X-Owner-Id` | `204` 본문 없음 (영구 삭제 완료) | `404 LECTURE_NOT_FOUND`, `422 INVALID_REQUEST`, `409 LECTURE_BUSY`, `503 STORAGE_UNAVAILABLE`, `500 STORAGE_CLEANUP_PENDING` (아래 "강의 영구 삭제") |
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

### 내 강의함: `X-Owner-Id` (D-50, 구현됨 · 목록 분리만, 팀장 결정 [Q-BE-06](../coordination/questions.md))

- FE가 브라우저마다 무작위 문자열을 한 번 만들어 저장하고, **강의 업로드와 `GET /lectures`에** `X-Owner-Id` 헤더로 보낸다. 헤더 이름은 팀장이 승인했다. 형식(영문·숫자·`-`·`_` 16~64자, 예: UUID에서 `-`를 뺀 32자)은 **BE의 구현안**이며 팀장이 별도로 승인한 값은 아니다. BE는 형식만 검사한다.
- 헤더가 **없으면** 업로드는 주인 없는 강의로 저장되고(기존과 같이 동작), `GET /lectures`는 `[]`를 돌려준다. 헤더가 **있으나 형식이 틀리면** 무시하지 않고 `422 INVALID_REQUEST`이다.
- 이 기능 이전에 저장된 강의는 주인이 없어 누구의 목록에도 나오지 않는다. 단, 강의 ID를 알면 아래 API로 그대로 열린다. 기존 데이터는 지우거나 바꾸지 않는다.
- **같은 PDF 중복 방지(P-FE-15 MVP):** 같은 `X-Owner-Id`가 같은 PDF(바이트 SHA-256)를 다시 올리면 새 강의를 만들지 않고 기존 `lectureId`와 그 강의의 최신 준비 `jobId`를 같은 `202 {lectureId, jobId, status}` 모양으로 돌려준다(`status`는 그 강의의 현재 상태). 실패한 강의는 재사용하지 않고 새로 만든다. `GET /lectures`는 같은 PDF의 강의를 대표 한 건만 보여 준다. **대표는 `ready` 우선, 그다음 가장 최근에 올린 강의**이며 완성 클립 수는 보지 않는다(`pending`·`running`이 `failed`보다 앞). 대표가 아닌 강의는 목록에서만 가려지고 ID로 계속 열린다. 응답 필드는 늘지 않았다.
- 다른 API의 요청·응답은 바뀌지 않았다. 응답에 주인 ID는 나오지 않는다. CORS는 모든 요청 헤더를 허용해 새 헤더를 받는다.
- **보안 한계:** 팀장이 1단계는 목록만 분리하는 1안으로 정했다(Q-BE-06). 회원가입, 개별 API 접근 통제 확대, 서명 URL은 후순위다. 이 ID는 기기 구분표일 뿐 인증이 아니다. ID 문자열을 알면 그 사람의 목록이 보인다. **목록만 분리**하므로 `GET /lectures/{id}`, outlines, `/clips/{id}`, `/jobs/{id}`, `/assets/{id}`는 주인 검사 없이 ID만으로 열린다(`<audio>`·`<img>`는 헤더를 보내지 못한다). ID는 추측하기 어려운 무작위 값(64비트)이지만 비밀번호가 아니다. 이들 API의 접근 통제 확대·서명 URL은 구현하지 않았다(후순위).

### 강의 영구 삭제: `DELETE /lectures/{id}` (D-64, 구현됨 · FE 연동 전)

**진짜 삭제**다. 목록에서 숨기는 것이 아니라 복구할 수 없다. 팀장 결정 D-64의 요구(같은 주인만 삭제, 클립·음성·이미지 파일 포함 삭제, 지운 PDF를 다시 올리면 새 강의)를 따르며, 아래 API 형식은 D-64가 BE에 맡긴 것이다.

요청: `DELETE /lectures/{lectureId}` + **필수** 헤더 `X-Owner-Id`(업로드·목록과 같은 기기 ID). 본문 없음.

| 응답 | `error.code` | 뜻 | 데이터 상태 | FE 처리 제안 |
|---|---|---|---|---|
| `204` 본문 없음 | - | 영구 삭제 완료 | 삭제됨 | 성공. 목록을 새로 조회 |
| `404` | `LECTURE_NOT_FOUND` | 없는 강의, 이미 삭제됨, **다른 소유자의 강의**, 소유자 없는 옛 강의(다른 사람의 강의 존재 여부를 알려 주지 않는다) | 변화 없음 | 이미 없음으로 취급 |
| `422` | `INVALID_REQUEST` | `X-Owner-Id` 누락 또는 형식 오류(삭제에서는 헤더 필수) | 변화 없음 | FE 버그. 재시도 안 함 |
| `409` | `LECTURE_BUSY` | 이 자료의 작업(준비·분할·클립)이 **실행 중**. 이미 시작된 유료 호출을 끊지 않는다 | **아무것도 삭제되지 않음** | 끝난 뒤 다시 시도 안내. 선택 유지 |
| `503` | `STORAGE_UNAVAILABLE` | 파일이 사용 중이거나 저장소(SQLite) 오류 | **아무것도 삭제되지 않음**(롤백·폴더 복구) | 잠시 뒤 다시 시도(`retryable: true`) |
| `500` | `STORAGE_CLEANUP_PENDING` | **DB 삭제는 이미 완료**됐고 남은 파일 정리만 끝나지 않음 | 목록·ID 조회는 이미 404. 남은 폴더는 서버를 다시 켤 때 자동 정리 | 삭제된 것으로 취급하고 목록 새로 조회 |

오류 본문은 위 "오류 모양"과 같다.

- **삭제 범위(동일 PDF 전체):** 같은 `X-Owner-Id`가 올린 **같은 PDF(바이트 SHA-256)의 강의 기록 전체**를 한 번에 삭제한다. 내 강의함이 같은 PDF를 대표 한 건으로 묶어 보여 주므로, 대표만 지우면 옛 중복이 다시 나타나기 때문이다. **이것은 D-64가 따로 명시한 것은 아니고 BE가 목록 동작에 맞춘 구현이다**(D-64는 "그 강의"의 삭제만 말한다). 파일명은 보지 않는다. 다른 PDF, **다른 소유자의 같은 PDF**, 소유자 없는 강의, 공용 개발 샘플은 삭제하지 않는다. 해시가 없는 옛 강의는 저장된 원본을 읽어 비교하며 모드(sample/real)는 추정하지 않는다.
- **삭제 대상:** 강의·페이지·분할 계획·클립·Job(재시도 이력 포함)·사용량 기록·자산 행과 `lectures/{id}/`(원본 PDF·페이지 이미지), `clips/{clipId}/`(음성·미리보기 MP4·재시도 결과) 폴더. 삭제한 강의·분할 계획·클립·Job·자산 주소는 이후 모두 `404`이고, 같은 PDF를 다시 올리면 **새 강의·새 Job**(새 ID)이 만들어진다.
- **여러 개 삭제:** 한 번에 하나씩 보낸다. 같은 PDF 묶음의 두 ID를 연달아 보내면 **첫 호출이 성공한 뒤 두 번째 ID는 `404`**가 될 수 있다. 이는 이미 삭제된 것이므로 성공으로 취급한다. 한 항목의 실패(`409`·`503`)는 다른 항목에 영향이 없다.
- **일관성:** 실행 중 Job 확인과 삭제는 한 SQLite 쓰기 트랜잭션 안에서 한다. 대기 중(`pending`) Job은 강의와 함께 삭제되어 이후 실행되지 않는다. 폴더는 먼저 `.trash`로 옮긴 뒤 DB를 커밋하고 삭제하며, 중간 실패는 복구하고 서버 시작 때 남은 임시 폴더를 정리한다.
- **FE가 할 일:** 영구 삭제 확인 창(복구 불가, 같은 PDF의 모든 기록·만든 영상 삭제), 각 응답 처리, 성공 뒤 목록 새로 조회, 삭제한 강의를 보던 화면 정리.
- **보안 한계 유지:** `X-Owner-Id`는 인증이 아닌 기기 식별자다(D-50). 이 값을 아는 사람은 그 소유자의 강의를 영구 삭제할 수 있고 되돌릴 수 없다. 접근 통제가 강화됐다고 말하지 않는다. CORS 허용 메서드에 `DELETE`가 추가됐다.

## 2단계

| API | 하는 일 |
|---|---|
| `POST /clips/{id}/save` | 클립 저장 표시 |
| `POST /clips/{id}/regenerate` | 요청을 적어서 다시 만들기 (Q-AI-21) |
