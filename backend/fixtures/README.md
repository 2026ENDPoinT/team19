# BE 공식 API 상태 fixtures

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-10 · BE/Codex

Q-FE-03에 따라 BE가 관리하는 **개발용 고정 요청·응답 예제(fixtures)**다. API 상태 화면·오류 처리를 참고하기 위한 JSON이며 서버 기능이나 실제 HTTP 응답 기록이 아니다. API나 파일 서버를 추가하지 않는다. 위치·데이터 변경과 삭제 전 FE에 알린다.

## 파일과 사용법

- `cases.json`: 기존 66개 사례의 `name`, `request`, `response`를 변경 없이 보존했다. `name`으로 선택하고 `response.status`는 HTTP 상태 예시, **`response.body`만** 응답 본문 예시로 사용한다. 파일의 `notice`와 manifest 정보는 API 필드가 아니다.
- `manifest.json`: 9개 독립 시나리오(`flows`), 사례별 계약 검토 목록, 미제공 미디어, 실제 샘플 파일·API 참고 경로. 모든 파일 경로는 **이 폴더 기준**이다.
- `validate.py`: JSON·ID·상태·참조와 계약 차이 표시·실제 참고 파일을 검사하는 오프라인 도구. 전체 계약 검사기나 HTTP 테스트를 대신하지 않는다.

FE가 참고할 공식 경로는 `backend/fixtures/cases.json`과 `backend/fixtures/manifest.json`이다. 현재 main과 원격 frontend(`115f6c3`)는 이전 sandbox import를 이미 제거했다. 실제 플레이어는 기존 `GET /clips/{id}`를 계속 사용하며 이 파일을 새로 import할 필요가 없다. FE의 정적 파일 공개 경로가 아니므로 브라우저에서 이 경로로 fetch할 수 있다고 가정하지 않는다.

## 계약 v0 대조 결과

기준은 [API](../../contracts/api.md), [데이터 모양](../../contracts/data-model.md), D-19·26·28·29·31·34·35다. **59개는 응답 구조·모드·상태·오류 형식이 계약 v0의 해당 부분과 일치**한다(`contractReview.shapeCompatible`). 이는 서버와 값까지 같거나 실행·재생 가능하다는 뜻이 아니다. `clip.completed`의 설계도는 AI 소유 Python 공식 검사기로 검사한다.

다음 **7개는 과거 동작을 보존한 사례**로 분리했다. 새 기본 동작으로 사용하지 않는다. 응답을 몰래 고쳐 계약과 맞는 것처럼 만들지 않았으며, 계약 변경을 결정하지 않는다.

| 사례 | 차이 |
|---|---|
| `outline.intro.ready`, `outline.exam.ready`, `outline.review.B.registered`, `outline.review.mixed`, `outline.review.retrying` | 분할이 끝났지만 일부 또는 모든 클립의 `jobId`가 null이다. 데이터 모양에는 미등록 null이 있으나, D-19·API의 전체 자동 등록 정책을 보여주는 사례가 아니다. |
| `clip.unregistered` | 위의 과거 미등록 클립 조회다. 기본 흐름 예제로 쓰지 않는다. |
| `outline.review.reused.ready` | 완료 재사용 HTTP 200. 현재 BE도 200을 쓰지만 API 표는 202만 명시한다. 기존 차이를 기록하며 이번 작업에서 API·계약을 고치지 않는다. |

`outline.review.A.registered`의 **A는 모든 클립 자동 등록**, B는 과거의 일부 등록 비교다. 실제 AI 클립 A/B(`clip-01`, `clip-01-b`)와 관계없다. `mixed`·`retry` 시나리오에는 위 과거 사례가 섞여 있으므로 전체 흐름의 계약 준수를 보장하지 않는다. 미확정 HTTP 규칙을 새로 채택하려면 별도 협의한다.

### 유지한 임시값과 제한

- `lecture.processing`의 `processing`은 과거 표시값이다. API는 Lecture 상태 전체를 열거하지 않고 현재 BE는 처리 중 `running`을 쓴다.
- Job type의 `prepare_lecture`·`build_outline`·`generate_clip`, stage의 `queued`·`done`·`audio` 등은 예전 이름이다. 계약의 확정 열거값이 아니며 실제 서버 응답과 같다고 가정하지 않는다.
- ID, 제목, 5개 클립, 57쪽, 실패 메시지·retryable은 상태 예시용 임의 값이다. `lecture.ready.pages`에는 관련 4쪽만 있다. 문장별 3초·사이 0.25초·총 32.25초도 인공 시간이다.
- 업로드 사례에는 실제 multipart `file`이 없다. 그대로 HTTP 재전송할 수 없다. 오류 상태 예시를 실제 파일 업로드 검증으로 오해하지 않는다.
- JSON의 설계도는 기존 개념 설계도 사본이다. 원본 hash와 이식한 사례의 hash를 manifest에 기록했다. 실시간 외부 설계도 참조나 sandbox 실행 의존성은 없다.

