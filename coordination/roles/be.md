# 역할: 백엔드 (BE)

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-12 · BE/Claude

> 이 파일은 BE 역할만 고친다. 다른 역할은 읽기만 하고, 요청은 `questions.md`에 남긴다.
> 아래 "책임"은 팀장이 쓴 초안이다. BE 담당자가 자기 에이전트와 검토하고 고쳐서 확정한다.

- 담당: 김하형
- 도구: Claude Code (2026-11-10부터, 이전 Codex)

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

> 최종 갱신: 2026-11-12 · BE/Claude

### 최근 한 일

- **(11/12) FE 업로드·클립 흐름 통합 검증 (샘플 모드, 유료 호출 없음).** main `3c6c473` 기준. P-FE-07/08의 BE 의견을 남겼다. `업로드→준비→모드→클립 완료→ClipResult→음성`을 `backend/tests/test_integration_flow.py`(신규 20개)와 로컬 HTTP(임시 데이터, 포트 8010)로 확인했고 FE 요청·응답 필드와 맞다. 샘플 결과는 PDF 발췌·대체 그림·무음이며 실제 AI 생성이 아니다.
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
- 모드별 실제 AI 생성 연결은 현 개발 단계 범위 밖이다. 시제품의 모드 선택·클립 목록·고정 생성 실패 예시는 버그나 실제 AI 장애로 보지 않는다.

### 다음 할 일

- Q-FE-08 점검 기록을 사용자가 검토한 뒤 문서를 main에 올린다(아직 미커밋). 스크린샷의 Software Engineering PDF나 AI가 쓴 `05_architecture_design_impl.pdf`(또는 깨진 쪽만 낸 PDF)를 받으면 같은 방식으로 원본·`pypdf`·`PyMuPDF`·DB 텍스트·제목을 비교한다. 추출기 우선순위 변경·깨짐 감지·재처리는 원인 확인 뒤 제안서로 낸다(구현 안 함).
- Q-AI-28(AI_PIPELINE_MODULE 기본값, 오류 클래스 인식, plan id) 확인은 아직 하지 않았다. 사용자 요청이 있을 때 진행한다.
- 팀장 결정 필요: `POST …/outlines` 완료 재사용이 `200`인 것을 계약 표에 반영할지(P-FE-08 BE 의견).
- FE와 실제 브라우저 재생·정지·탐색·반복·전환을 확인한다(Q-BE-02/03). A s4~s6, B s3~s4의 화면 이어 쓰기와 자막/동작 복원을 포함한다.
- (싱크 재검증은 D-40, P-FE-04 기록 참조. 필요하면 FE 요청 시 지원한다.)
- B·parts-test와 정지·탐색·반복 동작 확인을 FE와 이어간다. `samplePages.ts` API URL 전환은 FE와 협의한다(FE 담당 파일).
- 11/11 피드백 시연용 BE 서버 안정성을 점검한다(샘플 모드, 인터넷·유료 호출 없이 저장 결과 재생).
- API 또는 미디어 제공 문제가 생기면 BE 담당 코드만 수정한다. 11/11 이후 업로드→실제 AI 생성 통합은 별도 작업이다.

### 막힌 것

- 데스크톱의 PyMuPDF DLL 차단 이력과 업로드 pypdf 경로는 유지한다. 업로드에서 생성한 대체 그림과 달리 Q-BE-01의 원본 PNG는 AI가 제공 완료했다(18~20쪽, 31~33쪽). PNG 파일 제공 요청은 더 이상 미해결 사항이 아니다.
- 남은 검증은 FE 실제 브라우저 동기화다. 저장된 샘플 이미지 API는 BE 구현을 마쳤고 FE 전환만 남았다. A/B 본문은 slides를 쓰지 않아 이미지 없이 재생 가능하다. A-marin은 이번 API에서 제외했다.

### 다른 역할에게 요청

- [to:FE] P-FE-07/08의 BE 의견과 Q-AI-27의 단계 표·문구 제안을 확인해 주세요. 새 API는 필요 없습니다. 재시작 수정은 main에 병합됐습니다.
- [to:AI] Q-FE-08: `pypdf`와 `PyMuPDF`의 차이를 합성 PDF로 재현했습니다. 실제 파일 대조를 위해 `05_architecture_design_impl.pdf` 13쪽의 글꼴 정보(`/Encoding`, `/ToUnicode` 유무)를 알려 주세요.
- [to:전원] Q-FE-08 원인 확정을 위해 문제의 PDF(또는 깨진 쪽만 낸 PDF)가 필요하면 사용자 동의 아래 BE에 전달해 주세요. FE에 추가 확인은 요청하지 않습니다.
- [to:FE] Q-BE-02/03에서 B·parts-test와 정지·탐색·반복의 브라우저 확인 결과가 있으면 알려 주세요. BE A/B 기능은 이미 main에 공유됐습니다. 같은 응답의 resultId·설계도·자막·음성을 묶어서 사용합니다.
- [to:FE] 공식 fixtures는 [안내](../../backend/fixtures/README.md)를 참고해 주세요. 변경·삭제 전 협의하며, 이미지 API는 main에 반영됐으니 FE의 API 매핑 전환 시점을 함께 협의합니다.
