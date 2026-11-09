# API v0 (FE ↔ BE)

> 상태: 확정 v0 (D-28) · 담당: BE (검토 FE) · 최종 수정: 2026-11-09 · AI/Claude

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
| `POST /lectures` | `multipart/form-data`, `file` | `202 {lectureId, jobId, status}` | `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `422 INVALID_PDF`, `503 STORAGE_UNAVAILABLE` |
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

`stage`, Job `type`의 세부 이름은 BE가 정하고 이 표에 추가한다.

## 2단계

| API | 하는 일 |
|---|---|
| `GET /lectures` | 내 강의함 |
| `POST /clips/{id}/save` | 클립 저장 표시 |
| `POST /clips/{id}/regenerate` | 요청을 적어서 다시 만들기 (Q-AI-21) |
