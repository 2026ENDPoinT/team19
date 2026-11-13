# Team19 백엔드

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-13 · BE/Codex

FastAPI + SQLite 서버. [공식 API](../contracts/api.md)와 [FE 연동 안내](INTEGRATION-NOTES.md)를 참고한다.

## 실행 (Windows PowerShell, 저장소 루트)

```powershell
$team19Python = 'C:\anaconda3\envs\team19\python.exe' # 노트북; 다른 PC는 환경 경로에 맞춘다
# 처음 설치할 때만 실행
& $team19Python -m pip install -r backend/requirements.txt
$env:AI_MODE = 'sample'
& $team19Python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

- API: `http://127.0.0.1:8000`, 설명·호출 화면: `/docs`, 상태: `/health`.
- 실제 AI A: `/clips/clip-01`, MP3: `/assets/clip-01-audio` (현재 138.8초, 25문장).
- 비교용 B: `/clips/clip-01-b`, MP3: `/assets/clip-01-b-audio` (현재 114.25초, 23문장). 길이와 resultId는 파일에서 읽는다.
- 부품 검사 샘플: `/clips/parts-test`, 신호음 WAV: `/assets/parts-test-audio`.
- 기존 PDF→샘플 MP4 시연: `/demo`. 저장 위치는 `backend/local-data/`이며 Git에서 제외한다.
- 다른 노트북에서 접속하는 시연은 [DEMO-NETWORK.md](DEMO-NETWORK.md)를 본다(`--host 127.0.0.1`은 자기 노트북 전용).
- FE 기본 허용 주소: `http://localhost:5173`, `http://127.0.0.1:5173`. 바꾸려면 `FRONTEND_ORIGINS`에 쉼표로 구분해 지정한다.

## PDF 업로드 정책

파일 크기 제한은 없고(`MAX_PDF_MB` 설정도 없다) **최대 100페이지**다. 101페이지 이상은 업로드 요청에서 `422 PDF_PAGE_LIMIT_EXCEEDED`로 거부하며 강의·Job을 만들지 않고 AI를 호출하지 않는다. 페이지 수는 PyMuPDF(없으면 pypdf)로 구조만 읽어 확인한다. 자세한 오류 계약은 [API 계약](../contracts/api.md)의 "PDF 업로드 정책".

## 기존 업로드 흐름

1. `POST /lectures`에 PDF 파일(`file`)을 올린다.
2. `GET /jobs/{jobId}` 완료 후 `POST /lectures/{lectureId}/outlines`에 `{"mode":"review"}`를 보낸다. 모드는 `intro`, `review`, `exam`이다.
3. 분할 Job 완료 후 `GET /lectures/{lectureId}/outlines/review`에서 클립별 Job을 확인한다.
4. 완료된 `GET /clips/{clipId}`에서 설계도·음성·자막·개발용 `previewVideoUrl`을 읽는다.

샘플 모드의 업로드 결과는 PDF 글자 발췌 + 무음 WAV + 개발용 MP4다. AI 요약이나 TTS 내레이션이 아니다. `SAMPLE_MP4=0`이면 MP4 생성을 끈다. 실행 프로세스와 작업 수는 각각 1개가 개발 기준이다(`BE_WORKERS=1`).

## 실제 모드 안전 설정 (D-44, D-45)

- `AI_MODE`는 정확히 `sample` 또는 `real`만 받는다. 미설정은 `sample`, 빈 값·오타·다른 값은 DB 초기화 전에 서버 시작을 거부한다.
- 재시작 시 sample의 `pending`은 자동 재개한다. real의 `pending`과 모든 모드의 `running`은 Job과 연결된 대상을 `failed/SERVER_RESTARTED`로 처리한다. Outline은 기존 상태 형식에 따라 `failed`만 표시하며 오류는 Job에서 읽는다. 재시도는 기존 `POST /jobs/{id}/retry`로 명시적으로 요청한다.
- AI 작업 스레드는 기본 sample 1개, real 3개다. `BE_WORKERS`를 지정하면 sample은 1~4, real은 1~3으로 제한한다. 기존 환경의 `BE_WORKERS=1`을 유지하면 real도 1개로 실행되므로 기본 3개를 쓰려면 해당 환경변수를 제거하거나 3으로 지정한다.
- Uvicorn 서버는 **프로세스 1개, `--reload` 없이** 실행한다. 작업 스레드 3개와 서버 프로세스 3개는 다르다. 여러 프로세스가 같은 DB를 열면 시작 시 다른 프로세스의 실행 중 작업을 실패 처리할 수 있다.
- 실제 첫 통합은 팀장 확인 후 새 `TEAM19_DATA_DIR`에서 진행한다. 기존 샘플 DB를 재사용하지 않는다. 이 안전 설정은 실제 AI 전체 흐름 검증을 대신하지 않는다.

