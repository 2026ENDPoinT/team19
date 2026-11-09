# FE용 API·미디어 샘플

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-08 · BE/Codex

**실제 AI 호출 결과가 아닌 개발용 수작업 샘플이며 최종 계약 전이다.** [P-BE-02](../../../coordination/proposals/P-BE-02-api-and-pipeline-v0.md)의 응답 후보를 사용한다. 서버·AI 파이프라인 구현이나 계약 확정을 뜻하지 않는다. Q-AI-05의 기존 답변은 변경하지 않았다.

## 바로 사용하기

- [cases.json](cases.json): 66개 요청·응답 사례. `cases`에서 `name`으로 선택하고 `response.status`를 HTTP 상태 코드, **`response.body`만** API 응답 본문으로 사용한다. `notice`, `name`, `request`, `response`는 샘플 정리용이며 API 필드가 아니다.
- [manifest.json](manifest.json): 시나리오별 사례 이름 순서(`flows`), 미디어 매핑(`assets`), 재사용한 설계도 출처와 해시. `mixed`는 여러 클립의 동시 상태를 보는 독립 화면이며 A·B에서 이어지는 자동 실행 기록이 아니다.
- `media/`: 테스트 페이지 PNG 4장과 **음성이 아닌** 32.25초 PCM WAV 신호음 1개. 원본 PDF·실제 TTS 샘플은 저장소에 없었다. 외부 API 없이 `build.ps1`로 합성했다.

FE에서 JSON을 불러온 뒤 응답을 흉내 내는 최소 예시(파일 불러오기 경로는 FE 프로젝트 위치에 맞춘다):

```ts
const sample = fixtures.cases.find(c => c.name === 'clip.completed')!;
const response = new Response(JSON.stringify(sample.response.body), {
  status: sample.response.status,
  headers: { 'Content-Type': 'application/json' },
});
// 실제 요청이 아닌 샘플 Response. 오류 사례는 response.ok가 false다.
```

| 확인할 화면 | 사례 이름 |
|---|---|
| 업로드·분석 진행·완료 | `upload.accepted`, `prepare.*`, `lecture.processing`, `lecture.ready` |
| 접수 후 PDF 분석 실패 | `upload.bad.accepted`, `prepare.bad.*`, `prepare.failed` |
| 모드별 분할 진행·조회 | `outline.review.*`, `outline.intro.*`, `outline.exam.*` |
| 전체 등록 / 첫 클립만 등록 | `outline.review.A.registered` / `outline.review.B.registered` |
| 완료·실행·대기·실패·미등록 혼합 | `outline.review.mixed`, `clip.*` |
| 설계도·자막·미디어 한 세트 | `clip.completed` (`clip_01` → `plan_01` → `res_01`) |
| 재시도 및 중복 재시도 거절 | `retry.accepted`, `retry.pending/running/failed`, `outline.review.retrying`, `retry.conflict` |
| 재시작으로 중단된 작업 | `restart.failed` (`job_04`) |
| 요청 오류 | `upload.too-large/unsupported/invalid/storage`, `*.not-found`, `outline.not-ready/invalid-mode` |

같은 경로의 사례는 **독립 스냅샷/선택 가능한 분기**다. 전체 파일 순서대로 재생하지 않는다. `manifest.flows`의 시나리오 하나를 선택한다. A·B는 작업 등록 차이만 재현한다. B의 추가 선택 생성 API는 미정이므로 만들지 않았다. 원본 추출 `job_01`과 `lec_01`은 세 모드가 공유한다(D-12).

`review`는 P-BE-02의 예시 값이며 `intro`·`exam`은 모드별 화면 비교를 위한 **샘플 전용 임시 값**이다. 모드의 실제 허용값은 AI 확인 전이다. `processing`, Job 종류·단계명(`prepare_lecture`, `generate_clip`, `extracting`, `audio` 등), `TTS_FAILED` 오류 코드도 미확정 예시다. `build_outline`·`planning` 등 기존 제안 값과 구분해 계약 확정 때 맞춘다. `reused.ready`는 P-BE-02의 완료된 중복 요청을 접수 응답과 같은 식별 필드로 표현한 샘플이며 실제 최종 응답 모양은 미정이다.

