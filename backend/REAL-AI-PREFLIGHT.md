# 실제 AI 첫 통합 사전 점검

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-13 · BE/Codex

## 판단과 기준

**SDK 설치와 전체 무과금 검증 완료, 유료 실행은 보류.** 2차 작업에서 Conda `team19`의 Python 호환성·import·함수 인자를 확인했고 BE·AI 304개 및 FE 24개 테스트 파일·TypeScript 검사가 통과했다. 현재 프로세스의 API 키와 루트 `.env`는 없으며 생성·변경하지 않았다. 아래 최소 실행 조건과 잔여 위험을 합의한 뒤 별도 유료 실행 승인이 필요하다.

- 1차 main `88611fa → 052a0a7`, 2차 `052a0a7 → adbd5e4 → 96d3956`, `git pull --ff-only` 성공. 이전 보고서·Q-BE-04/05와 기존 `.vscode/settings.json`·제출 ZIP 보존. 공유 대상은 이 보고서와 질문 파일의 BE 부분뿐이다.
- D-44: real 재시작 시 pending/running과 연결 대상을 `failed/SERVER_RESTARTED`로 처리, 자동 재개 없음. 잘못된 `AI_MODE`는 DB 초기화 전에 거부한다.
- D-45: real 작업 스레드 기본 3개, `BE_WORKERS` 1~3. Uvicorn은 **프로세스 하나, reload 없음**으로 운영한다.
- D-47: 발표 시작 때 실제 업로드하고 완료된 첫 클립부터 재생하는 방향에 FE 흐름이 맞는다. 8분 안 완료는 실측 전 보장할 수 없다. 예산 상한 없음은 이번 유료 실행 승인과 별개다.
- D-50: 첫 통합 뒤의 별도 작업. 이번에 구현하지 않았다. 첫 통합은 로컬 주소로 한정한다.
- 표준 개발 포트 8000/8010/5173/5174/3000의 리스너는 관찰되지 않았다. 다른 포트의 서버 유무까지 단정하지 않는다. 서버 종료·설정 변경·기존 DB 열기/수정/삭제 없음.

## 환경과 비밀값 제외 결과

Python: `C:/anaconda3/envs/team19/python.exe`, **3.13.15**. 기본 `python` 명령은 WindowsApps 경로여서 실행 시 Conda Python 절대 경로를 쓴다.

| pipeline/requirements.txt | 실제 설치 | 결과 |
|---|---|---|
| pymupdf >=1.24 | 2.1 | import·실제 페이지 추출 성공 |
| anthropic >=2.6 | 2.8.0 | 설치·import·Python 호환 조건 충족 |
| openai >=3.46 | 3.50.0 | 설치·import·Python 호환 조건 충족 |
| python-dotenv >=1.0 | 1.2.4 | 충족 |
| lameenc >=1.7 | 1.9.0 | 충족; 모의 PCM의 MP3 변환 성공 |

`pipeline/requirements.txt`를 `--no-user --no-cache-dir --upgrade-strategy only-if-needed`로 설치했다. 새 의존성은 docstring-parser 0.18.0, httpcore2/httpx2 2.16.0, jiter 0.19.0, sniffio 1.3.1, truststore 0.10.5다. 기존 패키지를 교체하거나 다른 Python·전역 PATH/설정을 변경하지 않았다. SDK의 Requires-Python은 둘 다 >=3.10이며 현재 3.13.15를 충족한다. 설치 후 `pip check` 통과.

