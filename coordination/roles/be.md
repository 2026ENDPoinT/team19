# 역할: 백엔드 (BE)

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-13 · BE/Codex

> 이 파일은 BE 역할만 고친다. 다른 역할은 읽기만 하고, 요청은 `questions.md`에 남긴다.
> 아래 "책임"은 팀장이 쓴 초안이다. BE 담당자가 자기 에이전트와 검토하고 고쳐서 확정한다.

- 담당: 김하형
- 도구: Codex (이번 세션; 이전 Claude Code 작업 이력은 아래 참조)

## 책임 (초안)

- API 설계와 구현 (`contracts/api.md` 초안 담당)
- 데이터 모양 초안 (`contracts/data-model.md`, 설계도 부분 제외)
- PDF 업로드 받기, 파일과 결과 저장
- 오래 걸리는 작업 관리 (접수, 진행 상태, 실패 처리, 재시도)
- AI 파이프라인 호출
- 시연 환경 (노트북 실행 또는 배포), 네트워크가 끊길 때를 위한 시연 모드
- API 키를 서버에서 안전하게 쓰기

## 다른 역할에게 주는 것

- FE에게: API, 샘플 응답
- AI에게: 업로드된 PDF에 접근하는 방법, 결과 저장 방법

## 다른 역할에게서 받는 것

- FE에게서: 화면에 필요한 데이터 목록
- AI에게서: 파이프라인을 부르는 방법, 샘플 결과

## 1단계 완료 기준 (초안)

PDF를 올리면 작업이 접수되고, 진행 상태를 확인할 수 있고, 완성된 클립 결과를 API로 받을 수 있다. 서버를 다시 켜도 결과가 남아 있다.

---

## 현황 (세션마다 갱신)

> 최종 갱신: 2026-11-14 · BE/Claude

### 최근 한 일

- **(11/14 · BE/Claude) BUG-FE-01 재발 조사·수정(`feature/be-pymupdf-requirement`).** 이 PC에서는 BE·AI 추출기 모두 원본 한글이 정상(PyMuPDF 2.1). `backend/requirements.txt`에 PyMuPDF가 없어 그것만 설치한 PC는 조용히 pypdf로 대체되는 구조를 확인하고 requirements·시작 경고·README를 고쳤다. 재발 PC의 실제 원인·DB 단계 비교는 미확인([Q-FE-08](../questions.md) BE 답 참조).

- **(11/14 · BE/Claude) D-50 FE 연동 점검·D-57 호환·시연 연결 준비(무과금).** FE `X-Owner-Id` 이름·형식(16~64자)이 BE와 일치함을 코드로 확인했다. D-57의 클립 계획 `mode`가 `plan_json`→`make_blueprint`(재시도 포함)까지 보존됨을 테스트 5개로 고정했다(기존 계획에 `mode`가 없어도 동작). 두 노트북 연결은 [DEMO-NETWORK.md](../../backend/DEMO-NETWORK.md)에 정리했고 CORS 테스트 4개를 추가했다. **실제 두 기기 연결은 미수행.** 시연 화면 주소·Pages 문제는 [Q-BE-08](../questions.md).

- **(11/14 · BE/Claude) D-50 최소 구현(`feature/be-personal-library`, main 병합 `64fadd4`).** `lectures.owner_id` 열 추가(기존 DB 보존), 업로드가 `X-Owner-Id` 저장, `GET /lectures`는 그 주인 것만(헤더 없으면 `[]`, 형식 오류는 422). 다른 API·`/assets` 접근 통제는 없음. 신규 테스트 14개 포함 BE·AI 342개 통과(유료 호출 없음). 계약은 [api.md](../../contracts/api.md)에 한계와 함께 기록. 팀장이 1안을 확정해 병합했다. FE 연동(목록 헤더·강의함 화면)은 FE 확인 전까지 미완료([Q-BE-07](../questions.md)).

- **(11/14 · BE/Claude) Q-FE-14 BE 판단·D-50 설계.** 문장별 근거 페이지는 BE가 이미 보존함을 가짜 AI 테스트로 확인(`feature/be-line-source-check`, 미병합)하고 [P-FE-14](../proposals/P-FE-14-sentence-source-page.md)에 BE 의견을 남겼다. D-50은 사전 구현 허가 기록이 없어 코드 없이 설계·위험 분석만 [P-AI-05](../proposals/P-AI-05-personal-library.md) BE 의견에 적고 [Q-BE-06](../questions.md)으로 팀장 결정을 요청했다. 유료 호출 없음.

