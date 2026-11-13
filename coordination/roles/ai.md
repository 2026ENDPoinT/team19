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

> 최종 갱신: 2026-11-13 · AI/Claude (해커톤 직전 인계)

### 최근 한 일 (11/13)
- **D-43 column 공식 지원:** 검사기 `SUPPORTED_LAYOUTS`에 column, 설계도 프롬프트에 배치 선택 규칙(3개 이상 흐름·라벨 붙은 관계도는 column, 되돌아가는 선은 한 번에 3개 이하). MVC 평가 클립 재생성.
- **수식 단계별 제시:** 프롬프트에 "항 3개 이상·겹친 식은 setText로 안쪽부터 한 부분씩" 규칙. 강화학습 평가 클립 재생성(벨만 식이 문장마다 쌓임).
- **D-46 수식 항 강조:** `\term{id}{LaTeX}` + highlight args. 검사기·프롬프트는 준비했고 **스위치 `SUPPORTED_FORMULA_TERMS = False`** 다. FE 구현 알림(Q-FE-10)이 오면 True로 바꾸고 강화학습 클립을 다시 만든다.
- **클립 수 상한 실험:** 숫자를 숨기면 AI가 1.5~3쪽마다 클립을 만든다. 상한은 "잘라 내는" 역할이다([실험 기록 7절](../../sandbox/ai/2026-11-12-mode-split-test.md)). 팀원 의견 요청 Q-AI-31(팀장은 A: 그대로).
- 결정 기록 D-43~D-46. 질문 Q-AI-29(시연: 검증된 자료로 실제 생성), Q-AI-30(FE 꺾인 선), Q-AI-31. Q-FE-08에 05번 PDF 글꼴 정보 답.
- 오늘 API 비용 약 $0.2(재생성 2개, 상한 실험).

### 다음 할 일
- **[해커톤 체크리스트](../hackathon-checklist.md)를 따른다.** AI 몫 최우선: BE와 실제 모드 첫 통합(짧은 PDF, 팀장 확인 후) → 나온 AI 오류 고치기.
- 그다음: D-46 스위치 켜기(FE 완료 후), 프롬프트 예시 줄여 비용 낮추기, 의미 검사(D-40).
- 팀장 결정 대기: Q-AI-29·25(시연·서버), Q-AI-31(상한), Q-AI-26(모드 이름), P-AI-04(speech), 선수 클립, 오류 코드 이름, 예산 상한.

### 새 세션 참고 (작업 요령)
- 파이썬은 `.venv/Scripts/python.exe`, 한글 출력은 `PYTHONIOENCODING=utf-8`. 테스트: `.venv/Scripts/python.exe -m pytest pipeline/tests backend/tests -q`(254개, 약 1분).
- 평가 클립 다시 만들기: `sandbox/ai/eval_run.py <강의> <모드> <클립id> --models gpt-6.1-terra --audio gpt-6.1-terra` (유료, 약 $0.05). 강의 추출 결과는 `materials/extract/`(git 제외).
- FE 확인: `cd frontend && npm run dev` → http://localhost:5173 → "실제 클립 A/B 연결 확인" → 평가 클립 선택.
- 코드 변경은 `feature/ai-…` 브랜치에서 커밋 → main에 `--no-ff` merge → push(D-31). 문서·샘플은 main 바로.

### 막힌 것
- 없음. 참고: `gpt-4o-mini-tts`가 2027-01-06 종료 예정.

### 다른 역할에게 요청
- [to:BE] D-44·D-45 구현, 실제 모드 첫 통합을 AI와 같이(Q-AI-28).
- [to:FE] D-46 `\term` 변환(Q-FE-10), 꺾인 선(Q-AI-30), 업로드 흐름의 실제 모드 허용.
- [to:FE,BE] Q-AI-29(시연 방식), Q-AI-31(클립 수 상한) 의견.
