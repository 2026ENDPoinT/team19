# P-FE-07: PDF 업로드와 준비 작업 상태 연결

> 상태: 결정됨, 적용 완료(실제 통합 11/14) · 제안: FE/Codex · 2026-11-12 · 의견 마감: 실제 생성 흐름 연결 전

## 무엇을 정하려는가
D-39의 독립 플레이어 다음 단계로 기존 PDF 업로드 화면을 확정 API에 연결한다. 이번 FE 범위는 업로드·자료 준비 완료 확인까지이며 모드별 분할·클립 생성·피드 연결은 다음 단계다. 사용자가 이 범위 진행을 요청했다.

## 구현과 기준
- 파일 선택 후 사용자 버튼에서 POST /lectures를 한 번 보낸다. multipart의 file을 쓰고 Content-Type은 브라우저가 정한다. 연속 클릭·화면 재렌더링으로 중복 전송하지 않는다.
- GET /health의 aiMode가 sample인 서버에서만 이번 연결 확인을 허용한다. 실제 AI 호출은 하지 않는다. health는 BE 실행 안내의 기존 상태 확인 경로이고 새 API/필드를 요구하지 않는다.
- 받은 jobId로 GET /jobs/{id}를 순차 조회한다. 완료 전에는 약 3초 간격(D-21), 완료·실패·이탈 시 중단한다. 임의 퍼센트나 시간으로 완료 처리하지 않는다.
- 완료 후 GET /lectures/{id}의 ready와 페이지 수를 확인하고 모드 선택 화면으로 넘긴다. ‘준비 완료’는 실제 AI 영상 생성 완료를 뜻하지 않는다.
- 조회 통신 오류는 같은 jobId 조회 재개만 제공한다. 업로드 응답 유실은 접수 여부가 불명확함을 알리고 자동 재전송하지 않는다. 이탈은 FE 통신 중단이며 서버 Job 취소로 안내하지 않는다.
- 준비 후 기존 모드/목록/피드 시제품은 시제품으로 표시하고 실제 생성으로 오해하지 않게 한다. 새 모드 정책·API 계약·AI 기능을 확정하지 않는다.

## 역할별 확인 요청
- [to:BE] 기존 준비 API/상태를 사용한다. 샘플 모드 업로드와 상태·오류 흐름의 연동 범위가 맞는지 의견 부탁드립니다. 서버 코드는 FE가 수정하지 않습니다.
- [to:AI] 실제 생성 연결 전에 샘플 준비와 실제 AI 결과를 분리해 표시한다. 모드별 생성·학습 단계 정책은 이번 변경에 포함하지 않습니다.

## 확인 기준
중복 업로드 방지, pending/running/completed/failed, GET 실패 후 동일 작업 조회 재개, 화면 이탈 후 폴링 정지, 취소한 이전 응답 무시, 페이지 수/강의 ID 일치. 모의 응답과 자체 생성한 임시 PDF의 샘플 서버로 확인하며 유료 호출·개인 PDF 업로드는 하지 않는다.

## 의견
### AI

### FE
2026-11-12 FE/Codex: 사용자 요청으로 기존 계약 내 연결을 진행한다. 실제 AI 생성·모드별 결과 연결과 구분하고, 입력 파일을 재전송하는 자동 재시도는 추가하지 않는다.

### BE
2026-11-12 BE/Claude: **샘플 모드 범위에 동의한다. 새 API·필드는 필요 없다.** `preparation.ts`와 `backend/app.py`를 대조하고, 자체 생성 PDF로 `backend/tests/test_integration_flow.py`(AI_MODE=sample, 유료 호출 없음)와 로컬 HTTP(임시 데이터 폴더)를 확인했다. FE 코드는 읽기만 했다.

- **계약 일치:** 업로드 응답 `{lectureId, jobId, status}`, Job `{id, type, status, stage, progress:null, error}`, 완료 후 `GET /lectures/{id}`의 `id`·`status:"ready"`·`pageCount`·`preparationJobId`·`pages[].imageUrl`이 `watchPreparation`의 검사와 맞는다. 페이지 그림 URL은 상대 경로(`/assets/...`)라 FE의 `new URL(…, base)` 처리가 맞다. 샘플의 그림은 원본 캡처가 아닌 대체 그림이다.
- **상태 전이:** `pending(queued)` → `running(starting → extracting → describing)` → `completed(finished)`를 게이트로 멈춰 가며 API로 관찰했다. 앞 작업이 있으면 다음 업로드는 `pending/queued`에서 기다린다. 준비 중 `GET /lectures/{id}`는 `pageCount:null, pages:[]`다.
- **오류:** PDF 아닌 확장자 `415`, `%PDF-` 아닌 내용 `422 INVALID_PDF`는 업로드 응답에서 바로 나오고 강의가 남지 않는다. 헤더만 맞고 깨진 PDF는 `202`로 접수된 뒤 Job이 `failed`/`INVALID_PDF`가 된다(`error.message`는 한국어, 서버 경로 없음). 없는 ID는 `404`(`JOB_NOT_FOUND`, `LECTURE_NOT_FOUND`).
- **이탈:** 화면 이탈은 FE 통신 중단일 뿐 서버 Job은 계속된다. 폴링 없이도 결과가 완료되고 나중에 조회됨을 테스트로 확인했다.
- **BE 버그 수정(feature/be-integration-checks, 미병합):** ① 서버가 재시작되면 시작 전이던 `pending` 작업이 영원히 대기했다 → 재시작 때 다시 실행기에 올린다(실행 중이던 작업은 이전과 같이 자동 재실행하지 않고 `failed/interrupted`, `SERVER_RESTARTED`). ② 실패한 준비를 재시도하면 `preparationJobId`가 옛 작업을 가리켰다 → 최신 작업을 준다(FE의 `preparationJobId !== ticket.jobId` 검사와 직결). ③ 본문 없는 업로드 같은 형식 오류가 `{"detail"}`로 나왔다 → 계약의 `{error:{code,message,retryable}}`로 통일(`INVALID_REQUEST`, 새 코드). 병합 전에는 ①③이 적용되지 않는다.
- **FE 확인 부탁:** 재시작 뒤 `failed`로 보이는 준비 작업은 `POST /jobs/{id}/retry`로 이어 갈 수 있지만, 이번 FE 범위에는 없으니 필요하면 별도 요청해 달라. 이번 확인은 샘플 모드이며 실제 AI 생성 확인이 아니다. 브라우저 조작 확인은 FE 담당이다.

## 결정 (팀장)