FastAPI, pytest, httpx, pypdf, Pillow, imageio-ffmpeg도 import 성공. pipeline 하위 모듈 5개 import 및 BE가 넘기는 인자의 signature.bind 검사 성공. OpenAI Responses.create와 Speech.create에 현재 코드의 인자도 존재한다. 이 검사는 클라이언트 생성·API 요청·유료 생성 함수를 실행하지 않았다. fitz 별칭은 폐기 예정 경고가 있으나 실제 AI는 pymupdf를 사용한다.

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`: 1차의 프로세스·Windows User/Machine 확인에서 존재하지 않았고 루트 `.env`·Conda `conda-meta/state`도 없었다. 2차에도 현재 프로세스의 두 키와 루트 `.env`가 없음을 확인했다. 다른 실행 터미널·별도 비밀 저장소의 키 존재까지 판단하지 않는다.
- 관련 `AI_*`, `BE_WORKERS`, `TEAM19_DATA_DIR`, `FRONTEND_ORIGINS`도 현재 프로세스/루트 `.env`에서 미설정. API 주소 override도 미설정이다.
- 키 값은 출력·기록하지 않았다. 키 유효성·잔액·모델 접근 권한·요청 한도는 호출하지 않아 미검증이다. 기본 Terra+OpenAI TTS 경로에는 OpenAI 키가 필수이고 Anthropic 키는 Claude 선택 때 필요하다.
- `pipeline` 패키지는 가볍게 import되므로 **함수 5개가 보인다는 것만으로 SDK 준비를 보증하지 않는다.** `.env`는 AI 함수 실행 시 루트 파일만 읽고 기존 환경값을 덮어쓰지 않는다. BE 실행 설정은 서버 실행 전에 별도로 지정해야 한다.

## 데이터 연결과 계약 차이

| 실제 함수와 BE 인자 | 저장·다음 단계 | 확인 |
|---|---|---|
| extract_pdf(str PDF, str 출력폴더) | pageCount, pages의 number/text/imagePath/empty | 실제 PyMuPDF로 확인 |
| describe_pages(pages) | number로 description을 묶어 pages 테이블에 저장 | 그림 해설의 kind/textBroken은 description 앞 태그로 전달 |
| plan_outline(mode, pages, descriptions) | sections, clipPlans 원본을 SQLite에 저장하고 클립 Job 전부 등록 | AI id/prerequisites는 plan_json에 보존 |
| make_blueprint(plan, 관련 pages, 전체 pageCount) | AI 검사기와 BE 검사 후 음성 단계 | pages에 저장된 description도 전달 |
| make_audio(blueprint, 시도별 출력폴더) | MP3·captions 검사 후 result_json과 assets 등록 | resultId/audioUrl/blueprint/captions/sample:false 제공 |

FE는 같은 결과의 설계도·음성·자막을 묶어 읽는다. 원본 페이지는 `/assets`에서 제공한다. 실제 모드는 BE 미리보기 MP4를 만들지 않으며 FE가 설계도와 음성을 재생한다.

| 사항 | 실제 구현·위험 | 권장 후속 담당 |
|---|---|---|
| usage 저장 | 4개 유료 함수가 반환해도 BE가 버린다. jobs에 usage 칸이 없고 서버 경로는 costlog도 쓰지 않는다. 실패·부분 성공 비용도 놓친다. TTS usage는 토큰 대신 음성 초/추정 비용이다. | BE 저장, AI 실패 시 사용량 전달 방식 협의 |
| 단계 전체 시간 제한 | 추출 60/해설 180/분할 120/설계도 120/음성 120초 계약이 BE에서 미구현. `llm` 호출에만 120초를 명시; blueprint/TTS는 SDK 기본값 의존이다. 스레드 대기만 끝내도 원격 호출은 취소되지 않는다. | BE·AI 실제 취소/추가 과금 처리 협의 |
| 재시도 | 분할·설계도 형식/문체 검사 실패는 AI 내부에서 한 번 재생성. 설치된 두 SDK의 기본 max_retries=2를 소스/상수에서 확인했다. 기본 timeout은 connect=5초, read/write/pool=600초이며 단계 전체 제한이 아니다. llm은 timeout=120초로 덮어쓴다. BE는 실패한 Job을 자동 재시도하지 않는다. | AI 명시 timeout/retry, BE 기록 |
| 음성만 재시도 | 설계도는 성공 결과에만 저장. clip 재시도는 새 Job 폴더에서 설계도부터 다시 만들므로 이전 문장 음성 캐시도 재사용하지 못한다. | BE 단계 결과 저장·재개안 협의 |
| 오류 | AI PipelineError는 code/message/retryable 보존. 누락 SDK·키처럼 예상 밖 예외는 INTERNAL_ERROR. PDF 오류 이름은 업로드 INVALID_PDF / AI PDF_INVALID로 다름. | BE·AI 이름 통일 협의; FE는 현재 message 사용 |
| API 문서 잔여 차이 | 완료 outline 재사용은 200(표는 202만); 동시 실행 문구는 일부 1개로 남음. outline 응답의 planId와 AI c1은 다르며 sections/선수 개념 연결은 향후 매핑 필요. | 계약 변경은 제안/팀장 결정 후 |

`empty/kind/textBroken` 미저장은 Q-AI-28의 AI 답변대로 현재 추가 필드 없이 처리한다. Q-AI-31의 상한/제외 주제 표시와 P-FE-12의 정식 정책은 미결정이며 본 점검은 이를 확정하지 않는다.

## FE 확인과 호출 확대 위험

- `PreparationPanel`은 real PDF 전송 **전** 비용 확인, `OutlineFlow`는 real 분할·전체 클립 생성 **전** 별도 확인 버튼을 표시한다. 알 수 없는 모드·업로드 때와 달라진 서버 모드는 거부한다. 이는 FE 구현이며 팀장 동의 정책 확정은 아니다. BE가 동의 증거를 검사하지는 않는다.
- 조회는 약 3초 간격, 재조회는 GET만 사용. 새 계획이 없더라도 화면 진입만으로 POST하지 않는다. 진행 단계·실패 메시지·클립별 상태를 보여 주고 completed만 재생 버튼을 켠다. 완료 클립은 다른 작업 중에도 재생 가능하다.
- 업로드 POST를 반복하면 다른 강의로 접수돼 재과금된다. 같은 강의·모드 POST와 동일 실패 Job의 이중 재시도는 BE가 중복 실행을 막는다. 다른 모드는 별도 전체 생성이다. 화면 이탈/브라우저 요청 취소는 서버 Job/외부 호출 취소가 아니다.
- 유료 호출 수: **ceil(해설 대상 페이지/6) + 분할 1~2회 + 각 클립 설계도 1~2회 + 새 문장별 TTS**. SDK 순간 오류 재시도는 별도다. 해설은 내부 최대 4묶음 병렬이어서 D-45의 Job 3개가 외부 요청 3개 상한을 뜻하지 않는다(여러 강의 동시 준비는 최대 12묶음).
- 내용 P쪽의 클립 상한: intro `max(2,min(6,ceil(P/10)))`, review `max(3,min(12,ceil(P/5)))`, exam `max(4,min(20,ceil(P/3)))`. **최소 생성 수가 아니라 상한 계산의 최솟값**이다. 실제 생성은 1개 이상이며 상한을 채울 필요는 없다.

## 무과금 검증 결과 (2차 최종: main 96d3956)

- SDK 설치 후 `backend/tests` + `pipeline/tests` **304 passed, 149.55초**. 누락 SDK 때문에 제외했던 `test_errors.py`의 3개도 포함했으며 제외·실패·경고 없이 종료했다. D-44/D-45, real+BE_WORKERS=1 설정, 가짜 AI 연결·추출·검사·모의 음성·저장 결과를 포함한다. 앞서 adbd5e4에서도 304개/133.26초 통과 후, 동기화로 AI 프롬프트·평가 샘플이 바뀌어 최종 main에서 재검증했다.
- FE 전체 Node 테스트 **24개 파일 통과, 실패/제외 0**. adbd5e4에서 4.93초 통과 후 96d3956의 새 평가 샘플까지 전체 재검증했다. `--test-concurrency=1`로 순차 실행했다. `tsc --noEmit`도 통과했으며 두 main 사이 FE TypeScript 변경은 없다. 브라우저 조작·청취는 미검증이다.
- pytest는 단일 프로세스로 새 TEMP 폴더/DB를 사용했다. 외부 socket connect/connect_ex를 차단하고 TestClient의 Windows 내부 socketpair만 허용했다. 자식 Python에도 동일 보호를 적용했다. FE는 저장 결과·모의 fetch 테스트다. 테스트 실행끼리는 겹치지 않았고 추가 병렬 실행기를 사용하지 않았다(기존 동시성 검사의 소수 스레드는 유지).
- **1차 이력:** SDK 누락으로 전체 수집 실패 후 3개 제외 301개 통과였고 FE는 당시 23개 파일 통과였다. 당시 실제 함수 5개의 외부 응답만 모의 처리한 PDF→새 SQLite→ClipResult/이미지/오디오 Range 206 확인도 성공했다. 2차에서 유료 생성 함수의 별도 실험을 추가하지 않았다.
- 실제 AI 요청·실제 PDF의 AI 영상 생성·기능 코드 변경 없음. 1차 내부 socketpair 차단 문제도 2차에는 발생하지 않았다. 기존 DB·서버 프로세스는 사용/종료하지 않았다.

## 첫 유료 검증 추천 범위·예상

원본 **`coordination/lecture-submissions/CS/PR_9_r1.pdf`(6쪽, 약 0.26MiB)의 3쪽 Bernoulli만 분리한 1쪽 PDF**를 추천한다. 주제 하나와 짧은 수식으로 페이지 그림 해설·수식 재생까지 볼 수 있다. 이번 모의 통합에서 그 페이지의 추출도 성공했다. 원본은 보존하고 사본은 새 실행 폴더에만 둔다.

2차 준비에서 TEMP의 새 `team19-e2e-ready-*` 폴더에 `bernoulli-one-page.pdf`를 만들고 1쪽·Bernoulli 본문을 로컬에서 확인했다. 원본은 변경하지 않았으며 이 입력 사본은 Git에 넣지 않는다. 이 준비 폴더에 DB를 만들거나 서버를 시작하지 않았다. 유료 실행 승인 때 입력 파일과 새 데이터 폴더를 다시 확인한다.

- `intro` 한 모드, 업로드 한 번·분할 요청 한 번. 현재 API로는 1개만 생성하도록 강제할 수 없어 **최대 2개 전부 생성**을 승인 범위로 잡는다. 엄격히 1개만 허용하려면 별도 설계/승인이 필요하다. BE_WORKERS=1로 바꿔도 총 생성 수는 줄지 않는다.
- 8GB 노트북의 첫 검증은 **BE_WORKERS=1**을 추천한다. 기존 코드와 무과금 설정 테스트가 허용한다. D-45의 기본값 3을 바꾸는 구현은 아니며 일회 점검 설정으로 합의한다. 준비할 PDF가 1쪽이면 해설 묶음도 하나라 이 실행의 불필요한 병렬 작업을 줄일 수 있다.
- 1쪽 해설 1회, 분할 1~2회, 설계도 1~4회, TTS는 생성 문장 수만큼(과거 클립당 약 20~25문장). 수정 없는 정상 첫 시도는 해설 1 + 분할 1 + 설계도 1~2 + TTS 약 20~50회가 기준이다.
- 저장소 실측(docs/06)으로 해설 약 $0.003~0.02, 분할 $0.011~0.035, 설계도/클립 $0.024~0.043, 음성/클립 $0.015~0.032. 합계 **약 $0.05~0.21**, 재생성 여유를 포함해 **$0.30 안팎을 검토용 예상액**으로 제시한다. 강제 지출 상한이 아니며 실패·재시도로 초과할 수 있다.
- 공식 단가 확인: [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)는 표준 입력/출력 100만 토큰당 $1/$5. [TTS](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)는 텍스트 입력 $0.60/음성 출력 $12(100만 토큰당). 음성 분당 약 $0.015는 저장소 추정이며 청구서와 같지 않다. TTS는 공식 페이지에 deprecated 표시가 있어 실행 승인 시 사용 가능 여부도 재확인한다.
- 첫 클립 **약 1~4분**, worker 1에서 2개를 순차 생성하면 전체 **약 3~8분**을 관찰 예상으로 잡는다(1차 전체 2~6분 예상에서 병렬 감소를 고려한 추정). 실제 실측·보장·시간 제한이 아니다. SDK 기본 600초와 재시도로 훨씬 길어질 수 있다. 최대 길이 120초도 분할·프롬프트 목표이지 완성 음성의 강제 제한은 아니다.

## 첫 실행 전 필수 조건과 최소 수정 우선순위 (제안, 구현 없음)

- **실행 전 필수:** 사용자가 별도 경로에서 서버 키·잔액·모델 접근을 준비/확인하고, 아래의 전체 자동 생성·내부 재시도·시간/비용 초과 위험을 포함해 일회 실행을 승인한다. 현재 요청은 키 변경과 유료 실행을 허용하지 않는다.
- **재시도 금지의 범위 결정:** 사용자/BE의 재업로드·다른 모드·실패 Job 재시도는 운영상 하지 않을 수 있다. 그러나 SDK는 순간 오류 최대 2회, 분할/설계도는 검사 실패 시 한 번 재생성한다. 후자는 형식뿐 아니라 설계도의 화면 문체 검사도 포함한다. **외부 요청 재시도/재생성까지 0회가 필수라면 지금 실행 불가**이며 AI 담당의 별도 수정·검증이 먼저다. 설정되지 않은 `AI_MAX_RETRIES` 같은 환경변수로 제어할 수 있다고 가정하지 않는다.
- **usage 미저장:** 비용 확인 방법은 첫 실행 전에 반드시 정한다. 일회 소량 검증만이면 제공사 콘솔의 사용 전후·해당 실행 시간대 내역을 별도 대조하는 방안으로 DB 기능 추가를 미룰 수 있으나 팀장 승인이 필요하다. 다른 호출이 섞이면 비용을 분리할 수 없으므로 이 대안은 쓰지 않는다. 직접 비용 확인도 불가능하면 usage 기록 보완 전 실행을 보류한다.
- **최소 코드 보완 1순위 — BE usage 저장:** 기존 계약대로 Job별 단계 usage를 SQLite에 누적하고 다음 유료 단계 전에 보존하는 안. 성공 경로만 기록하면 실패 직전 비용은 빠지므로 AI와 실패 시 usage 전달을 같이 정한다. TTS의 costIsEstimate를 보존하고 실제 청구액으로 단정하지 않는다.
- **최소 코드 보완 2순위 — AI 호출 정책 명시:** llm/blueprint/audio의 클라이언트 생성 지점에서 timeout과 max_retries를 명시하고, 재생성 0회가 요구되면 분할/설계도 반복도 함께 조정하는 안. AI 담당 승인·구현 영역이며 이번에는 수정하지 않았다. 재시도 0회·짧은 종료 시간이 승인 조건이면 이 항목은 실행 전 필수로 올라간다.
- **단계 전체 시간 제한:** 한 번의 관찰 테스트에서 긴 대기를 수용하고 자동 재시도하지 않는다면 첫 실행 전 필수 구현으로 삼지 않는다. 무인/반복 운영 전에 해결해야 하며 Future 대기만 끊는 방식은 외부 호출을 중단하지 못한다. 취소 후 결과 저장·추가 과금 처리까지 설계해야 한다.
- **음성만 재시도:** 첫 실행에서 재시도하지 않는 조건이면 선행 구현이 필요 없다. 향후 재시도를 허용하기 전에 검증된 설계도·문장 캐시를 시도 간 보존해 재사용하도록 BE·AI가 협의한다.
- **첫 실패 후 자동 중단은 미보장:** worker 1이어도 이미 등록된 두 번째 클립은 첫 번째 실패 후 자동 시작할 수 있다. 실패 후 대기 작업도 절대 시작하면 안 되는 조건이면 중단 정책의 별도 구현/승인이 먼저다. 첫 검증은 최대 2개 전체 실행을 수용하는지 합의한다. 긴급 중단 대상은 이번 격리 서버뿐이며 이미 보낸 원격 요청의 과금 중단은 보장하지 않는다.
- 비용 증가 경로: 새 lecture로 중복 업로드, 다른 모드 요청, 사용자 재시도 시 설계도/음성 재생성, SDK 응답 유실 후 재전송, 형식/문체 재생성, 문장 수·출력 토큰 증가, 실패 전 일부 문장 과금. **worker 1은 동시성·메모리를 줄일 뿐 비용 상한은 아니다.**

## 승인 후 실행 절차(이번에는 실행하지 않음)

1. SDK 설치·전체 무과금 검증은 완료했다. 이후 사용자가 별도 승인된 경로에서 서버 키·잔액·모델 권한을 준비/확인한다. 이번 작업은 키를 생성·변경하지 않았다. 승인된 실행 시점에 main 변경·설정·SDK import를 다시 확인한다.
2. Q-BE-04의 사용량 기록·시간 제한/중단·재시도 보완 또는 제한된 첫 검증의 잔여 위험 수용 범위를 합의한다. 기능 수정은 별도 승인·기능 브랜치에서 진행한다. 단순 대기 시간 초과를 원격 호출 취소로 취급하지 않는다.
3. 새로운 TEMP 실행 폴더를 만들고 입력 PDF 사본과 data를 분리한다. **기존 TEAM19_DATA_DIR는 재사용하지 않는다.** 새 포트 8011(BE)/5175(FE)가 비었는지 다시 확인한다. 사용 중이면 해당 프로세스를 건드리지 말고 다른 빈 포트를 고른다.

```powershell
# 승인 후 새 BE 전용 터미널, 저장소 루트에서만 실행할 예시
$team19Python = 'C:/anaconda3/envs/team19/python.exe'
$team19Run = Join-Path $env:TEMP ('team19-e2e-' + [guid]::NewGuid().ToString('N'))
$env:TEAM19_DATA_DIR = Join-Path $team19Run 'data'
$env:AI_MODE = 'real'
$env:AI_PIPELINE_MODULE = 'pipeline'
$env:AI_DESCRIBE_MODEL = 'gpt-6.1-terra'
$env:AI_OUTLINE_MODEL = 'gpt-6.1-terra'
$env:AI_BLUEPRINT_MODEL = 'gpt-6.1-terra'
$env:BE_WORKERS = '1'
$env:SAMPLE_MP4 = '0'
$env:FRONTEND_ORIGINS = 'http://127.0.0.1:5175,http://localhost:5175'
& $team19Python -m uvicorn backend.app:app --host 127.0.0.1 --port 8011 --workers 1
```

4. 새 FE 전용 터미널의 `frontend/`에서 `$env:VITE_API_BASE_URL='http://127.0.0.1:8011'`을 지정한 뒤 `npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort`. 기존 FE 환경 파일이나 실행 프로세스는 변경하지 않는다.
5. 먼저 health=real 확인. 화면의 PDF 분석 비용 확인 후 업로드 **한 번**, lectureId/jobId를 기록하고 ready까지 GET만 한다. 실패하면 멈춰 원인·기발생 비용을 확인한다. 응답 유실 시 재업로드하지 않는다.
6. intro의 생성 비용 확인 후 POST **한 번**. 최대 2개가 등록돼 worker 1에서 순차 실행되는 것을 승인 범위에 포함한다. completed 클립의 resultId·근거 페이지·오디오·자막·동작을 확인하고 나머지 pending/running/failed도 확인한다. 첫 실패에서 추가 업로드·다른 모드·재시도는 진행하지 않는다. 이미 등록된 다음 클립은 자동 시작할 수 있다.
7. 대기 초과 시 기록/조회만 하고 자동 재시도·재시작하지 않는다. 외부 요청 취소/과금 중단은 보장되지 않는다. 긴급 중단은 **이번에 시작한 격리 서버만** 대상으로 하며 D-44는 이후 자동 재개를 막을 뿐 이미 발생한 비용을 취소하지 않는다.
8. 모든 작업이 끝난 뒤 격리 폴더 결과·실행 시간·제공사 사용 내역을 대조한다. 실제 완료 결과로 FE 재생/정지/탐색을 확인한다. 첫 통합 성공 뒤에만 D-50 별도 작업을 검토한다.

## 담당자 협의

- [to:AI,BE] Q-BE-04: SDK 준비·304개 테스트 완료. 비용은 콘솔 대조로 첫 실행을 허용할지 usage 저장을 먼저 할지, 내부 재시도/재생성을 허용할지, 긴 대기와 첫 실패 후 다음 클립 실행을 수용할지 팀장이 결정한다. 엄격한 제한이 필요하면 담당자가 최소 보완 후 검증한다.
- [to:AI,FE] Q-BE-05: worker 1·PDF 1쪽·intro 최대 2개 전체 자동 생성 범위와 두 단계 비용 확인, 첫 실패 시 운영자의 추가 요청 중단, 브라우저 재생 확인을 합의한다. D-45 기본값과 P-FE-12 정식 동의 정책은 임의 변경하지 않는다.
- P-FE-05(MP4), P-FE-09(평가 화면), P-FE-10(개인 도구), 새 P-AI-06(일반 글의 단어 강조)은 의견 수집중이다. 이번 범위에서 추가 구현이나 정책 확정은 하지 않았다. Q-AI-31의 상한/제외 주제 표시도 별도 결정 사항이다.