## 파일 URL과 로컬 파일

| 응답 안의 URL 후보 | 이 폴더 기준 실제 파일 | 형식 |
|---|---|---|
| `/assets/img_31` | `media/page-31.png` | `image/png` |
| `/assets/img_32` | `media/page-32.png` | `image/png` |
| `/assets/img_33` | `media/page-33.png` | `image/png` |
| `/assets/img_52` | `media/page-52.png` | `image/png` |
| `/assets/audio_01` | `media/test-tone.wav` | `audio/wav` |

**현재 위 `/assets/...`에 응답하는 서버는 없다.** 디스크 경로를 URL로 취급하지 않는다. 즉시 확인하려면 파일을 브라우저에서 선택하여 `URL.createObjectURL(file)`로 만든 임시 주소를 매핑하거나, FE가 자기 개발 서버의 정적 파일 폴더에 미디어를 임시 복사해 실제 제공되는 URL을 매핑한다. 임시 복사본은 저장소에 중복 커밋하지 않는다. FE의 정적 파일 제공 경로가 정해지기 전에는 구체적인 접속 주소를 보장하지 않는다.

신호음은 자막마다 3초 재생, 문장 사이 0.25초 무음이다. 자막 시간은 인위적으로 지정했고 마지막 문장 끝은 32.25초다. 같은 결과의 설계도·음성·자막 연결, 정지·탐색·반복의 기계적인 확인에만 쓴다. 실제 한국어 발화와 자막의 일치·TTS 품질·문장별 실제 길이는 검증할 수 없다. 장면 전환·문장 공백·동작 완료 규칙도 확정하지 않는다.

설계도는 [P-AI-02의 개념 샘플](../../ai/blueprint_v0/sample1_concept_quicksort.json)을 변경 없이 삽입했다. 나머지 [과정·MVC 샘플](../../ai/blueprint_v0/)은 원본을 직접 사용한다. 페이지 이미지는 원본 슬라이드가 아닌 표시·잘라내기용 합성 도형이며 그림 안에도 표시했다. `pageCount:57`과 페이지 번호는 기존 설계도 연결용이고 `pages`는 참조하는 4쪽만 담은 목록 예시다.

## 실제 서버 연결 시 확인할 것

상세 처리·복구 정책은 P-BE-02를 참조한다. 아래는 FE 연결 점검용이다.

