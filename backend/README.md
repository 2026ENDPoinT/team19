# Team19 백엔드

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-09 · BE/Codex

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
- FE 기본 허용 주소: `http://localhost:5173`, `http://127.0.0.1:5173`. 바꾸려면 `FRONTEND_ORIGINS`에 쉼표로 구분해 지정한다.

## 기존 업로드 흐름

1. `POST /lectures`에 PDF 파일(`file`)을 올린다.
2. `GET /jobs/{jobId}` 완료 후 `POST /lectures/{lectureId}/outlines`에 `{"mode":"review"}`를 보낸다. 모드는 `intro`, `review`, `exam`이다.
3. 분할 Job 완료 후 `GET /lectures/{lectureId}/outlines/review`에서 클립별 Job을 확인한다.
4. 완료된 `GET /clips/{clipId}`에서 설계도·음성·자막·개발용 `previewVideoUrl`을 읽는다.

샘플 모드의 업로드 결과는 PDF 글자 발췌 + 무음 WAV + 개발용 MP4다. AI 요약이나 TTS 내레이션이 아니다. `SAMPLE_MP4=0`이면 MP4 생성을 끈다. 실행 프로세스와 작업 수는 각각 1개가 개발 기준이다(`BE_WORKERS=1`).

## Windows PDF 추출

데스크톱의 PyMuPDF DLL 차단에 대비해 기존 `pdf_text_fallback.py`의 **pypdf 텍스트 추출을 유지**한다. 노트북에서는 PyMuPDF가 정상 동작하지만 업로드 경로는 그대로다. 생성하는 페이지 PNG는 원본 슬라이드가 아닌 표시용 대체 그림이다. AI `pipeline/extract.py`는 이 경로에서 가져오거나 실행하지 않는다.

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