## 미디어 처리

기존 합성 PNG 4개(31·32·33·52쪽)와 32.25초 신호음은 **복제하지 않았다**. 이 폴더는 API 상태 예시가 목적이므로 그림 표시·음성 재생 자산을 중복 보유하지 않는다. 기존 sandbox 원본은 수정·삭제하지 않았다.

과거 응답의 `/assets/img_31`·`img_32`·`img_33`·`img_52`·`audio_01`은 예제 라벨이다. manifest에서 `availability: "unavailable"`, `file: null`로 명시했다. **해당 ID를 현재 서버가 제공한다는 의미가 아니며 `clip.completed`는 이 자산으로 재생할 수 없다.** 52쪽 원본 파일은 현재 정식 samples에 없다. 존재하지 않는 경로나 임의 대체 파일을 만들지 않았다.

실제 확인에는 아래 기존 자료를 사용한다. manifest의 `referenceMedia`와 `playbackReferences`에 상대 경로를 정리했다. 복사·수정하지 않으며 과거 32.25초 결과의 미디어로 바꿔 끼우지 않는다.

| 자료 | 파일 경로(저장소 기준) | 현재 API |
|---|---|---|
| 실제 AI/TTS A | `samples/clip-01/result.json`, `audio.mp3` | `/clips/clip-01`, `/assets/clip-01-audio` |
| 실제 AI/TTS B | `samples/clip-01/alt-terra/result.json`, `audio.mp3` | `/clips/clip-01-b`, `/assets/clip-01-b-audio` |
| 수작업 부품 검사·신호음 | `samples/parts-test/result.json`, `audio.wav` | `/clips/parts-test`, `/assets/parts-test-audio` |
| A/B 실제 원본 18~20쪽 | `samples/clip-01/pages/page-018.png`~`020` | 저장된 샘플 이미지 asset ID 미등록 |
| parts-test 실제 원본 31~33쪽 | `samples/parts-test/pages/page-031.png`~`033` | 저장된 샘플 이미지 asset ID 미등록 |

parts-test는 AI 담당자가 제공한 **수작업 부품 샘플**이며 실제 AI 생성·TTS와 구분한다. FE frontend의 `samplePages.ts`는 원본 PNG를 임시 파일 매핑한다. API 제공 범위는 [연동 안내](../INTEGRATION-NOTES.md)를 따른다. 같은 페이지 번호라고 과거 개념 설계도의 이미지와 동일하다고 가정하지 않는다.

## 검증과 수정

저장소 루트에서 기존 Python 환경을 사용한다. 설치·외부 통신·유료 호출은 없다.

```powershell
$team19Python = 'C:\anaconda3\envs\team19\python.exe'
& $team19Python -m backend.fixtures.validate
& $team19Python -m pytest backend/tests/test_fixtures.py -q -p no:cacheprovider
```

JSON 구문(중복 키·비유한 숫자 포함), 66개 사례 이름, 필드·ID·Job/Clip 상태·전이·재시도·분할/작업 참조, 시나리오 연결, 계약 검토 누락, 페이지 번호, 설계도·자막·시간과 실제 참고 파일 경로·PNG 헤더를 검사한다. 과거 자산은 미제공 표시를 검사하며 제외한 WAV를 검사했다고 보고하지 않는다. HTTP·CORS·Range·브라우저 재생 검증은 별개다.

기존 `build.ps1`은 sandbox 설계도를 읽고 합성 미디어를 다시 만드는 용도라 이식하지 않았다. 새 `cases.json`은 독립적으로 관리한다. 수정 시 해당 사례의 계약 분류와 설명도 검토하고, 의도한 변경일 때만 `provenance.casePayloadSha256`를 `validate.digest(cases)`로 갱신한다. 원본 이식 hash는 변경하지 않는다. 기존 `validate.ps1`의 연결 검사는 위 Python 도구로 대체하고 공식 설계도 검사기를 함께 사용한다.

2026-11-10 최종 검증: 오프라인 검사 통과(66개·9개 시나리오·59/7 분류 중복/누락 없음). 66개 요청·응답은 이식 원본과 대조해 변경 없음을 확인했다. fixtures 테스트 **28개**, 기존 회귀 117개와 AI 음성 2개를 포함해 **루트 전체 통합 실행 147개 통과·실패 0개**다. 별도 확인에서도 BE·fixtures 121개, 검사기 22개, 추출 2개, 음성 2개가 각각 통과했다. 기존 httpx 폐기 예정 경고 1건은 남아 있다.

### 수정 전 통합 테스트 실패 조사 (BE/Codex, 2026-11-10)

