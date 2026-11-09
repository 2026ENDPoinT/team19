# P-BE-02: FE·BE API와 AI 파이프라인 연결 계약 v0

> 상태: 의견 수집중 · 제안: BE/Codex · 2026-11-08 · 의견 마감: 팀 협의 시 결정

## 무엇을 정하려는가

PDF 업로드부터 클립 재생까지의 API·데이터와 AI 모듈 호출·작업 저장·실패 복구를 제안한다. **아래 세부 계약은 모두 최종 결정 전 BE 제안이다.**

## 왜 지금 필요한가

FE와 AI가 서로를 기다리지 않고 샘플로 개발하려면 입력·출력과 실패 상태를 먼저 맞춰야 한다. [계약 작성 절차](../../contracts/README.md)에 따라 기존 API 경로를 유지하며 v0 검토안을 제시한다.

- **확정 기준:** [D-12·D-13·D-17](../decisions.md)에 따라 강의별 PDF 추출을 재사용하고 모드별로 분할한다. 음성·문장별 시간 계산은 AI가, 호출·상태·오류·재시도·저장은 BE가 맡는다. AI는 별도 서버가 아닌 Python 모듈로 BE가 호출한다.
- **중복 범위 제외:** 저장 위치·보관·자동 정리·시연 정책은 [P-BE-01](P-BE-01-storage-and-demo.md), 설계도 본문·검증 규칙은 [P-AI-02](P-AI-02-blueprint-v0.md#be)를 따른 제안으로 연결하며 여기서 확정하지 않는다. 기존 질문은 번호로 참조하고 재작성하지 않는다.

## 선택지

| 방식 | 장점 | 한계 |
|---|---|---|
| A. HTTP 요청 안에서 생성 완료까지 대기 | 연결이 단순함 | 긴 대기와 연결 종료 후 재시도 구분이 어려움 |
| **B. DB에 작업을 저장하고 BE 내부 실행기가 처리** | 별도 서비스 없이 상태 조회·복구 가능 | BE 종료 시 중단된 작업의 정리 필요 |
| C. 별도 실행 프로세스·외부 작업 큐 | 실행 분리와 병렬 처리 확장에 유리 | 해커톤에서 설정·운영 범위 증가 |

## 제안자의 추천과 이유

### 1. 실행과 생성 흐름

**1단계는 B안을 추천한다.** DB에 작업을 저장한 뒤 접수 응답을 반환하고, BE 내부 실행기가 AI 모듈을 호출한다. 긴 처리가 다른 API 요청을 막지 않도록 실행하며, 외부 호출 동안 DB 쓰기 작업을 점유하지 않는다.

**서버 프로세스 1개·동시 실행 작업 수 1개는 BE의 초기 추천이며 확정 사항이 아니다.** Q-AI-05의 전체 클립 자동 생성 방향과 AI의 병렬 생성 의견을 고려하면 순차 처리만으로는 피드 대기가 길어질 수 있다. 실제 생성 시간·API 요청 한도·비용을 확인한 뒤 팀과 협의해 동시 수를 조정한다. 전체 생성 여부와 동시에 실행할 개수는 구분한다.

Q-AI-05는 아직 열려 있다. A안 채택 시 분할 완료 후 전체 클립 작업을 피드 순서로 등록하고, B안 채택 시 첫 클립만 자동 등록하며 나머지 생성 요청 API를 추가 협의한다. 기존 BE의 B안 의견을 이 제안으로 확정하거나 대체하지 않는다.

### 2. FE·BE API 요청·응답 예시

필드는 `camelCase`, ID는 문자열로 제안한다. PDF 페이지는 1부터, 문장 인덱스·클립 순서는 0부터 시작한다. `review` 등 모드 값과 `concept` 등 종류 값은 설명용 후보이며 AI 확인이 필요하다. GET 요청 본문은 없다.

| API | 요청 예시 | 성공 응답 예시 | 주요 오류 |
|---|---|---|---|
| `POST /lectures` | `multipart/form-data`, `file=lecture.pdf` | `202 {"lectureId":"lec_01","jobId":"job_01","status":"pending"}` | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, 접수 시 확인 가능한 `422 INVALID_PDF`, `503 STORAGE_UNAVAILABLE` |
| `GET /lectures/{id}` | `/lectures/lec_01` | `200 {"id":"lec_01","title":"알고리즘","status":"ready","pageCount":57,"preparationJobId":"job_01","pages":[{"number":31,"imageUrl":"/assets/img_31"}]}` | `404 LECTURE_NOT_FOUND` |
| `POST /lectures/{id}/outlines` | `{"mode":"review"}` | `202 {"outlineId":"out_01","jobId":"job_02","status":"pending","reused":false}` | `404 LECTURE_NOT_FOUND`, `422 INVALID_MODE`, `409 LECTURE_NOT_READY` |
| `GET /jobs/{id}` | `/jobs/job_02` | `200 {"id":"job_02","type":"build_outline","status":"running","stage":"planning","progress":null,"error":null}` | `404 JOB_NOT_FOUND` |
| `GET /lectures/{id}/outlines/{mode}` | `/lectures/lec_01/outlines/review` | `200 {"id":"out_01","mode":"review","status":"ready","jobId":"job_02","clips":[{"id":"clip_01","planId":"plan_01","order":0,"title":"피봇의 역할","sourcePages":[31],"status":"pending","jobId":"job_03","error":null}]}` | `404 LECTURE_NOT_FOUND`, `404 OUTLINE_NOT_FOUND`, `422 INVALID_MODE` |
| `GET /clips/{id}` | `/clips/clip_01` | `200`, 아래 결과 예시 참조 | `404 CLIP_NOT_FOUND` |

- 페이지 목록은 일부를 표시한 예시다. 처리 중에는 `pageCount: null`, `pages: []`이며 Lecture의 `ready`는 PDF 추출 완료를 뜻한다. 접수 응답의 `status`는 Job 상태다.
- Outline의 `ready`는 분할 계획 저장 완료다. 분할 중에는 `status: "planning"`, `clips: []`를 반환하고 이후 생성 완료는 클립별 상태로 확인한다.
- 클립 목록의 `clips[].jobId: "job_03"`은 생성 작업이 등록된 예시다. Q-AI-05의 생성 흐름에 따라 아직 작업을 등록하지 않은 클립은 `status: "pending"`, `jobId: null`로 반환할 수 있다. 이때 `pending`은 생성 미착수이며 실행 대기 Job이 존재한다는 뜻은 아니다.
- 존재하는 Job·Clip의 대기·실행·실패는 HTTP 200 안의 상태로 반환한다. Clip 미완료 시 `result: null`로 두어 처리 실패와 없는 자원의 404를 구분한다. 업로드 후 발견한 PDF 오류는 Job 실패로 기록한다.
- 공통 오류 예시: `{"error":{"code":"CLIP_NOT_FOUND","message":"클립을 찾을 수 없습니다.","retryable":false}}`. Job의 `error`도 같은 형태로 두고 내부 예외를 그대로 공개하지 않는다.

**클립 결과 예시(P-AI-02의 설계도 형식을 사용한 후보)**

```json
{
  "id": "clip_01", "planId": "plan_01", "status": "completed", "error": null,
  "result": {
    "resultId": "res_01", "durationSec": 3.2, "audioUrl": "/assets/audio_01",
    "blueprint": {
      "version": 0, "title": "피봇의 역할", "theme": "dark",
      "scenes": [{
        "id": "s1", "clear": true, "lines": ["퀵 정렬은 피봇을 기준으로 나눕니다."],
        "texts": [{"id":"t1","slot":"top","style":"title","content":"피봇의 역할","hidden":false}],
        "slides": [], "diagrams": [], "grids": [], "codes": [], "actions": [], "sourcePages": [31]
      }]
    },
    "captions": [{"sceneId":"s1","lineIndex":0,"text":"퀵 정렬은 피봇을 기준으로 나눕니다.","startSec":0,"endSec":3.2}]
  }
}
```

추가 후보: `POST /jobs/{id}/retry`에 `{}`를 보내면 `202 {"jobId":"job_04","retryOf":"job_03","status":"pending"}`를 반환한다. 대상 불명은 404, 재시도 불가·같은 대상 실행 중이면 `409 RETRY_NOT_ALLOWED`다. `GET /assets/{id}`는 이미지·음성을 200과 해당 파일 형식(Content-Type)으로 반환하고, 없으면 `404 ASSET_NOT_FOUND`다. 서버 내부 파일 경로는 전달하지 않는다.

### 3. 데이터 연결과 AI 모듈 경계

| 대상 | 저장·전달할 핵심 데이터 |
|---|---|
| Lecture·Page | 원본 PDF 참조, 실제 페이지 수, 페이지별 글자·이미지 참조, 추출 상태 |
| Outline·ClipPlan | 강의·모드별 계획, 분류, 순서·제목·종류·근거 페이지·선수 계획·AI 입력용 메모 |
| Clip·ClipResult | 계획 ID, 생성 상태·Job, `resultId`별 설계도 JSON·음성·문장별 시간·전체 길이 |
| Job | 대상 ID, 종류·단계·상태, 시각·시도 번호·이전 시도, 오류·산출물 참조 |

AI에는 DB 연결·웹 요청 객체 대신 ID와 입력 데이터·파일 참조를 전달한다. 반환값에는 결과와 사용량을 연결하고, 파일 출력 위치는 BE가 시도별로 할당한다. AI 원본 응답은 내부 기록으로 보관하며 BE가 DB 저장·조회 URL 발급을 맡는다. 함수 이름·호출 방식은 AI와 합의한다.

| AI 처리 후보 | 입력 → 출력 |
|---|---|
| 페이지 해설(Q-AI-07 채택 시) | 추출 글자·페이지 이미지 참조 → 페이지별 해설·사용량; 모드 간 재사용 |
| 모드별 분할 | 모드·재사용할 추출/해설 결과 → 분류·ClipPlan 목록 |
| 설계도 생성 | ClipPlan·관련 페이지·요구 형식 버전 → 설계도 JSON·사용량 |
| 음성·시간 생성 | 검증된 설계도·결과 식별자 → 음성 파일·전체 길이·문장별 시간 |

설계도는 `version`을 포함한 JSON 원형으로 저장하되 DB 내부/파일 여부는 P-BE-01에서 정한다. `version`은 형식 버전, `resultId`는 생성 결과 식별자다. 음성·시간은 같은 결과의 scene ID·문장 인덱스에 대응시키고, 시간은 클립 전체 음성 시작 기준 초 단위로 제안한다.

### 4. 저장·검증·실패 복구

- **저장:** 원본·추출 결과를 유지하고 강의/모드별 최초 분할과 같은 대상의 실행 중 작업은 DB에서 중복 생성하지 않는다. 중복 모드 요청은 진행 중이면 기존 Job을 202, 완료면 기존 Outline을 200으로 반환하며 `reused: true`로 표시한다. 실패한 작업은 명시적 재시도로 구분한다.
- **실행·복구 구현:** DB 영구 기록만으로 작업이 실행·복구되지는 않는다. BE가 서버 시작 시 미완료 Job을 확인하고 아래 규칙에 따라 상태를 정리하는 기능을 구현해야 한다. 실행기는 실행 대상의 상태 확인·변경을 하나의 처리로 묶어 같은 Job이 중복 실행되지 않도록 해야 한다.
- **완료:** Job은 `pending → running → completed/failed`로 기록하고 단계·오류를 남긴다. 파일 저장·검증 후 결과 참조와 완료 상태를 함께 확정한다. 음성·시간까지 유효한 결과만 재생용으로 공개한다.
- **검증:** P-AI-02의 공통 스키마/검증 규칙을 Python에도 적용하도록 합의한다. 실제 PDF 페이지 범위, ID 참조·장면 연결·동작 순서, `box`·`focus` 영역과 좌표 기준, scene ID 유일성·문장 대응·시간 순서·음성 길이를 확인한다. 설계도 검증은 TTS 전에 수행한다.
- **재시작:** 완료 결과·유효한 산출물을 유지한다. 미실행 `pending`은 다시 처리하고, 중단된 `running`은 `failed / SERVER_RESTARTED`로 남겨 자동 유료 재호출하지 않는다. 외부 호출 성공 후 저장 전 종료된 경우는 결과 불명확으로 구분한다.
- **재시도:** 새 Job에 이전 시도를 연결하고 유효한 저장 결과를 재사용한다. 형식 오류의 제한적 재생성을 추천하되 횟수·범위와 AI/BE 간 재시도 책임은 미확정이다. TTS 실패 시 검증된 설계도는 유지하며 음성만 재시도 가능한지 AI 확인이 필요하다.
- **실패 범위:** 클립 실패는 해당 클립만 처리하고 나머지는 계속 진행한다. 공통 추출·분할 실패 시 종속 작업을 시작하지 않는다. 단계별 시간 제한을 합의하고, 시간 초과 후에도 실제 실행이 남아 있으면 중복 재시도하지 않으며 늦은 결과로 종료 상태를 덮어쓰지 않는다.
- **조회:** Q-AI-19의 약 3초 폴링 제안을 따르되 FE 확인이 필요하다. 분할 Job 완료 후 클립 목록을 조회하고, 측정 불가능한 진행률은 `null`로 둔다. 통신 실패만으로 새 생성 작업을 만들지 않는다.

### 5. 범위와 확인 사항

| 1단계 필수로 제안 | 추후 확장 |
|---|---|
| 기존 6개 API·미디어 조회·기본 실패 재시도, DB 상태·결과 저장·재시작 정리 | 내 강의함·저장 표시·요청 문장 기반 재생성, 외부 작업 큐·다중 실행 프로세스 |
| 추출 재사용·중복 실행 방지·공통 검증·음성 연결·클립별 실패·제한된 동시 실행·폴링 | 내용 기반 중복 업로드 재사용, 자동 단계 복구·강제 취소·서버 푸시 알림·탐색 위치 우선 처리 |

- [to:FE] 6개 경로·응답 필드·상태·오류, 분할 이후 클립 조회, 재시도·음성 탐색에 필요한 파일 제공 조건을 확인해 주세요.
- [to:AI] 한국어 PDF 추출의 구현·담당 경계, 모듈 입출력·호출 방식·오류·시간 제한, 공통 검증·재생성 책임, 음성만 재시도 가능한 범위와 실제 결과 샘플을 확인해 주세요.
- [to:AI,FE] Q-AI-03·05·07·19 및 P-AI-02에서 모드·종류 값, 생성 흐름, 페이지 해설, 폴링, 좌표·문장별 시간 기준을 합의해 주세요. 선택 생성이면 추가 생성 API가 필요합니다. 실제 생성 시간·API 한도 확인 후 동시 수와 클립 수·재시도 예산은 팀과 협의합니다.

## 영향받는 문서와 파트

팀장 결정 후 `contracts/api.md`, `contracts/data-model.md`에 반영할 후보이다. FE는 화면·샘플 응답, AI는 모듈 입출력·결과, BE는 실행·검증·저장·복구를 검토한다. 저장·시연 정책은 P-BE-01, 손글씨의 필수 분류·제거를 추가하지 않는 의견은 Q-AI-23에서 계속 논의한다. 이 제안만으로 공용 문서를 수정하지 않는다.

## 의견

### AI

> 의견: B안(DB에 작업 저장, BE 실행기가 처리)과 6개 API에 동의. AI 모듈 경계를 아래처럼 제안 · AI/Claude · 2026-11-09 · 팀 최종 결정 전

**1. 추출 담당:** AI가 함수를 만들고 BE가 업로드 직후 첫 작업으로 부른다. PyMuPDF로 페이지 글자와 페이지 그림(PNG)을 만든다. 한글 추출 확인과 내용 없는 페이지 표시는 AI가 맡는다. 유료 호출은 없다. 한 PDF에 강의가 여러 개인 경우는 1단계에서 PDF를 나누지 않고 분할 계획 단계에서 다룬다.

**2. 모듈 모양:** 보통 Python 함수 5개. DB 연결이나 웹 요청 객체는 받지 않고, 입력 데이터와 파일 경로를 받아 결과(dict)를 돌려준다. 끝날 때까지 기다리는 함수라 BE 실행기가 별도 스레드에서 부른다.

| 함수 (후보) | 입력 | 출력 | 유료 |
|---|---|---|---|
| `extract_pdf` | PDF 경로, 출력 폴더 | pageCount, pages[{number, text, imagePath, empty}] | 아니오 |
| `describe_pages` | pages | pages[{number, description}], usage | 예 (Q-AI-07 실험 결과에 따라 빠질 수 있음) |
| `plan_outline` | mode, pages, descriptions | sections, clipPlans, usage | 예 |
| `make_blueprint` | clipPlan, 관련 pages·descriptions, pageCount | blueprint, usage | 예 |
| `make_audio` | 검증된 blueprint, 출력 폴더 | audioPath, durationSec, captions, usage | 예 |

- 출력 폴더는 BE가 시도마다 정해서 넘긴다. AI는 그 안에만 쓴다.
- `usage`는 호출마다 {provider, model, inputTokens, outputTokens, costUsd} 목록이다. BE가 Job에 저장한다([docs/06](../../docs/06-cost-and-budget.md)).
- **샘플 모드:** 환경변수 `AI_MODE=sample`이면 API를 부르지 않고 저장된 샘플을 같은 형식으로 돌려준다. BE는 키와 비용 없이 개발한다.
- clipPlans 필드는 [data-model.md](../../contracts/data-model.md)의 ClipPlan을 따른다. mode, kind 값은 Q-AI-03에서 정한다.

**3. 오류와 시간 제한:**
- AI 모듈은 `PipelineError` 하나에 `code`, `retryable`, 사용자용 `message`를 담아 던진다. BE가 Job error 형식으로 바꾼다. code 후보: `PDF_NO_TEXT`(재시도 불가), `PROVIDER_RATE_LIMIT`·`PROVIDER_TIMEOUT`·`PROVIDER_ERROR`·`BLUEPRINT_INVALID`·`TTS_FAILED`(재시도 가능).
- 외부 API 한 번 호출의 시간 제한과 순간 오류(요청 한도 초과 등)의 짧은 재시도(최대 2번)는 AI 모듈 안에서 한다. 단계 전체 시간 제한은 BE가 건다. 초기값 후보(추정, 실험 후 조정): 추출 1분, 페이지 해설 3분, 분할 2분, 설계도 2분, 음성 2분.

**4. 검사와 재생성:**
- `make_blueprint` 안에서 검사하고, 실패하면 오류 내용을 붙여 한 번 다시 만든다. 또 실패하면 `BLUEPRINT_INVALID`를 던진다. BE는 자동으로 다시 부르지 않는다(사용자가 재시도할 때만).
- `make_audio`도 넘기기 전에 captions를 검사한다(문장 수가 설계도와 같은지, 시간 순서, 마지막 endSec이 durationSec 이하인지).
- BE가 제안한 페이지 범위, box·focus 범위, ID 참조, scene ID 중복 검사를 넣는다.
- **검사기를 어디에 둘지는 11/9 회의에서 정한다.** 후보: (가) Python 검사기 하나를 AI가 관리하고 BE가 가져다 씀. 서버가 Python이라 따로 실행할 것이 없고 기준이 하나다. (나) BE가 Node.js를 설치하고 지금의 `validate.js`를 함께 씀. 이미 있는 것을 쓰지만 Python 서버에서 Node를 따로 불러야 한다.
- 형식 검사는 내용의 정확성까지 보장하지 않는다(FE 의견과 같음). 내용 품질은 AI가 평가 체크리스트로 따로 본다.

**5. 음성만 재시도: 가능하다.** 설계도와 음성을 다른 함수로 나눈 이유다. 검증된 설계도가 저장돼 있으면 `make_audio`만 다시 부른다.
- 음성은 문장마다 따로 만들고 길이를 재서 클립당 파일 하나로 잇는다(Q-AI-10 의견). 형식은 mp3 후보.
- captions 시간은 클립 음성 시작 기준 초 단위다(BE·FE 제안과 같음). 쉼 후보는 문장 사이 0.3초, 장면 사이 0.6초이고, 규칙은 P-AI-02에서 정한다.

**6. 실제 결과 샘플:** API 키가 마련되면(Q-AI-13) 알고리즘 자료로 강의 하나 추출, 모드 하나 분할, 클립 1~2개의 설계도와 음성을 만들어 `samples/`에 올린다. 날짜는 11/9 회의에서 키와 함께 정한다. 그 전까지는 BE의 fe-fixtures와 P-AI-02 샘플 설계도를 쓴다.

**7. 그 밖:**
- 재시작 시 `running`을 `SERVER_RESTARTED` 실패로 두고 유료 호출을 자동으로 다시 하지 않는 것에 동의한다.
- 동시 실행 수는 개발 중 1개에 동의한다. 시연은 Q-AI-05 A안 기준 3~4개를 목표로 하되, API 요청 한도와 실측 시간을 보고 정한다. AI 함수는 공유 상태를 두지 않아 동시에 불러도 안전하게 만든다.

### FE

> 의견: 기존 6개 API와 비동기 작업 B안에 동의, 아래 연결 조건 협의 제안 · FE/Codex · 2026-11-08 · 팀 최종 결정 전

- **필드·상태:** camelCase, 문자열 ID, 페이지 1부터·클립 순서/문장 인덱스 0부터에 동의한다. mode·kind 허용값과 화면 명칭, Lecture/Outline/Clip/Job 상태별 의미를 공통 계약에 명시하자. HTTP 오류와 HTTP 200 안의 작업 실패를 구분한다.
- **생성·조회:** 전체 자동 생성 후 준비된 것부터 재생하는 A안을 지지한다(Q-AI-05). 분할 Job 완료는 전체 클립 완료와 다르므로 이후에도 Outline의 클립 목록을 약 3초 간격으로 갱신하자. 활성 조회 대상별 완료·실패, 화면 이탈 시 중단하며 중복 조회를 피한다. 전체 상태가 없어도 모든 클립이 최종 상태인지 판단 가능해야 한다.
- **진행·복귀:** progress:null이면 단계 문구만 표시한다. 예상 시간은 실제 근거가 있을 때만 쓴다. 새로고침 후 복귀할 lectureId·mode·jobId를 FE가 보존하고 기존 작업/결과를 조회한다. 통신 실패로 새 생성 요청을 자동 전송하지 않는다.
- **미디어:** audioUrl과 페이지 이미지 URL은 브라우저에서 접근 가능한 주소로 제공하고 상대 URL의 기준을 정하자. FE·BE 포트가 다른 개발 환경의 접근 허용(CORS)과 API 주소 설정도 맞춘다. 음성은 탐색 가능한 형식과 파일 제공을 검증하고 브라우저의 부분 요청(Range) 필요 여부를 실제 탐색으로 확인하자.
- **시간·결과:** captions의 startSec/endSec는 클립 전체 음성 기준 초 단위에 동의한다. 같은 resultId의 설계도·음성·자막을 함께 사용한다. 시간의 순서·길이·sceneId/lineIndex 대응, 문장 간 공백과 장면 전환 기준을 AI와 합의한다.
- **재생:** 사용자가 학습 시작을 누르면 음성 재생을 시도하고 브라우저에서 차단되면 재생 버튼을 보여준다. 현재 클립만 재생하며 이동 시 이전 음성을 멈춘다. 탐색·반복 상태 복원은 P-AI-02의 FE 의견을 따른다.
- **실패·재시도:** result:null을 실패와 혼동하지 않는다. retryable과 사용자용 message를 활용해 해당 클립의 재시도 버튼을 표시한다. 재시도 중 중복 클릭을 막고 새 jobId로 추적한다. 동시 생성 수와 선택 클립 우선 처리는 서버·AI 비용 실측 후 별도 합의한다.
- **샘플 요청:** 실제 API 전 같은 형식의 준비 중·완료·실패 응답, 페이지 이미지, 설계도와 대응 음성·시간 샘플 한 세트를 제공해 달라. 새로고침·탐색·클립별 실패를 이 세트로 함께 검증하자.
### BE

## 결정 (팀장)
