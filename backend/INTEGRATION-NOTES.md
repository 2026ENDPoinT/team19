# FE 연동 안내: 저장된 합병 정렬 샘플

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-09 · BE/Codex

서버 실행은 [README](README.md), 공식 반환 형식은 [API v0](../contracts/api.md)와 [ClipResult](../contracts/data-model.md#클립-결과-clipresult)를 따른다. FE 파일은 수정하지 않았다.

## 바로 사용할 주소

| 항목 | 값 |
|---|---|
| API 기준 주소 | `http://127.0.0.1:8000` |
| 테스트 클립 ID | `parts-test` |
| 결과 조회 | `GET /clips/parts-test` |
| 음성 파일 | `GET /assets/parts-test-audio` (`audio/wav`) |
| 기존 PDF→MP4 시연 | `http://127.0.0.1:8000/demo` |
| API 호출 화면 | `http://127.0.0.1:8000/docs` |

PDF 업로드나 Job 생성 없이 샘플을 바로 읽을 수 있다. `samples/parts-test/result.json`을 읽고 `audioUrl`만 API 주소로 바꾼다. 원본 파일은 수정하지 않고, 샘플 조회로 SQLite에 강의·Job을 만들지 않는다. ID는 고정이므로 재시작 후에도 동일하다.

## 결과 구조

```text
{
  id: "parts-test",
  planId: "plan_parts-test",
  status: "completed",
  error: null,
  result: {
    resultId: "parts-test",
    durationSec: 70.95,
    audioUrl: "/assets/parts-test-audio",
    blueprint: { version: 0, title: "합병 정렬: 나누고 합치기", theme: "dark", scenes: [...] },
    captions: [{ sceneId, lineIndex, text, startSec, endSec }, ...]
  }
}
```

위는 필드 설명이며 생략 기호 때문에 JSON으로 직접 사용할 수 없다. 실제 JSON은 조회 API로 받는다. 설계도는 장면 6개, 자막은 18문장이다. 자막 시간은 클립 전체 음성 시작 기준 초 단위이며, 같은 `resultId`의 설계도·자막·음성을 함께 사용한다. BE가 `pipeline.validate.validate_blueprint(blueprint, page_count=57)`와 자막 대응·순서·시간·실제 WAV 길이를 확인한 뒤 반환한다.

**이 샘플은 AI 담당자가 손으로 만든 부품 검사 자료이며, 음성은 문장 시작 신호음이다. 실제 TTS와 AI 생성 결과가 아니다.** [샘플 설명](../samples/parts-test/README.md)을 참고한다. `completed`는 이 저장된 샘플을 제공할 준비가 됐다는 뜻이다.

## FE에서 읽기

```typescript
const apiBase = 'http://127.0.0.1:8000';
const response = await fetch(`${apiBase}/clips/parts-test`);
if (!response.ok) throw new Error('샘플을 불러오지 못했습니다.');
const clip = await response.json();
const result = clip.result;
const audioUrl = new URL(result.audioUrl, apiBase).href;
// 플레이어에 result.blueprint, result.captions, result.durationSec, audioUrl을 전달
```

`audioUrl`은 **BE 주소를 기준으로** 해석한다. FE 주소에서 `/assets/...`를 요청하면 FE 개발 서버로 가므로 실패할 수 있다. 브라우저의 `<audio src={audioUrl}>`와 현재 재생 시간으로 자막·동작을 맞춘다.

## 음성 탐색과 오류

- 파일 전체 요청은 `200`, `Range: bytes=0-43` 같은 부분 요청은 `206`과 `Content-Range`, `Content-Length`를 반환한다. 끝 위치 생략·뒤에서 일부 요청·`If-Range`·`HEAD`도 확인했다. 범위를 벗어나면 `416`이다.
- CORS는 FE·BE 포트가 달라도 접근하도록 허용하는 설정이다. 기본 FE 주소는 `localhost:5173`, `127.0.0.1:5173`이며, Range 관련 응답 헤더도 FE에서 읽을 수 있다.
- 없는 클립은 `404 {"error":{"code":"CLIP_NOT_FOUND","message":"클립을 찾을 수 없습니다.","retryable":false}}`다. 없는 파일은 `ASSET_NOT_FOUND`다.
- 저장된 샘플이 없으면 `503 SAMPLE_UNAVAILABLE`, 잘못된 설계도는 `500 BLUEPRINT_INVALID`, 자막 오류는 `500 TTS_FAILED`다. 잘못된 결과를 `completed`로 반환하지 않는다.

## 현재 기능과 남은 확인

| 기능 | 상태 |
|---|---|
| PDF 업로드·SQLite·Job·클립 조회·미디어 | 기존 구현 유지, 회귀 테스트 통과 |
| pypdf 추출 | 유지. PNG는 원본 페이지가 아닌 대체 그림 |
| 업로드 PDF의 샘플 클립·무음 MP4 | 유지, 생성·파일 제공 테스트 통과 |
| 저장된 parts-test·WAV·HTTP Range | 구현, TestClient와 실제 Uvicorn HTTP 확인 |
| AI Python 검사기 | 연결. 유료 호출 없이 샘플 조회 시, 생성 음성 처리 전, 결과 저장 전에 검사 |
| 실제 AI 생성·한국어 TTS | 미구현. 현재 `pipeline/`에는 검사기·PDF 추출만 있음 |
| 음성만 재시도·단계 전체 시간 제한·사용량 저장 | 미구현. 기존 재시도는 Job 전체 단위 |
| parts-test 근거 페이지 이미지 API 연결 | 미구현. 페이지 번호 31~33은 샘플 문서의 합성 PNG를 FE에 별도 매핑해야 함 |
| FE 브라우저의 재생·일시정지·탐색·반복·동작 동기화 | FE와 함께 확인 필요. 이번 HTTP 테스트만으로 화면 재생 완료로 보지 않음 |

검증용 `backend.pipeline`과 AI 소유 `pipeline/`는 서로 다른 모듈이다. 서버는 AI 검사기만 가져오며, Windows 정책에 차단될 수 있는 `pipeline.extract`는 가져오지 않는다. 실제 결과(`samples/clip-01/`)는 아직 없으므로 이번 API의 원본도 계속 `parts-test`다.
