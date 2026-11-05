# 강의 숏폼 (가칭)

강의 PDF를 올리면 학습 단계에 맞춰 개념과 예시 단위로 나눈 세로 숏폼 영상 시리즈를 만들어 주고, 쇼츠처럼 넘겨 볼 수 있는 웹 서비스.

> **지금은 설계 단계다 (2026-11-06).** 거의 모든 내용이 초안이고, 팀 논의에 따라 계속 바뀐다.
> 확정된 것은 [coordination/decisions.md](coordination/decisions.md)에 있는 것뿐이다.

## 일정

| 기간 | 내용 |
|---|---|
| 11/6 ~ 11/10 | 사전 개발 초반부 (뼈대 잡기) |
| 11/13 | 오프라인 14시간 개발, 시연 |

자세한 내용은 [docs/07-schedule.md](docs/07-schedule.md)에 있다.

## 팀

ENDPoinT 해커톤 2026 Team 19

| 역할 | 담당 | 쓰는 도구 |
|---|---|---|
| 팀장 · AI | 강현 | Claude Code (필요하면 Codex 추가) |
| 프론트엔드 (FE) | (이름) | (Claude Code 또는 Codex) |
| 백엔드 (BE) | (이름) | (Claude Code 또는 Codex) |

## 이 저장소가 돌아가는 방식

세 명이 각자 AI 에이전트와 함께 일한다. 에이전트끼리는 직접 대화할 수 없으므로 **이 저장소의 파일이 대화 채널**이다.

1. 작업을 시작할 때 에이전트가 최신 내용을 받아서, 새 결정과 나에게 온 질문, 요청을 확인한다.
2. 작업이 끝나면 에이전트가 내 현황과 질문을 파일에 남기고 올린다.
3. 다른 사람의 에이전트가 다음 세션에서 그것을 읽고 답한다.
4. 결정은 사람(팀장)이 한다. 에이전트는 제안만 한다.

에이전트용 규칙은 [AGENTS.md](AGENTS.md)에, 사람용 설명은 [docs/08-collaboration.md](docs/08-collaboration.md)에 있다.
Claude Code는 `CLAUDE.md`를 통해, Codex는 직접 `AGENTS.md`를 읽는다.

## 처음이라면

1. [docs/00-onboarding.md](docs/00-onboarding.md)를 따라 저장소를 받는다.
2. 이 폴더에서 에이전트를 열고 `시작 루틴 해줘`라고 말한다.
3. 모르는 단어는 [docs/glossary.md](docs/glossary.md)에서 찾는다.

## 읽는 순서

| 누가 | 읽을 문서 |
|---|---|
| 모두 | [01 제품](docs/01-product.md) → [02 유사 서비스](docs/02-competition.md) → [03 전체 구조](docs/03-architecture.md) → [07 일정](docs/07-schedule.md) |
| AI 담당 | + [04 영상 설계도](docs/04-video-blueprint.md), [05 분할과 모드](docs/05-segmentation-and-modes.md), [06 비용](docs/06-cost-and-budget.md) |
| FE 담당 | + [04 영상 설계도](docs/04-video-blueprint.md), [contracts/](contracts/README.md) |
| BE 담당 | + [06 비용](docs/06-cost-and-budget.md), [contracts/](contracts/README.md) |

## 폴더 구조

```text
.
├── README.md              ← 지금 이 파일
├── AGENTS.md              ← 모든 에이전트 공통 규칙
├── CLAUDE.md              ← Claude Code용 (AGENTS.md를 가져옴)
├── docs/                  ← 설계 문서 (사람과 에이전트 모두 읽음)
├── contracts/             ← 파트 사이 약속 (데이터 모양, API)
└── coordination/          ← 에이전트 사이 소통
    ├── decisions.md       ← 결정 기록 (팀장만 작성)
    ├── questions.md       ← 열린 질문
    ├── proposals/         ← 변경 제안서
    ├── roles/             ← 역할별 책임과 현황
    └── meetings/          ← 회의 안건, 회의록
```

앱 코드 폴더는 기술 스택이 정해진 뒤에 만든다.