## Windows PDF 추출

샘플 업로드의 `pdf_text_fallback.py`는 **PyMuPDF를 우선** 사용해 한글·줄바꿈을 추출한다(BUG-FE-01). 실제 추출 시점에만 불러오며, 설치되지 않았거나 Windows DLL 차단으로 불러오지 못하면 기존 pypdf로 대체하고 로그에 품질 경고를 남긴다. **pypdf 대체 경로에서는 한글·줄바꿈 품질을 보장하지 않는다.** PyMuPDF가 읽는 중 발생한 PDF 오류는 대체 추출로 숨기지 않는다. 생성하는 PNG는 계속 원본 슬라이드가 아닌 표시용 대체 그림이다. AI `pipeline/extract.py`는 이 경로에서 가져오거나 실행하지 않는다.

**한글이 깨지면 먼저 확인:** 서버를 켠 Python에서 `python -c "import pymupdf; print(pymupdf.VersionBind)"`가 성공하는지 본다. 실패하면(`backend/requirements.txt`만 설치한 옛 환경 등) 샘플 업로드는 pypdf로 대체되어 한글이 깨진다. `pip install -r backend/requirements.txt`로 PyMuPDF를 설치하고 서버를 다시 켠다. PyMuPDF가 설치돼 있지 않으면 서버 시작 로그에도 `PyMuPDF를 불러올 수 없습니다` 경고가 나온다. 실제 AI 모드는 `pipeline/requirements.txt`의 PyMuPDF를 쓰며 없으면 대체하지 않고 실패한다.

기존에 저장된 깨진 `pages.text`와 클립 제목은 자동 갱신하지 않는다. 수정된 서버에서 원본 PDF를 **새 강의로 재업로드한 뒤 모드를 다시 선택**하면 새 추출 결과로 생성한다. 완료된 기존 Job은 재시도할 수 없으며, 기존 모드 계획·클립은 재사용되므로 기존 강의의 재시도만으로 제목이 바뀐다고 보장하지 않는다. 기존 DB 수정·삭제는 필요 없다.

## 테스트

```powershell
& $team19Python -m pip install -r backend/requirements-dev.txt
$team19TestDir = Join-Path $env:TEMP ('team19-tests-' + [guid]::NewGuid().ToString('N'))
& $team19Python -m pytest backend/tests/test_api.py pipeline/tests/test_validate.py -q -p no:cacheprovider --basetemp $team19TestDir
```

유료 AI API와 키를 사용하지 않는다. 테스트용 PDF도 pypdf로 만든다. 기존 DB 대신 테스트별 임시 저장소를 사용한다. AI의 PDF 추출 테스트(`pipeline/tests/test_extract.py`)는 PyMuPDF가 필요하므로 별도 실행한다. 저장된 MP3는 기존 `imageio-ffmpeg`로 전체 디코딩해 실제 길이·손상을 확인한다. MP3 인코더 지연을 고려해 결과 길이와 0.1초 차이까지 허용한다.

2026-11-09 노트북 검증: **117개 통과**(BE 93 + 검사기 22 + PyMuPDF 추출 2). 기존 테스트를 유지하고 B·결과 ID/길이 갱신·음성 혼합 방지·고정 ID 외 경로 차단 검사를 추가했다. Python 3.13.15, FastAPI 0.162.2, Starlette 1.10.0에서 기존 업로드·MP4·저장 유지와 오류 격리를 확인했다. 실제 Uvicorn 8000 포트에서도 A/B/parts-test의 200·206·416·HEAD·If-Range·CORS를 확인했다. TestClient의 httpx 사용에 대한 폐기 예정 경고 1건은 남아 있다.

## 미구현

실제 AI 생성 함수 연결·TTS 내레이션·음성만 재시도·단계 전체 시간 제한·사용량 저장은 아직 완료되지 않았다. `AI_MODE=real`은 검증되지 않은 기존 연결 틀이므로 현재 시연에는 사용하지 않는다. 자세한 제한과 FE 확인 사항은 [연동 안내](INTEGRATION-NOTES.md)에 있다.
