# 06. 비용과 예산

> 상태: 추정 (첫날 실측 필요) · 담당: AI (팀장) · 최종 수정: 2026-11-07 · AI/Claude

## 확인한 가격 (2026년 11월 기준)

| 항목 | 가격 | 출처 |
|---|---|---|
| Claude Sonnet 5.5 | 입력 100만 토큰당 $2, 출력 100만 토큰당 $10 | Claude 가격 문서 |
| Claude Haiku 5.5 | 한 요청의 입력이 10만 토큰 이하면 입력 $0.10, 출력 $0.50. 넘으면 $0.50 / $2.50 (5배) | Claude 가격 문서 |
| 일괄 처리(Batch) | 위 가격의 50% 할인. 결과가 늦게 와도 되는 작업에만 | Claude 가격 문서 |
| 토크나이저 | 최신 모델은 같은 글을 이전보다 약 30% 많은 토큰으로 센다 | Claude 가격 문서 |
| PDF 페이지 | 페이지당 글자 1,500~3,000 토큰, 페이지 그림 비용 별도 | Claude PDF 문서 |
| TTS (OpenAI gpt-4o-mini-tts) | 1분에 약 1.5센트 | OpenAI 발표 기사 |

## 다른 회사 가격 (2026-11-07 공식 페이지 확인, 100만 토큰당 입력 / 출력)

| 등급 | Anthropic | OpenAI | Google | 강의 1개 (아래 추정 기준) |
|---|---|---|---|---|
| 상위 | Sonnet 5.5 $2 / $10 | GPT-6.1 Sol $2 / $10 | Gemini 4 Argon $2 / $10 (12/1부터 2배) | 약 $1.5 |
| 중간 | (없음) | GPT-6.1 Terra $1 / $5 | Gemini 3.8 Flash $0.75 / $3.75 | 약 $0.55~0.75 |
| 저가 | Haiku 5.5 $0.10 / $0.50 | GPT-6 Luna $0.10 / $0.50 | Gemini 3.1 Flash-Lite $0.25 / $1.50 | 약 $0.07~0.2 |

- 페이지 그림: 1280×720 한 장에 약 1,200토큰. 40쪽 전체를 그림으로 보내도 상위 등급 약 $0.1이다.
- GPT-6 Luna는 27.2만 토큰까지 같은 가격이다(Haiku 5.5는 10만 토큰).
- Gemini Flash 계열은 무료 구간이 있지만 데이터가 학습에 쓰일 수 있다. 공개 자료로만 실험한다.
- TTS는 대부분 1분에 1~2센트다(OpenAI gpt-4o-mini-tts 음성 출력 100만 토큰당 $12, Gemini 3.8 Flash TTS 약 1.4센트/분). 한국어 음질로 고른다(Q-AI-10).
- 성능은 같은 등급끼리도 우리 작업에서 직접 비교해야 한다(Q-AI-07 실험).

## 실험 예산 (Q-AI-07)

| 실험 | 내용 | 예상 비용 |
|---|---|---|
| 페이지 해설 비교 | 어려운 페이지 10장 × 등급 3개 | $1 미만 |
| 분할 계획 비교 | 자료 3개 × (글자만 / 글자+해설) × 모델 2~3개 | $2~3 |
| 설계도 맛보기 | 클립 2~3개 | $1~2 |

OpenAI와 Anthropic에 회사당 $5~10을 충전하면 충분하다(Q-AI-13). 팀에 구독 크레딧을 받을 수 있는 요금제(ChatGPT Pro, Claude Max 등)는 없다.

## 추정: 40쪽 강의, 클립 15개, Sonnet 5.5 기준

| 단계 | 계산 | 비용 |
|---|---|---|
| 분석, 분할 계획 | 입력 약 10만 토큰, 출력 약 8천 토큰 | 약 $0.3 |
| 클립 설계도 15개 | 클립당 입력 약 1.5만, 출력 약 5천 | 약 $1.2 |
| 음성 | 클립당 약 50초 × 15개 = 12.5분 | 약 $0.2 |
| **합계** | | **약 $1.5~2** |

- 시험 대비 모드로 클립이 30개면 약 $3 안팎이다.
- 같은 작업을 Haiku 5.5로 하면 AI 부분이 약 1/20이 된다. 대신 분석 요청의 입력이 10만 토큰을 넘지 않게 나눠서 보내야 한다. 넘으면 그 요청 전체가 5배 가격이다.
- **모두 추정치다.** 첫날 실제 호출마다 토큰 사용량을 기록해서 이 표를 고친다.

## 예산

- 해커톤 측 API 크레딧 지원은 없다. 팀 사비로 낸다.
- 예산은 5~10만 원 정도로 생각 중이다(팀 논의 필요, Q-AI-13). 대략 수십 달러이므로, Sonnet으로 강의 전체를 수십 번 생성할 수 있는 양이다.
- **진짜 위험은 개발 중 반복 호출이다.** 아래 절약 규칙을 지킨다.

## 절약 규칙

1. FE와 BE는 저장된 샘플 결과로 개발한다. 진짜 AI를 부르지 않는다.
2. 프롬프트 실험은 클립 1개 단위로 한다. 강의 전체를 매번 돌리지 않는다.
3. 개발 중에는 Haiku를 쓰고, 품질 비교와 시연용 결과는 Sonnet으로 만든다.
4. 같은 입력의 결과는 파일로 저장해서 재사용한다.
5. Claude 콘솔에서 월 지출 한도를 걸어둔다.
6. 호출마다 입력과 출력 토큰 수를 기록한다.

## API 키 관리

- 키를 누구 명의로 만들지(팀장 1개 공용 또는 각자), 비용을 어떻게 나눌지 정한다(Q-AI-13).
- 키는 `.env` 파일에만 두고 GitHub에 올리지 않는다. 공유는 메신저로 한다.
- 키는 서버에서만 쓴다. 브라우저 코드에 넣지 않는다.

## 확인해 볼 것

- Claude 유료 구독 중 일부 요금제(Max, Team 등)는 매달 API 크레딧이 포함될 수 있다. 우리 팀에 해당되는지 문서를 확인한다: [API credits for subscribers](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)
- TTS는 다른 서비스와 한국어 품질, 가격을 비교해야 한다(Q-AI-10).
- Remotion을 쓰게 되면: 개인과 3명 이하 팀은 무료다. 우리 팀은 3명이라 무료 범위지만, 외부 협업자가 늘어 4명 이상이 되면 유료다.

## 출처

- [Claude API 가격](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude PDF 지원](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- [OpenAI 오디오 모델 가격 (Neowin)](https://www.neowin.net/news/openai-announces-next-generation-audio-models-to-power-voice-agents/)
- [Remotion 가격](https://www.remotion.dev/docs/pricing)
- [OpenAI API 가격](https://developers.openai.com/api/docs/pricing), [Gemini API 가격](https://aistudio.google.com/docs/pricing)