- **(11/13 · BE/Claude) usage 기록 검토·병합, 첫 유료 통합은 키 없어 미실행.** Codex의 `feature/be-usage-records`(`job_usage`, [설명](../../backend/USAGE-RECORDS.md))를 diff로 검토해 치명 문제가 없음을 확인하고 최신 main(`5881100`)과 충돌 없이 병합했다. 전체 BE·AI 326개 통과(병합 전후). **유료 호출 0회:** OPENAI/ANTHROPIC 키가 프로세스·Windows 환경변수·루트 `.env`에 없어 업로드·생성·서버 실행을 하지 않았다. 생성 클립·재생·콘솔 비용은 미검증이다([Q-BE-05](../questions.md) 답 참조).
- **(11/13 · BE/Codex) D-44·D-45 구현 완료(`979f754`).** sample pending 자동 재개를 유지하고 real 재시작 시 pending/running 작업과 대상 상태를 `SERVER_RESTARTED`로 실패 처리한다. 명시적 재시도·원자적 Job 실행은 보존한다. `AI_MODE`는 sample/real만 허용하며 real 작업 스레드는 기본 3개(`BE_WORKERS` 1~3), sample은 기존 기본 1개(1~4)다. 서버 프로세스는 1개로 운영해야 한다.
- **(11/13 · BE/Codex) BUG-FE-01 수정 및 사용자 확인.** sample 추출을 PyMuPDF 우선으로 바꾸고 ImportError/DLL 로딩 실패 때만 pypdf로 대체한다(품질 경고). 사용자 원본 비교에서 pypdf의 한글 깨짐이 확인됐고, 동일 PDF 새 업로드 후 사용자 FE 화면의 제목 1~3번이 정상이었다. 사용자 확인 환경: PyMuPDF 2.1, sample, 새 임시 데이터 폴더. 신규 14개 포함 전체 303개 테스트 통과(유료 호출 없음). 기존 저장 결과는 자동 복구되지 않아 재업로드가 필요하다. 근거·검증 범위는 [Q-FE-08](../questions.md#q-fe-08--toai-be--열림)에 기록했다. 실제 AI 전체 통합은 아직 검증하지 않았다.
- 아래 11/12 이하는 당시 조사·검증 이력이다. BUG-FE-01 원인 미확정·추출기 유지 판단은 위 11/13 결과로 갱신됐다.
- **(11/13 · BE/Codex) 최신 main 회귀 검증.** main `2913a2e`를 충돌 없이 병합한 뒤 전체 304개 테스트가 통과했다. 기존 303개에 AI 담당 신규 검사 테스트 1개가 추가된 결과다. 유료 호출 없이 격리된 임시 DB로 검증했다.
- **(11/12) FE 업로드·클립 흐름 통합 검증 (샘플 모드, 유료 호출 없음).** main `3c6c473` 기준. P-FE-07/08의 BE 의견을 남겼다. `업로드→준비→모드→클립 완료→ClipResult→음성`을 `backend/tests/test_integration_flow.py`(신규 20개)와 로컬 HTTP(임시 데이터, 포트 8010)로 확인했고 FE 요청·응답 필드와 맞다. 샘플 결과는 PDF 발췌·대체 그림·무음이며 실제 AI 생성이 아니다.
- **(11/12) Q-AI-28 BE 호환 수정(`feature/be-ai-compat`, main 병합·Push 완료).** ① 실제 AI 모드 기본 모듈을 `pipeline`으로(환경변수 우선) ② 어댑터가 AI의 `PipelineError` 클래스를 `isinstance`로 구분해 `{code,message,retryable}` 보존, 그 밖의 예외는 `INTERNAL_ERROR`. 가짜 AI 모듈·격리 데이터 폴더로 전체 흐름·오류·계획 ID(`plan_json`의 `c1`·`prerequisites` 보존) 확인, 신규 29개, 전체 250개 통과(이전 221). 유료 호출·실제 AI 함수 실행 없음. **가짜 AI 모듈을 통한 호환성 검증이며 실제 AI 파이프라인 통합 완료가 아니다.** 결정 필요 사항(`pending` 자동 재개, `AI_MODE` 검증, 동시 실행·동의)과 차이 3가지는 Q-AI-28 BE 답변에 정리했다.
- **(11/12) Q-FE-08 정밀 점검(조사·기록만, 코드 변경 없음).** 실제 PDF 4종(07_software_evolution 33쪽, `local-data` 업로드 3건)을 격리 폴더에서 PDF→`pypdf`→DB→`clips.title`→API까지 글자 단위로 비교했고 BE 저장·응답 단계 손실은 없었다. `pypdf`가 줄 사이 공백을 지워 `Software EngineeringChapter …`가 되는 현상은 재현했다. 스크린샷 원본·AI의 굿노트 PDF는 없어 원인 미확정이며, `KSCms-UHC-H`+대응표 없음 합성 PDF에서만 `pypdf`가 깨지고 `PyMuPDF`는 정상이었다(가설). 결과는 Q-FE-08 BE 답에 기록했다. 회귀 pytest 221개 통과(`backend/tests`+`pipeline/tests`, AI 추가분 포함).
- **(11/12) 찾아서 고친 BE 문제 6개** (`feature/be-integration-checks`, main `403dc83`에 병합·Push 완료): 재시작 후 시작 전 `pending` 작업이 영원히 대기 · 재시작 후 Outline `planning` 잔류 · 중단 클립의 `error` 공백 · 재시도 후 `preparationJobId`가 옛 작업 · 같은 강의·모드 동시 `POST` 500 · 같은 실패 Job 재시도 중복 실행. 계약과 어긋난 `GET …/outlines/{잘못된 모드}`(404→422)와 형식 오류 응답(`{detail}`→`{error}`, 새 코드 `INVALID_REQUEST`)도 맞췄다.
- **(11/12) Q-AI-27:** 새 이름 없이 기존 `stage`·Job `type`을 `contracts/api.md`에 표로 문서화하고 화면 문구를 제안했다. **Q-FE-08:** 원본 PDF가 없어 원인 미확정으로 기록했다(합성 PDF 비교만 했다).
- 전체 pytest 204개 통과(`backend/tests`+`pipeline/tests`, 이전 184 + 신규 20). 기본 pytest 임시 폴더가 권한 오류라 `--basetemp`를 지정해 실행했다. httpx 경고 1건 유지.
- 실제 A/B 제공(`689553d`)과 공식 fixtures·통합 테스트 안정화(`6b7b155`)를 main에 반영·Push했다. [연동 안내](../../backend/INTEGRATION-NOTES.md)를 FE에 공유했고 Q-BE-02/03에서 확인했다.
- `backend/fixtures/`에 66개 개발용 사례를 보존하고 계약 구조 일치 59개·과거 사례 7개를 구분했다. sandbox 원본은 보존하며 실제 플레이어에 fixtures import를 요구하지 않는다. 변경·삭제 전 FE와 협의한다(Q-FE-03).
- 원본 페이지 PNG 6개 제공을 main `6970e46`에 병합·Push했다. 기존 `GET/HEAD /assets/{id}`를 쓰며 A/B는 `clip-01-page-018`~`020`, parts-test는 `parts-test-page-031`~`033`이다. 전체 pytest 178개 통과(BE/Claude 재실행), 이미지 6개·MP3/WAV 3개 HTTP 응답을 확인했다. 유료 호출 없음, 기존 httpx 경고 1건은 남아 있다. 이전 147개·117개 통과는 이전 기록이다.
- 최신 main(`8ac9e82`)의 v3 A/B를 확인했다. clip-01은 `clip-01-A-sonnet-cedar-v3` 178.15초, clip-01-b는 `clip-01-B-terra-cedar-v3` 88.8초다. 저장 원본 result.json과 API의 blueprint·captions·resultId·durationSec이 일치하고, MP3 바이트도 HTTP 응답과 같다. 재생 길이(178.20초, 88.84초)와 Range 206·HEAD도 정상이다. 전체 pytest 184개 통과(`backend/tests`+`pipeline/tests`, 유료 호출 없음, httpx 경고 1건 유지).
- 이전 싱크 문제의 해결 기록은 D-40과 [P-FE-04](../proposals/P-FE-04-clip-sync-review.md)를 따른다.
- P-AI-04: 장면별 `speech` 칸이 BE 검증·저장·제공에서 보존됨을 임시 데이터로 확인하고 BE 의견을 남겼다. 구현은 하지 않았다.
- (11/12 당시) 실제 AI 생성 통합 전 상태였다. 현재는 D-44·D-45 안전 조치를 구현했으며 실제 AI 첫 전체 통합 검증이 남아 있다.

### 다음 할 일

- 팀장이 서버 키를 준비하고 잔액·모델 접근을 확인하면 Q-BE-05 계획(PDF 1쪽·intro·BE_WORKERS=1·새 TEMP·8011/5175)대로 업로드·생성 각 1회만 실행하고 결과를 기록한다. 실패 시 usage 전달은 Q-BE-04(AI)의 열린 요청이다.
- 최신 FE·BE 병합본의 실제 AI 첫 통합은 별도 실행 승인 후 진행한다. 기본 Conda 환경의 AI SDK 의존성, FE 실제 생성 동의 동선, 새 데이터 폴더, Uvicorn 단일 프로세스·자동 재시작 해제를 먼저 확인한다. 이번 자동 테스트는 임시 SDK 경로와 가짜 AI를 사용했다.
- D-50 개인별 강의함은 실제 AI 첫 통합 뒤 별도 승인 작업으로 남긴다.
- 팀장 결정 필요: `POST …/outlines` 완료 재사용이 `200`인 것을 계약 표에 반영할지(P-FE-08 BE 의견).
- FE와 실제 브라우저 재생·정지·탐색·반복·전환을 확인한다(Q-BE-02/03). A s4~s6, B s3~s4의 화면 이어 쓰기와 자막/동작 복원을 포함한다.
- (싱크 재검증은 D-40, P-FE-04 기록 참조. 필요하면 FE 요청 시 지원한다.)
- B·parts-test와 정지·탐색·반복 동작 확인을 FE와 이어간다. `samplePages.ts` API URL 전환은 FE와 협의한다(FE 담당 파일).
- 11/11 피드백 시연용 BE 서버 안정성을 점검한다(샘플 모드, 인터넷·유료 호출 없이 저장 결과 재생).
- API 또는 미디어 제공 문제가 생기면 BE 담당 코드만 수정한다. 11/11 이후 업로드→실제 AI 생성 통합은 별도 작업이다.

### 막힌 것

- PyMuPDF를 불러올 수 없는 PC에서는 pypdf로 대체하지만 한글 품질을 보장하지 않는다. 실제 AI 전체 통합은 미검증이며 SDK·실행 동의·단일 서버 프로세스 준비가 필요하다. 기존 데이터 폴더를 재사용하지 않는다.
- 남은 검증은 FE 실제 브라우저 동기화다. 저장된 샘플 이미지 API는 BE 구현을 마쳤고 FE 전환만 남았다. A/B 본문은 slides를 쓰지 않아 이미지 없이 재생 가능하다. A-marin은 이번 API에서 제외했다.

### 다른 역할에게 요청

- [to:FE] P-FE-07/08의 BE 의견과 Q-AI-27의 단계 표·문구 제안을 확인해 주세요. 새 API는 필요 없습니다. 재시작 수정은 main에 병합됐습니다.
- [to:FE] Q-FE-08의 BE 수정·사용자 실검증 결과를 확인하고 FE 담당 BUG-FE-01 문서의 후속 상태를 정리해 주세요. 기존 결과는 재업로드가 필요합니다.
- [to:AI,FE] D-44·D-45 안전 조치 후에도 실제 AI 전체 통합은 미검증입니다. 최신 FE 실제 생성 동선과 AI SDK·계약을 함께 확인한 뒤 별도 승인된 첫 실행이 필요합니다.
- [to:FE] Q-BE-02/03에서 B·parts-test와 정지·탐색·반복의 브라우저 확인 결과가 있으면 알려 주세요. BE A/B 기능은 이미 main에 공유됐습니다. 같은 응답의 resultId·설계도·자막·음성을 묶어서 사용합니다.
- [to:FE] 공식 fixtures는 [안내](../../backend/fixtures/README.md)를 참고해 주세요. 변경·삭제 전 협의하며, 이미지 API는 main에 반영됐으니 FE의 API 매핑 전환 시점을 함께 협의합니다.
