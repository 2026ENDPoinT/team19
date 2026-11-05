# 02. 유사 서비스와 차별점

> 상태: 논의중 · 담당: 전원 (정리: AI) · 최종 수정: 2026-11-06 · AI/Claude

조사 시점은 2026년 11월이다. 서비스는 계속 바뀌므로 발표 전에 다시 확인한다.

## 비교표

| 서비스 | 하는 일 | 우리와 다른 점 | 확인 상태 |
|---|---|---|---|
| NotebookLM Short Video Overviews | 올린 자료에서 Gemini가 가장 중요한 개념 하나를 골라 약 60초 세로 영상 1개를 만든다. 생성 전에 집중할 주제를 프롬프트로 지정할 수 있다. | 한 번에 개념 하나라서, 자료 전체를 다루려면 사용자가 개념마다 따로 생성해야 한다. 길이는 약 60초로 고정이다. | 출시(2026-06-30) 당시 영어 전용, 18세 이상. 생성에 30분 이상 걸릴 때가 있고 API가 없다. **지금 한국어가 되는지, 피드로 넘겨 볼 수 있는지는 직접 확인해야 한다(Q-AI-15).** |
| NotebookLM Explainer (긴 영상 개요) | 자료 전체를 몇 분짜리 가로 영상으로 정리한다. 한국어를 포함한 80개 이상 언어를 지원한다. | 긴 영상 한 편이라 개념별로 나뉘지 않는다. | 공식 도움말 기준 |
| Lectone | PDF나 PPT를 올리면 스크립트와 AI 음성으로 강의 영상을 만든다. | 강현 확인: 슬라이드에 음성을 입히는 수준이고 개념 분할이나 시각화 변환이 약하다. | 강현 직접 확인 |
| Shortd | PDF와 이미지를 요약 릴스와 플래시카드로 바꾼다. | | 강현 확인: 서비스가 종료된 것으로 보인다. |
| Kapwing, HeyGen, Leadde 등 | 범용 "PDF를 영상으로" 도구. 내레이션, 아바타, 장면 생성 | 마케팅과 교육 전반용이고, 강의 개념 분할이나 학습 단계 개념은 없다. | 웹사이트 기준 |
| UnivAI, Gpai 등 요약형 AI | 강의자료를 글로 요약한다. | 영상이 아니다. | 팀 노트 기준 |

## 우리 차별점 (초안)

1. **자료 전체를 개념과 예시 단위로 자동 분할해서 시리즈를 만든다.** NotebookLM Short는 한 번에 개념 하나다.
2. **학습 단계 모드.** 처음 볼 때, 복습할 때, 시험 직전에 필요한 영상이 다르다는 관점이다. 모드에 따라 나누는 방식과 클립 수가 달라진다.
3. **쇼츠처럼 넘겨 보는 피드**와, 옆에 띄우는 **근거 원본 페이지.**
4. **한국어.**
5. **영상 생성 AI가 아니라 코드로 그린 애니메이션.** 숫자, 수식, 그래프가 뭉개지거나 틀어지지 않는다([04](04-video-blueprint.md)).

"시험 대비 정확도"를 단독 차별점으로 내세우지는 않는다. 강현 의견: 보편 지식과 시험용을 분리해서 봐야 하고, 핵심은 학습 단계의 구분이다.

## 발표 때 받을 만한 질문과 답 초안

| 예상 질문 | 답 초안 |
|---|---|
| NotebookLM이랑 뭐가 달라요? | 그건 한 번에 개념 하나를 만들어요. 우리는 강의 전체를 학습 단계에 맞게 개념 단위로 나눠서 시리즈로 만들고, 쇼츠처럼 넘겨 봐요. 한국어도 돼요. |
| 영상 내용이 틀리면요? | 매 클립 옆에 근거 페이지를 띄워서 바로 확인할 수 있어요. 숫자와 그래프는 이미지 생성이 아니라 코드로 그려서 모양이 틀어지지 않아요. |
| 비용은 얼마나 들어요? | [06](06-cost-and-budget.md)의 실측 값으로 답한다. |
| 교수님 강의자료 저작권은요? | 사용자가 자기 공부용으로 올린 자료를 본인만 보는 구조이고, 공유 기능은 두지 않아요. (정책은 Q-AI-20에서 확정 필요) |

## 출처

- [NotebookLM short Video Overviews 설명 (eesel)](https://www.eesel.ai/blog/notebooklm-short-video-overviews)
- [NotebookLM Short 사용 가이드 (justbeingresourceful)](https://justbeingresourceful.com/2026/07/08/notebooklm-short-video-overviews-turn-any-document-into-a-60-second-vertical-video-step-by-step-guide/)
- [NotebookLM Short 출시 기사 (pasqualepillitteri.it)](https://pasqualepillitteri.it/en/news/6883/notebooklm-short-video-overviews-en)
- [Generate Video Overviews in NotebookLM (Google 고객센터)](https://support.google.com/notebooklm/answer/16454555)
- [Lectone 소개 (GeekNews)](https://news.hada.io/topic?id=28189)
- [Shortd 소개 (toolmage)](https://www.toolmage.com/ko/tool/shortd/)
