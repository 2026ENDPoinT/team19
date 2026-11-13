# 두 노트북 시연 연결 안내

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-14 · BE/Claude

구성: **팀장 노트북 = BE 서버**, **FE 담당 노트북 = 웹 화면**. 이 문서는 코드·문서 확인과 무과금 테스트로 정리한 절차이며 **실제 두 기기 연결은 아직 해 보지 않았다.** 방화벽·네트워크 설정은 BE가 바꾸지 않았다.

## 코드 기준 사실

| 항목 | 현재 | 두 노트북에서의 의미 |
|---|---|---|
| BE 바인딩 | 문서의 실행 명령이 `--host 127.0.0.1` | **자기 노트북에서만 접속된다.** 다른 노트북이 붙으려면 `--host 0.0.0.0`으로 켜야 한다 |
| 포트 | 기본 8000 | 방화벽이 막으면 연결 실패 |
| CORS 허용 주소 | `FRONTEND_ORIGINS`, 기본 `http://localhost:5173`, `http://127.0.0.1:5173` | 목록에 없는 화면 주소는 브라우저가 응답을 막는다(테스트로 확인). 허용 헤더는 전부라 `X-Owner-Id` 통과 |
| FE의 BE 주소 | `VITE_API_BASE_URL`, 없으면 `http://127.0.0.1:8000` | **FE 노트북은 BE 노트북의 IP로 지정해야 한다.** 빌드·dev 서버 시작 시점에 고정된다 |
| 음성·그림 주소 | BE가 `/assets/..` 경로를 주고 FE가 위 주소 기준으로 완성 | 별도 설정 없음. 음성 이어듣기(Range) 헤더 노출 확인 |
| 서버 프로세스 | 1개, reload 없음 (D-45) | `--workers 1`, `--reload` 쓰지 않기 |

## 절차 (같은 Wi-Fi/핫스팟, 사람이 직접)

**1. BE 노트북 (팀장)** — 저장소 루트
```powershell
ipconfig        # 같은 네트워크의 IPv4 주소 확인 (예: 192.168.0.12)
$env:AI_MODE='sample'   # 실제 AI는 키·새 TEAM19_DATA_DIR 등 REAL-AI-PREFLIGHT.md 기준
& 'C:\anaconda3\envs\team19\python.exe' -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 1
```
- Windows가 방화벽 허용을 물으면 **개인(Private) 네트워크만** 허용할지 사람이 결정한다. 공용 네트워크 허용은 권하지 않는다.
- 학교·행사 Wi-Fi는 기기 간 통신을 막는(client isolation) 경우가 있다. 안 되면 한 사람의 휴대폰 핫스팟으로 두 노트북을 연결한다.

**2. FE 노트북** — `frontend/`
```powershell
$env:VITE_API_BASE_URL='http://192.168.0.12:8000'   # 위에서 확인한 BE IP
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```
- 브라우저는 **`http://localhost:5173`으로 연다.** FE의 기기 ID(`crypto.randomUUID`)는 브라우저가 "보안 컨텍스트"로 보는 주소(`localhost` 또는 https)에서만 동작한다. `http://<노트북IP>:5173`처럼 IP로 열면 이 함수가 없어 **업로드가 실패할 수 있다**(FE 코드 `ownerId.ts` 읽고 한 추론이며 실기기 미확인).
- 화면 주소를 `localhost`가 아닌 다른 것으로 쓰려면 BE의 `FRONTEND_ORIGINS`에 그 주소를 쉼표로 추가해 BE를 다시 켠다.

**3. 연결 확인 순서 (유료 호출 없음)**
1. FE 노트북 브라우저에서 `http://192.168.0.12:8000/health` → `{"status":"ok","aiMode":"sample"}`가 보이면 네트워크·방화벽 통과.
2. FE 화면을 열고 PDF 1개 업로드 → 준비 완료까지 진행(샘플 모드는 무과금).
3. BE 노트북 터미널에 `POST /lectures 202`, `GET /jobs/.. 200`이 찍히는지 확인.
4. 클립을 재생해 음성이 나오는지 확인. 이후 FE의 내 강의함(Q-BE-07)이 구현되면 목록 확인.
5. 실제 AI 모드는 위가 모두 성공한 뒤 별도로 켠다(키·비용 확인은 팀장).

## GitHub Pages(D-49)를 쓸 때 — 추가 문제

- Pages 화면은 **https**이고 BE는 `http://IP:8000`이라 브라우저가 **혼합 콘텐츠로 요청을 막는다.** https 주소가 필요하다(예: HTTPS 터널 서비스). 이는 이 BE 코드로 해결되지 않으며 터널 도구·계정·비용은 팀장·FE 결정이다.
- BE `FRONTEND_ORIGINS`에는 **경로 없이 출처만** 적는다(예: `https://조직.github.io`). FE는 `VITE_API_BASE_URL`을 **빌드할 때** 공개 BE 주소로 지정해야 한다.
- **공개 주소로 열면 위험이 커진다.** 로그인이 없어 누구나 업로드할 수 있고, 실제 AI 모드에서는 **남이 보낸 업로드가 유료 호출을 일으킬 수 있다.** 기기 ID는 인증이 아니며(D-50) 강의·클립·`/assets`는 ID를 알면 열린다. 공개하는 시간·주소 공유 범위를 제한하고 시연 후 서버를 끈다.
- 반대로 로컬 FE(`localhost`) → 같은 네트워크 BE 조합은 위 혼합 콘텐츠 문제가 없다(localhost 화면은 http BE 호출을 허용하는 것이 일반적이나 브라우저별 실기기 확인 필요).

## 확인 상태

- 무과금 테스트로 확인: CORS 사전 요청(`X-Owner-Id` 포함 POST/GET), 목록에 없는 주소 차단, `FRONTEND_ORIGINS` 반영, Range 헤더 노출, `/health`.
- **미확인:** 실제 두 노트북 연결, 방화벽 허용, 학교/행사 네트워크, 브라우저의 IP 주소 접속 시 기기 ID 동작, Pages·HTTPS 터널 조합.
