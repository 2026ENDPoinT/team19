# 역할: AI (팀장)

> 이 파일은 AI 역할만 고친다. 다른 역할은 읽기만 하고, 요청은 `questions.md`에 남긴다.

- 담당: 강현
- 도구: Claude Code (필요하면 Codex 추가)

## 책임 (잘 바뀌지 않는 부분)

- 팀장: 결정 기록(`decisions.md`), 일정, 예산, 해커톤 규정 확인
- PDF 내용 추출과 구조 분석
- 자료를 클립으로 나누는 기준과 학습 단계 모드 ([docs/05](../../docs/05-segmentation-and-modes.md))
- 영상 설계도 형식 초안과 설계도 생성 프롬프트 ([docs/04](../../docs/04-video-blueprint.md))
- 음성(TTS) 생성과 문장별 시간 계산 (D-13). BE는 호출, 저장, 재시도
- 결과 품질 평가 (체크리스트, 정답지 비교)

## 다른 역할에게 주는 것

- FE에게: 영상 설계도 형식, 샘플 설계도
- BE에게: 파이프라인을 부르는 방법(입력과 출력), 샘플 결과

## 다른 역할에게서 받는 것

- FE에게서: 설계도 중 그리기 어려운 부분에 대한 피드백
- BE에게서: 업로드된 PDF에 접근하는 방법, 결과를 저장하는 방법

## 1단계 완료 기준

PDF 하나를 넣으면 분할 계획과 클립 1개 이상의 설계도와 음성이 계약 형식대로 나온다.

---

## 현황 (세션마다 갱신)

> 최종 갱신: 2026-11-09 · AI/Claude

### 최근 한 일 (11/9)
- 11/9 회의를 준비하고 진행했다. 결정 D-18~D-35를 기록했고, 끝난 질문 14개를 archive로 옮겼다. 제안서 P-AI-02, P-BE-01, P-BE-02는 결정됨이다.
- 계약 v0을 반영했다: [docs/04](../../docs/04-video-blueprint.md)(설계도 형식), [contracts/](../../contracts/README.md)(api, data-model, 새 pipeline.md). AGENTS.md와 docs/08에 개발 단계 규칙(코드 폴더, 브랜치, PR 없이 merge)을 넣었다.
- 11/11 목표와 역할별 필수 작업: [plan-first-clip.md](../plan-first-clip.md) (D-34, 분할정복용 부품만 필수).
- **AI 11/11 필수 작업을 모두 끝냈다** (`pipeline/`):
  - `validate.py`: Python 검사기 (D-27), 테스트 포함
  - `extract.py`: PDF 추출, 한국어 띄어쓰기 복원 (57쪽 3초)
  - `blueprint.py`: 설계도 생성. Claude Sonnet 5.5와 GPT-6.1 Terra, 한국어·영어 프롬프트
  - `audio.py`: 문장별 TTS, mp3. 목소리 cedar + 영어 말투 지시 (팀장 청취 비교)
- 샘플: [samples/parts-test/](../../samples/parts-test/README.md)(분할정복 부품 전부, 가짜 음성), [samples/clip-01/](../../samples/clip-01/README.md)(실제 클립 A=Sonnet, B=Terra, A-marin).
- 모델 비교: 프롬프트를 고친 뒤 품질은 비슷하고, Terra가 약 1/7 가격이다([비교 기록](../../sandbox/ai/2026-11-09-blueprint-compare.md)). 강의 19쪽 표의 오류(10단계 → 9단계)를 AI가 바로잡게 했다.
- 오늘 API 비용: 약 $0.43.

### 다음 할 일 (11/10)
- **테스트할 것 (11/11 이후):** 검사기 다음 단계로, 싼 모델이 "문장과 화면이 맞나"를 한 번 더 검토하는 단계(클립당 1센트 안팎 예상). 의미 검사 시제품(문장마다 새로 보이는 값이 그 문장에 나오는지)은 먼저 `pipeline/validate.py`에 넣는다.
- 영어 설계도 프롬프트 실험: Sonnet, Terra 한 번씩, 예상 약 $0.15~0.17 (`--prompt-lang en`).
- 장면 단위 TTS + 소리 크기 맞추기 실험: 클립 A로, 약 $0.03. 문장마다 톤이 달라지는 문제(Q-AI-10).
- FE 플레이어가 나오면 클립 A/B를 보고 설계도 모델을 제안한다(Q-AI-07).
- 11/10 저녁 점검: FE·BE 진행을 보고 D-34 범위 조정이 필요한지 정한다.
- docs/06 비용 추정을 실측으로 고친다(설계도 Sonnet $0.15, Terra $0.02, 음성 $0.03 / 클립).
- 11/11 피드백 준비: 보여줄 것, 물어볼 것(클립 길이 Q-AI-24 포함).

### 막힌 것
- 없음. 참고: `gpt-4o-mini-tts`가 2027-01-06 종료 예정이다(해커톤에는 영향 없음).

### 다른 역할에게 요청
- [to:FE] 부품 확인은 [samples/parts-test/](../../samples/parts-test/README.md), 실제 재생은 [samples/clip-01/](../../samples/clip-01/README.md)를 써 주세요. **클립 A와 B를 둘 다 재생할 수 있게** 해 주세요(README 맨 위 표, `meta.json`으로 구분). 팀장이 두 클립 품질을 비교합니다. 11/10 저녁에 진행 상황을 fe.md에 적어 주세요.
- [to:BE] 검사기는 `pipeline/validate.py`, 필요한 라이브러리는 `pipeline/requirements.txt`입니다. 사용법은 [contracts/pipeline.md](../../contracts/pipeline.md). `GET /clips/{id}`는 `samples/clip-01/result.json` 모양 그대로 주면 됩니다. Python 환경(.venv)은 각자 만들어 주세요.
- [to:전원] 클립 길이 기준 Q-AI-24에 의견 부탁해요.