| 항목 | 연결 준비·남은 확인 |
|---|---|
| CORS | 서로 다른 포트의 접근을 브라우저가 허용하도록 하는 설정이다. FE `http://localhost:5173`, BE `http://localhost:8000`은 **설명용 예시**다. BE에서 실제 FE origin(프로토콜·호스트·포트)을 명시하고 GET·POST·HEAD, Content-Type·Range 등을 허용하도록 검토한다. `localhost`와 `127.0.0.1`도 구분한다. 인증 없는 현재 후보에서는 credentials를 끄고, 필요해지면 재협의한다. OPTIONS 사전 확인은 CORS 처리기가 맡는다. [FastAPI 공식 문서](https://fastapi.tiangolo.com/tutorial/cors/) |
| API·미디어 기준 주소 | FE 환경 설정으로 API 기준 주소를 분리한다. 실제 BE가 생긴 뒤 `new URL(audioUrl, apiBaseUrl)`처럼 `/assets/...`를 **BE 기준**으로 해석한다. FE 기준으로 붙이면 다른 포트에 요청하게 된다. 샘플 사용 중에는 위 파일 매핑을 적용한다. 절대 URL이 반환되면 그대로 사용한다. |
| 탐색·HTTP Range | Range는 파일의 필요한 바이트 구간만 받는 요청이다. PCM WAV 파일의 헤더·길이는 검사했지만 **HTTP 제공·브라우저 탐색은 아직 미검증**이다. 서버 구현 시 Content-Type·Content-Length, `Accept-Ranges: bytes`, 유효 범위의 206·Content-Range, 잘못된 범위의 416을 확인하고 실제 `<audio>` 앞뒤 탐색을 검사한다. JavaScript에서 읽을 응답 헤더는 CORS expose 설정도 검토한다. 현재 Starlette FileResponse는 Range 처리를 지원하지만 설치 버전과 실제 경로에서 다시 검증해야 한다. [공식 문서](https://starlette.dev/responses/#fileresponse), [Range 설명](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests) |
| 약 3초 폴링 | Job의 pending/running 동안 약 3초마다 조회하고 completed/failed 또는 화면 이탈 시 중단한다. 분할 Job 완료 후 Outline을 조회하여 클립별 상태를 갱신한다. 활성 생성 작업이 남은 동안만 갱신하며 `jobId:null`인 pending만 남은 B안에서는 무한 조회하지 않는다. `progress:null`은 단계만 표시한다. 예상 시간·퍼센트는 만들지 않는다. |
| 실패 구분 | HTTP 200 + `status:failed`는 저장된 작업 실패다. `result:null`만으로 실패를 판단하지 않는다. HTTP 4xx/5xx의 `error`는 요청 실패, 연결 끊김·CORS 차단은 응답 본문이 없을 수 있는 통신 실패다. 통신 실패만으로 Job을 실패로 확정하거나 생성·재시도를 자동 POST하지 않는다. |
| 재시도·복귀 | 실패 작업의 retryable을 보고 명시적으로 재시도하며 새 jobId·retryOf를 추적한다. FE는 lectureId·mode·jobId와 필요 시 clipId를 보존하고 재조회한다. BE는 원본·추출물·모드/계획/클립 관계·Job 대상/시도/이전 시도/시각/상태·resultId별 설계도/시간/파일 참조를 영구 저장해야 한다. 미실행·중단 작업 정리는 P-BE-02를 따른다. 샘플에는 DB·재시작 복구 구현이 없다. |

CORS·Range는 용어집 추가 후보로 제안한다. 공용 문서는 이번 작업에서 수정하지 않는다.

## 재생성·검증

저장소 루트의 Windows PowerShell에서 실행한다. 설치나 외부 통신은 없다. 스크립트는 Windows PowerShell의 한글 처리를 위해 UTF-8 BOM으로 저장했다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File sandbox/be/fe-fixtures/build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File sandbox/be/fe-fixtures/validate.ps1
```

검증 범위: JSON 구문, 사례 이름·ID 연결, Job·Clip 상태와 전이, 미등록 클립·A/B 등록 수, 재시도 연결, 원본 설계도와의 일치, 장면/부품/동작 참조, 페이지·좌표, 전체 문장과 자막의 일대일 대응·시간 순서·WAV 실제 길이·이미지 읽기. **제품용 공통 검사기가 아니며 내용의 정확성이나 전체 설계도 규칙을 보장하지 않는다.** 기존 AI 검사기 `validate.js`는 Node.js 실행 환경이 없어 실행하지 못했다. 여기서는 재사용한 설계도에 대해 위 연결을 별도 검사한다.

2026-11-08 검증: 66개 사례·9개 시나리오·5개 미디어 통과. 임시로 삽입한 JSON 구문·Job 참조·상태·자막 참조·음성 길이 오류 5종을 모두 거부했고 원본 복원 후 다시 통과했다. PNG 표시도 확인했다. HTTP·브라우저 재생은 위 표대로 미검증이다.

## 기존 AI 답변 대기

[P-BE-02의 AI 의견 칸](../../../coordination/proposals/P-BE-02-api-and-pipeline-v0.md)은 비어 있다. 새 질문은 만들지 않는다. 기존 확인 요청은 다음과 같다.

- 한국어 PDF 추출 담당 경계, Python 모듈 입력·출력·호출 방식·오류·시간 제한.
- 공통 검증·잘못된 설계도 재생성 책임과 횟수, 검증된 설계도를 보존한 음성만 재시도 가능 범위.
- 실제 설계도·음성·문장별 시간이 연결된 결과 샘플, 모드·종류 값과 좌표·시간 기준.

Q-AI-05 A안 최종 결정, 실제 처리 시간·API 한도에 따른 동시 수와 비용 상한은 계속 협의 사항이다. 이 샘플의 클립 수·시간·실행 상태는 실측 근거가 아니다.
