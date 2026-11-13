# AI 파이프라인 v0 (BE → AI)

> 상태: 확정 v0 (D-27, D-28) · 담당: AI (검토 BE) · 최종 수정: 2026-11-13 · AI/Claude

BE 서버가 AI 파이프라인(Python 모듈)을 부르는 방법이다. 결정 과정은 [P-BE-02 AI 의견](../coordination/proposals/P-BE-02-api-and-pipeline-v0.md#ai). 만들어 보며 고치고, 바꿀 때는 제안서로 한다.

## 위치와 호출 방식

- 코드 위치: `pipeline/` (AI 담당). BE는 `import`해서 쓴다. **함수 5개는 패키지 맨 위(`import pipeline`)에 있다. BE는 `AI_PIPELINE_MODULE=pipeline`으로 쓴다.** 패키지를 불러와도 PyMuPDF·SDK는 함수를 부를 때 불러온다. 필요한 라이브러리는 `pipeline/requirements.txt`.
- 오류 클래스: `pipeline/errors.py`의 `PipelineError`.
- 보통 Python 함수다. 끝날 때까지 기다리는 함수라 BE 실행기가 별도 스레드에서 부른다.
- DB 연결이나 웹 요청 객체는 받지 않는다. 입력 데이터와 파일 경로를 받고 결과(dict)를 돌려준다.
- 출력 폴더는 BE가 시도마다 정해서 넘긴다. AI는 그 안에만 쓴다.
- 함수는 공유 상태를 두지 않아 동시에 불러도 안전하다.

## 함수 5개

| 함수 | 입력 | 출력 | 유료 |
|---|---|---|---|
| `extract_pdf` | PDF 경로, 출력 폴더 | pageCount, pages[{number, text, imagePath, empty}] | 아니오 |
| `describe_pages` | pages | pages[{number, description, kind, textBroken}], usage | 예 |
| `plan_outline` | mode, pages, descriptions | sections[{title, planIds}], clipPlans[{id, order, mode, title, kind, sourcePages, prerequisites, brief}], usage | 예 |
| `make_blueprint` | clipPlan, 관련 pages·descriptions, pageCount | blueprint, usage | 예 |
| `make_audio` | 검증된 blueprint, 출력 폴더 | audioPath, durationSec, captions, usage | 예 |

- 함수 이름과 인자 세부는 구현하며 이 표에 맞춰 고친다.
- `usage`는 호출마다 `{provider, model, inputTokens, outputTokens, costUsd}`의 목록이다. BE가 Job에 저장한다.
- `extract_pdf`는 PyMuPDF를 쓴다. 글자 위치로 한국어 띄어쓰기를 복원한다(PPT에서 내보낸 PDF는 띄어쓰기 문자가 없는 경우가 많다). `empty`는 글자와 그림이 거의 없는 페이지이고, 표지·목차는 분할 단계에서 AI가 거른다. 분할정복 자료 57쪽 기준 약 3초.
- `make_audio`는 문장마다 음성을 만들고 길이를 재서 파일 하나(`audio.mp3`, 64kbps)로 잇는다. 쉼은 [docs/04 시간 규칙](../docs/04-video-blueprint.md#시간-규칙)을 따른다. 지금은 OpenAI `gpt-4o-mini-tts`, 목소리 `cedar`(Q-AI-10). 숫자는 자막에는 그대로 두고, 음성에는 한글 읽기로 바꿔 보낸다(`pipeline/korean_numbers.py`. 값은 한자어 "십사", 개수·순서는 고유어 "열한 개", "아홉 번째"). 문장 음성은 출력 폴더의 `lines/`에 저장해 같은 문장이면 다시 부르지 않는다.
- `describe_pages`는 페이지 그림을 6쪽씩 묶어 동시에 4묶음까지 보낸다(57쪽 약 30초대, 약 $0.14). `description`은 글 하나이고, 표지·목차 등은 앞에 `[표지]`, `[목차]`, `[행정 안내]`, `[빈 페이지]`를, 추출 글자가 깨진 페이지는 `[추출 글자 깨짐…]`을 붙인다. BE는 `description` 글만 저장하면 분할 단계에 그대로 전달된다.
- `plan_outline`의 클립 수 상한은 자료 분량에 비례한다(내용 페이지 intro 10쪽, review 5쪽, exam 3쪽당 1개, 최대 5/12/20개). 클립 계획의 `mode`는 설계도 단계가 모드별 말투·길이를 고르는 데 쓴다. BE는 계획을 그대로 `make_blueprint`에 넘기면 된다(P-AI-10). exam은 내용 페이지의 90% 이상을 근거 페이지로 쓴다. 제목은 한국어(영어 용어는 괄호)다. `kind`는 `concept` / `process` / `example` / `compare`. `id`와 `prerequisites`는 이 결과 안에서만 쓰는 이름(`c1`…)이다. 검사에 실패하면 한 번 다시 만들고, 또 실패하면 `OUTLINE_INVALID`.
- 모델은 환경변수로 바꾼다: `AI_DESCRIBE_MODEL`, `AI_OUTLINE_MODEL`, `AI_BLUEPRINT_MODEL`. 기본값은 모두 `gpt-6.1-sol`(D-55). 설계도 시스템 프롬프트는 영어판이 기본(D-58). 지원 모델은 `pipeline/blueprint.py`의 `PRICES`.
- `make_audio`는 장면에 `speech`(P-AI-04)가 있으면 그 글을 읽고, 없거나 `""`이면 `lines`를 숫자 한글 변환해 읽는다. 자막(`captions.text`)은 언제나 `lines`다.

## 샘플 모드

환경변수 `AI_MODE=sample`이면 API를 부르지 않고 `samples/`의 저장된 결과를 같은 형식으로 돌려준다. BE와 FE는 키와 비용 없이 개발한다.

## 검사기 (D-27)

- `pipeline/validate.py`의 `validate_blueprint(blueprint, page_count)`: 오류 문장 목록을 돌려준다. 비어 있으면 통과다. 입력은 바꾸지 않는다. 검사 항목은 [docs/04 검사기](../docs/04-video-blueprint.md#검사기).
- 지원 배치와 자리는 파일 맨 위 `SUPPORTED_LAYOUTS`, `SUPPORTED_SLOTS`에 있다. 지금은 tree, row, column(D-43)과 top, middle, bottom이다(D-34). FE가 더 구현하면 AI가 늘린다. 수식 항 강조 `\term`(D-46)은 `SUPPORTED_FORMULA_TERMS`가 True일 때만 허용하고 프롬프트에도 그때 넣는다.
- 명령줄: `py -m pipeline.validate --pages 57 파일.json` (Windows는 `py`, 다른 곳은 `python`). 테스트: `py -m unittest discover -s pipeline/tests -t .`
- `make_blueprint`는 안에서 검사하고, 실패하면 오류 내용을 붙여 **한 번** 다시 만든다. 또 실패하면 `BLUEPRINT_INVALID`를 던진다. BE는 자동으로 다시 부르지 않는다(사용자가 재시도할 때만).
- `make_audio`도 넘기기 전에 captions를 검사한다(문장 수, 시간 순서, 마지막 끝 시간 ≤ durationSec).

## 오류

AI 모듈은 `PipelineError` 하나를 던진다. `code`, `retryable`, 사용자용 `message`를 담는다. BE가 Job `error`로 바꾼다.

| code | retryable | 뜻 |
|---|---|---|
| `PDF_INVALID` | false | 열 수 없거나 암호가 걸렸거나 페이지가 없는 PDF |
| `PDF_NO_TEXT` | false | 글자도 페이지 해설도 얻지 못함 |
| `PDF_TOO_LONG` | false | 100쪽을 넘는 PDF(`pipeline/extract.py`의 `MAX_PAGES`). 추출 전에 거절해 유료 호출이 없다 |
| `PROVIDER_RATE_LIMIT` | true | 요청 한도 초과 |
| `PROVIDER_TIMEOUT` | true | 외부 API 시간 초과 |
| `PROVIDER_ERROR` | true | 외부 API 오류 |
| `PROVIDER_REFUSED` | false | AI가 안전 정책으로 생성을 거절함 |
| `PROVIDER_NO_CREDIT` | false | AI 서비스 크레딧이 소진됨. 충전 전에는 다시 해도 실패한다 |
| `BLUEPRINT_INVALID` | true | 다시 만들어도 형식 검사 실패 |
| `TTS_FAILED` | true | 음성 생성 실패 |
| `OUTLINE_INVALID` | true | 다시 만들어도 분할 계획 검사 실패 |
| `INVALID_MODE` | false | 모르는 모드 |

## 시간 제한과 재시도

- 외부 API 한 번 호출의 시간 제한과 순간 오류의 짧은 재시도(최대 2번)는 AI 모듈 안에서 한다.
- 단계 전체 시간 제한은 BE가 건다. 초기값(추정, 실험 후 조정): 추출 1분, 페이지 해설 3분, 분할 2분, 설계도 2분, 음성 2분.
- 음성만 다시 만들 수 있다. 검증된 설계도가 저장돼 있으면 `make_audio`만 다시 부른다.
- 동시 실행은 개발 중 1개. 시연 수는 API 요청 한도와 실측 시간을 보고 정한다.