동일한 `C:\anaconda3\envs\team19\python.exe`로 저장소 루트에서 재현했다. 최초 117개와 fixtures를 함께 실행하면 수정 전 141개 통과·3개 실패였다. 루트 자동 탐색은 기존 집계 밖의 AI 음성 테스트 2개도 포함한다.

```powershell
# 전체 탐색: 수정 전 147개 중 4개 실패, 수정 후 147개 통과
& $team19Python -m pytest -q -p no:cacheprovider
# fixtures를 제외한 최소 대조: 수정 전 BE 3개 실패, 수정 후 5개 통과
& $team19Python -m pytest backend/tests/test_api.py::test_stored_sample_contract_and_validator pipeline/tests/test_extract.py -q -p no:cacheprovider
# 조사 당시 분리 실행 명령 (수정 후에는 위 전체 실행도 통과)
& $team19Python -m pytest backend/tests/test_api.py backend/tests/test_fixtures.py pipeline/tests/test_validate.py -q -p no:cacheprovider
& $team19Python -m pytest pipeline/tests/test_extract.py -q -p no:cacheprovider
```

**원래 실패 3개:** `backend/tests/test_api.py::test_stored_sample_contract_and_validator`의 `[parts-test]`, `[clip-01]`, `[clip-01-b]`. 162줄의 다음 검사에서 실패한다.

```python
assert 'pipeline.extract' not in sys.modules and 'fitz' not in sys.modules
# AssertionError: assert ('pipeline.extract' not in {...})
```

pytest는 테스트 본문 실행 전에 모든 대상 파일을 import해 수집한다. `pipeline/tests/test_extract.py`는 모듈 최상위 7줄에서 `pymupdf`, 10줄에서 `pipeline.extract`를 정상 import한다. 수집 전용 실행과 import 추적으로 **어떤 테스트도 실행하기 전에** `pipeline.extract`가 `sys.modules`(이미 로드된 모듈 목록)에 있음을 확인했다. 당시 `fitz`, `backend.pipeline`은 없었다. fixtures를 제외하거나 수집 대상 나열 순서를 바꿔도 추출 테스트를 수집하면 이미 로드된다. 따라서 API가 추출기를 새로 로드했다는 증거가 아니라, 기존 검사가 전체 프로세스의 미로딩을 가정한 데서 생기는 테스트 격리 문제다. 분리 실행은 이 가정을 만족시키는 검증 방식이며 통합 실패를 고친 것은 아니다.

`backend.pipeline`과 최상위 `pipeline`은 서로 다른 정식 모듈이다. `backend.fixtures.validate`와 `pipeline.validate`도 서로 다른 파일로 로드되며 최상위 `validate` 모듈은 생기지 않는다. 새 `test_fixture_import_and_sample_api_do_not_load_pdf_extractor`는 별도 Python 프로세스에서 모듈 경로·정체성·`sys.path` 불변성을 확인하고, fixtures 검증 및 샘플 API 3개 조회 뒤에도 `pipeline.extract`·`pymupdf`·`fitz`가 없음을 확인한다. 생성기 생성은 금지하고 `AI_MODE=sample`·임시 저장소를 명시한다. 이 테스트는 전체 수집 상태와 무관하게 통과했다. 수집만으로 기존 실패 조건이 성립하므로 테스트 본문 사이 환경변수 공유는 최초 실패의 원인이 아니다.

**추가 실패 1개:** `pipeline/tests/test_audio.py::AudioTests::test_timing_gaps_and_reuse`. 37줄에서 MP3로 저장할 때 `pipeline/audio.py:104`의 `import lameenc`가 `ModuleNotFoundError: No module named 'lameenc'`를 냈다. `pipeline/requirements.txt`에는 `lameenc>=1.7`이 있으나 조사 당시 환경에 설치되지 않았다. 이 테스트의 TTS·클라이언트는 가짜로 대체돼 유료 호출은 없었다.

### 해결과 전체 재검증 (BE/Codex, 2026-11-10)

사용자 승인으로 `backend/tests/test_api.py`의 기존 테스트 3개에서 import 경계 검사를 독립 Python 프로세스로 옮겼다. 각 클립을 실제 TestClient로 조회하며, PDF 추출 모듈·유료 AI 생성 모듈의 import와 생성기 생성을 차단한다. 기존 응답·공식 검사기 호출·원본 보존·DB 미생성 검사는 유지했다. `sys.modules`를 지우거나 검사 순서를 바꿔 실패를 숨기지 않았다.

같은 Python 환경에 `pip install --no-deps "lameenc>=1.7"`로 **lameenc 1.9.0만 설치**하고 import·버전을 확인했다. 다른 패키지는 업그레이드하지 않았고 AI 음성 코드·Mock은 그대로다. 프로덕션 코드·다른 역할 폴더·66개 원본 사례는 수정하지 않았다. 위 루트 전체 실행을 다시 수행해 147개 모두 통과했으며 이제 추출 테스트를 분리할 필요가 없다.
