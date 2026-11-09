# 실제 클립 1: 합병 과정 (분할정복 18~20쪽)

> 상태: 11/11 목표용 실제 결과 (D-32, D-34) · 담당: AI · 최종 수정: 2026-11-09 · AI/Claude

AI 파이프라인이 실제 강의자료로 만든 첫 결과다. 손으로 고치지 않았다. FE는 `result.json` 하나와 `audio.mp3`로 재생한다.

| 파일 | 내용 |
|---|---|
| `result.json` | [ClipResult](../../contracts/data-model.md#클립-결과-clipresult) 모양. 설계도 + 실제 음성의 문장별 시간 |
| `audio.mp3` | 실제 TTS 음성, 144.5초, 문장 25개. `result.json`의 `audioUrl`은 이 파일 이름이다 |
| `blueprint.json` | 설계도만 따로 |
| `plan.json` | 손으로 쓴 클립 계획 (분할 단계는 11/11 이후) |
| `candidates/` | 모델 비교 결과. [비교 기록](../../sandbox/ai/2026-11-09-blueprint-compare.md) |

## 만든 방법과 비용

| 단계 | 도구 | 비용 |
|---|---|---|
| PDF 추출 | `pipeline/extract.py` (PyMuPDF) | 0 |
| 설계도 | `pipeline/blueprint.py`, Claude Sonnet 5.5 (effort high), 첫 시도 통과 | $0.150 |
| 음성 | `pipeline/audio.py`, OpenAI gpt-4o-mini-tts, 목소리 coral | 약 $0.034 |

## FE가 알아 둘 것

- 쓰는 부품: texts, diagrams(row), grids(2차원, 한 줄), codes. 원본 조각(slides)은 쓰지 않아서 **페이지 그림이 필요 없다.**
- s4~s6은 `clear: false`로 s3 화면을 이어 쓴다. 탐색해도 같은 화면이 나와야 한다.
- 음성은 mp3 인코더가 앞에 약 0.05초를 붙인다. 문장 단위 맞추기에는 영향이 없다.
- 강의 19쪽 표의 오류(10단계 → 실제 9단계)를 AI가 바로잡아 내레이션에서 짚는다(s6).
- **길이가 144초로 길다.** 쇼츠에 맞는 클립 길이 기준은 아직 없다(D-02는 "내용에 따라"). 피드백 후 정한다.
