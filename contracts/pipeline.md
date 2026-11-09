# AI 파이프라인 v0 (BE → AI)

> 상태: 확정 v0 (D-27, D-28) · 담당: AI (검토 BE) · 최종 수정: 2026-11-09 · AI/Claude

BE 서버가 AI 파이프라인(Python 모듈)을 부르는 방법이다. 결정 과정은 [P-BE-02 AI 의견](../coordination/proposals/P-BE-02-api-and-pipeline-v0.md#ai). 만들어 보며 고치고, 바꿀 때는 제안서로 한다.

## 위치와 호출 방식

- 코드 위치: `pipeline/` (AI 담당). BE는 `import`해서 쓴다.
- 보통 Python 함수다. 끝날 때까지 기다리는 함수라 BE 실행기가 별도 스레드에서 부른다.
- DB 연결이나 웹 요청 객체는 받지 않는다. 입력 데이터와 파일 경로를 받고 결과(dict)를 돌려준다.
- 출력 폴더는 BE가 시도마다 정해서 넘긴다. AI는 그 안에만 쓴다.
- 함수는 공유 상태를 두지 않아 동시에 불러도 안전하다.

## 함수 5개

| 함수 | 입력 | 출력 | 유료 |
|---|---|---|---|
| `extract_pdf` | PDF 경로, 출력 폴더 | pageCount, pages[{number, text, imagePath, empty}] | 아니오 |
| `describe_pages` | pages | pages[{number, description}], usage | 예 (Q-AI-07 실험 결과에 따라 빠질 수 있음) |
| `plan_outline` | mode, pages, descriptions | sections, clipPlans, usage | 예 |
| `make_blueprint` | clipPlan, 관련 pages·descriptions, pageCount | blueprint, usage | 예 |
| `make_audio` | 검증된 blueprint, 출력 폴더 | audioPath, durationSec, captions, usage | 예 |

- 함수 이름과 인자 세부는 구현하며 이 표에 맞춰 고친다.
- `usage`는 호출마다 `{provider, model, inputTokens, outputTokens, costUsd}`의 목록이다. BE가 Job에 저장한다.
- `extract_pdf`는 PyMuPDF를 쓴다(한글 추출 확인됨).
- `make_audio`는 문장마다 음성을 만들고 길이를 재서 파일 하나로 잇는다. 쉼은 [docs/04 시간 규칙](../docs/04-video-blueprint.md#시간-규칙)을 따른다.

## 샘플 모드

환경변수 `AI_MODE=sample`이면 API를 부르지 않고 `samples/`의 저장된 결과를 같은 형식으로 돌려준다. BE와 FE는 키와 비용 없이 개발한다.

## 검사기 (D-27)

- `validate_blueprint(blueprint, page_count)`: 오류 목록을 돌려준다. 비어 있으면 통과다. 검사 항목은 [docs/04 검사기](../docs/04-video-blueprint.md#검사기).
- `make_blueprint`는 안에서 검사하고, 실패하면 오류 내용을 붙여 **한 번** 다시 만든다. 또 실패하면 `BLUEPRINT_INVALID`를 던진다. BE는 자동으로 다시 부르지 않는다(사용자가 재시도할 때만).
- `make_audio`도 넘기기 전에 captions를 검사한다(문장 수, 시간 순서, 마지막 끝 시간 ≤ durationSec).

## 오류

AI 모듈은 `PipelineError` 하나를 던진다. `code`, `retryable`, 사용자용 `message`를 담는다. BE가 Job `error`로 바꾼다.

| code | retryable | 뜻 |
|---|---|---|
| `PDF_NO_TEXT` | false | 글자도 페이지 해설도 얻지 못함 |
| `PROVIDER_RATE_LIMIT` | true | 요청 한도 초과 |
| `PROVIDER_TIMEOUT` | true | 외부 API 시간 초과 |
| `PROVIDER_ERROR` | true | 외부 API 오류 |
| `BLUEPRINT_INVALID` | true | 다시 만들어도 형식 검사 실패 |
| `TTS_FAILED` | true | 음성 생성 실패 |

## 시간 제한과 재시도

- 외부 API 한 번 호출의 시간 제한과 순간 오류의 짧은 재시도(최대 2번)는 AI 모듈 안에서 한다.
- 단계 전체 시간 제한은 BE가 건다. 초기값(추정, 실험 후 조정): 추출 1분, 페이지 해설 3분, 분할 2분, 설계도 2분, 음성 2분.
- 음성만 다시 만들 수 있다. 검증된 설계도가 저장돼 있으면 `make_audio`만 다시 부른다.
- 동시 실행은 개발 중 1개. 시연 수는 API 요청 한도와 실측 시간을 보고 정한다.
