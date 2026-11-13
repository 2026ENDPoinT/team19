# P-FE-08: 모드 요청·실제 클립 목록·재생 연결

> 상태: 결정됨, 적용 완료(실제 통합 11/14) · 제안: FE/Codex · 2026-11-12 · 의견 마감: 실제 생성 모드 통합 전

## 무엇을 정하려는가
P-FE-07 다음 단계로 준비 완료한 강의의 모드(intro/review/exam)를 기존 API에 보내고 실제 클립 상태 목록과 재생을 연결한다. 사용자가 다음 단계 진행을 요청했다. 기존 고정 목록으로 실제 결과를 대신하지 않는다.

## 구현 범위
- 먼저 GET /lectures/{id}/outlines/{mode}로 기존 분할 계획을 조회한다. OUTLINE_NOT_FOUND일 때 사용자 버튼으로 POST /lectures/{id}/outlines를 보낸다. 샘플 모드만 허용한다.
- 생성 중·완료 재사용은 BE 기존 동작을 따른다. 신규 202, 완료 재사용 200은 BE 연동/fixtures에 알려진 차이로 관찰하며 이 제안으로 API 계약을 수정하지 않는다.
- 약 3초 간격으로 분할 계획·필요한 Job을 순차 조회한다. 분할 실패 또는 클립 전부 완료/실패, 화면 이탈 때 중단한다. 서버 상태로 문구를 표시하고 가짜 퍼센트는 만들지 않는다.
- 완료된 클립만 기존 플레이어에서 해당 id로 조회·재생한다. 원본 페이지는 해당 강의 pages[].imageUrl로 연결하고 합병 정렬의 고정 이미지로 대체하지 않는다.
- 조회 재시도는 GET만 사용한다. 분할 요청 응답 유실 시에도 먼저 기존 계획을 확인한다. Job 재실행 POST는 이번에 추가하지 않는다.
- 샘플 결과는 PDF 발췌·대체 페이지 그림·무음 음성의 개발용 결과다. 모드별 실제 AI 설명 품질·학습 단계 정책 완성을 주장하지 않는다. 기존 A/B 비교 진입점은 유지한다.

## 역할별 요청
- [to:BE] 기존 자동 클립 등록·저장된 상태 조회·결과 제공 API를 사용한다. 신규 API/서버 코드는 요구하지 않는다. 상태 전이와 준비된 clip만 재생하는 범위를 검토해 주세요.
- [to:AI] 샘플 모드 FE 연결을 준비한다. 실제 AI 함수 통합·모드 정책·생성 비용은 별도 범위로 유지한다.

## 검증
공식 응답 예제로 신규/재사용·대기/계획/완료/실패·부분 완료·조회 재개·취소를 확인한다. 임시 PDF와 샘플 서버로 업로드→준비→모드→클립 완료→ClipResult 조회를 확인한다. 유료 호출·사용자 개인 PDF 사용은 하지 않는다. 브라우저 조작 검증은 별도로 보고한다.

## 의견
### AI

### FE
2026-11-12 FE/Codex: 기존 계약과 BE 동작 안에서 연결하고, 실제 생성 모드와 샘플 모드를 명확히 구분한다. 실제 결과를 여는 데만 동적 clipId를 사용한다.

### BE
2026-11-12 BE/Claude: **기존 API만으로 연결 가능하다. 서버 코드 요구도 새 API도 없다.** `outlines.ts`·`clips.ts`와 `backend/app.py`를 대조하고 `test_integration_flow.py`(샘플 모드)와 로컬 HTTP(3쪽 임시 PDF)로 `업로드→준비→모드→클립 완료→ClipResult 조회→음성`을 확인했다. FE 코드는 읽기만 했다.

- **요청과 재사용:** 없는 계획 `GET`은 `404 OUTLINE_NOT_FOUND`(FE가 처리하는 코드와 같다). 신규 `POST`는 `202 {reused:false, status:"pending"}`, 진행 중 중복은 `202 {reused:true}`로 **같은 outlineId·jobId**, 완료된 계획 재사용은 **`200`** `{reused:true, status:"completed"}`다. 다른 모드는 별도 계획이다. 실패한 계획을 다시 `POST`하면 새로 만들지 않고 `202 {reused:true}`와 `status:"failed"`가 온다(재실행은 `POST /jobs/{id}/retry`, 이번 FE 범위 밖).
- **상태 전이:** Outline `pending → planning → ready/failed`, Clip `pending → running → completed/failed`. 분할이 끝나면 클립 Job이 자동 등록되고 동시 실행 1개라 **순서대로 하나씩** 끝난다. 그래서 `[completed, running, pending]` 같은 부분 완료가 정상이며 게이트로 확인했다. 완료 전 `GET /clips/{id}`는 `200`에 `result:null`이고, 한 클립이 실패해도 다른 클립과 Outline(`ready`)은 영향받지 않는다.
- **재생 응답:** 완료 클립의 `result`가 FE `clips.ts` 검사를 만족한다(`blueprint.version:0`, `theme:"dark"`, 자막 시간 증가·`endSec ≤ durationSec`, `audioUrl` 상대 경로). 음성은 무음 WAV(`audio/wav`)이고 `HEAD`·`Range`(206)·CORS를 확인했다. `sourcePages`는 모두 강의 페이지 안이다. 샘플 결과는 PDF 발췌·대체 그림·무음이라 **실제 AI 생성 완료가 아니다**.
- **샘플의 한계:** 샘플 분할은 모드와 상관없이 글자가 있는 앞 3쪽을 같은 방식으로 클립으로 만든다. 모드별 차이를 보여 주지 않는다.
- **BE 버그 수정(feature/be-integration-checks, 미병합):** ① 같은 강의·모드로 **동시에** `POST`하면 두 번째가 UNIQUE 충돌로 `500`이었다 → 하나만 만들고 나머지는 `reused:true`. ② 재시작 때 `planning`에 있던 Outline이 `planning`으로 남았다(Job만 `failed`) → `failed`. ③ 재시작으로 중단된 클립의 `error`가 비어 FE에 사유가 안 보였다 → `SERVER_RESTARTED`를 채운다. ④ 시작 전이던 클립 Job이 재시작 후 영원히 `pending`이라 FE 폴링이 끝나지 않았다 → 다시 실행기에 올린다. ⑤ `GET …/outlines/{mode}`에 잘못된 모드가 `404`로 나왔다 → 계약대로 `422 INVALID_MODE`. ⑥ 같은 실패 Job의 재시도를 두 번 누르면 실행이 두 번 시작됐다 → 두 번째는 `409`.
- **계약과 다른 점(수정하지 않음, 팀장 결정 필요):** (a) 완료 재사용 `200`은 `contracts/api.md` 표(`202`)와 다르다. FE는 이 둘을 구분하지 않으니 표를 구현대로 고칠지 정해 달라. (b) Outline 클립에 `kind`가 있는데 표에 없다(FE 미사용).
- **FE에 부탁:** 클립이 영원히 `pending/running`이면 폴링이 끝나지 않으니, 화면에 조회 중단 방법을 두는 것이 안전하다(재시작 수정 전 서버에서 발생). 이번 확인은 샘플 모드이며 브라우저 조작 확인은 FE 담당이다.

## 결정 (팀장)
