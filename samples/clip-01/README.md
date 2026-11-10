# 실제 클립 1: 합병 과정 (분할정복 18~20쪽)

> 상태: 11/11 목표용 실제 결과 (D-32, D-34) · 담당: AI · 최종 수정: 2026-11-10 · AI/Claude

AI 파이프라인이 실제 강의자료로 만든 결과다. 손으로 고치지 않았다. 같은 클립 계획([plan.json](plan.json))으로 **설계도 모델만 다른 두 클립(A, B)**이 있다. 팀장이 플레이어에서 두 클립의 품질을 비교한다.

**11/10 v3로 교체했다.** 이전 A/B는 한 문장에 "비교 → 결과"를 함께 말해서, 비교를 말하는 동안 결과와 다음 포인터가 먼저 보였다(Q-FE-05, P-FE-04). 프롬프트에 시점 규칙을 넣고 A/B를 다시 만들었다. 이전 설계도는 `candidates/sonnet-v2.json`, `terra-v2.json`에 있다.

## [to:FE] 재생할 클립

| 표기 | 폴더 | resultId | 설계도 모델 | 목소리 | 길이 | 용도 |
|---|---|---|---|---|---|---|
| **A** | `samples/clip-01/` | `clip-01-A-sonnet-cedar-v3` | Claude Sonnet 5.5 | Cedar | 178.2초, 40문장 | **기본 재생.** 품질 비교의 A |
| **B** | `samples/clip-01/alt-terra/` | `clip-01-B-terra-cedar-v3` | GPT-6.1 Terra | Cedar | 88.8초, 20문장 | 품질 비교의 B |
| A-marin | `samples/clip-01/alt-marin/` | `clip-01-A-sonnet-marin` | Claude Sonnet 5.5 | Marin | 138.5초, 25문장 | 목소리 비교용. **이전(v2) 설계도라 싱크 문제가 남아 있다** |

- 각 폴더의 `result.json`([ClipResult](../../contracts/data-model.md#클립-결과-clipresult) 모양)과 `audio.mp3`를 함께 쓴다. **목소리마다 문장별 시간이 다르므로 다른 폴더의 음성과 섞지 않는다.**
- 각 폴더의 `meta.json`에 표기, 모델, 목소리가 있다. 비교 화면에서 A, B를 구분해 보여 줄 때 쓴다. `meta.json`은 비교용이며 API 계약이 아니다.
- 플레이어에서 클립을 고르는 방법(목록, 버튼 등)은 FE가 정한다. A와 B를 같은 플레이어로 차례로 볼 수 있으면 된다.

## FE가 알아 둘 것

- A, B 모두 texts, diagrams(row), grids, codes를 쓴다. 원본 조각(slides)을 쓰지 않아 **플레이어 화면에는 페이지 그림이 필요 없다.**
- 원본 페이지 옆 패널용 그림: `pages/page-018.png` ~ `page-020.png` (A, B 공통). `pipeline/extract.py`(PyMuPDF)로 만든 실제 강의 페이지이고 긴 변 1600px이다(Q-BE-01).
- `clear: false`로 앞 장면 화면을 이어 쓰는 장면이 있다(A의 s4~s6과 s9, B의 s3~s4). 탐색해도 같은 화면이 나와야 한다.
- 음성은 mp3 인코더가 앞에 약 0.05초를 붙인다. 문장 단위 맞추기에는 영향이 없다.
- 강의 19쪽 표의 오류(10단계 → 실제 9단계)를 두 설계도 모두 바로잡아 내레이션에서 짚는다.
- **알려진 음성 문제 (A):** 163초 부근 "5번 합병"을 "다섯 번 합병"으로, "위 줄"을 "뤼 줄"처럼 읽는다. 앞은 TTS의 무작위성, 뒤는 이중모음 발음 약점이다([실험 기록](../../sandbox/ai/2026-11-10-tts-style-test.md)). 다시 만들지 않고 둔다.
- 클립 길이 기준(쇼츠에 맞는 길이)은 아직 없다. 11/11 피드백 후 정한다(Q-AI-24).

## 만든 방법과 비용

| 단계 | 도구 | 비용 |
|---|---|---|
| PDF 추출 | `pipeline/extract.py` (PyMuPDF) | 0 |
| 설계도 A | `pipeline/blueprint.py`, Claude Sonnet 5.5 (effort high), 한국어 프롬프트 v3(시점 규칙) | $0.237 |
| 설계도 B | `pipeline/blueprint.py`, GPT-6.1 Terra, 한국어 프롬프트 v3(시점 규칙) | $0.021 |
| 음성 A / B | `pipeline/audio.py`, OpenAI gpt-4o-mini-tts, Cedar, 영어 말투 지시. 숫자는 한글 읽기로 바꿔 보낸다(`pipeline/korean_numbers.py`) | 약 $0.04 / $0.02 |

모델 비교 기록: [sandbox/ai/2026-11-09-blueprint-compare.md](../../sandbox/ai/2026-11-09-blueprint-compare.md). `candidates/`는 비교에 쓴 설계도 원본이다.
