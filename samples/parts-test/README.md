# 분할정복 부품 샘플 (합병 정렬)

> 상태: 확정 v0용 샘플 · 담당: AI · 최종 수정: 2026-11-09 · AI/Claude

[plan-first-clip.md](../../coordination/plan-first-clip.md)의 11/11 필수 범위(D-34)를 **모두 한 번 이상 쓰는** 손으로 쓴 설계도다. FE는 이 샘플로 플레이어의 부품과 동작을 확인한다. 검사기를 통과한다.

**음성은 실제 TTS가 아니다.** 문장이 시작될 때마다 짧은 신호음이 난다(장면의 첫 문장은 높은 음). 문장 시간도 글자 수로 만든 가짜 값이다. 실제 결과는 11/10 저녁 `samples/clip-01/`에 올린다(D-32).

## 파일

| 파일 | 내용 |
|---|---|
| `result.json` | [ClipResult](../../contracts/data-model.md#클립-결과-clipresult) 모양 그대로. 설계도 + captions + durationSec. FE는 이 파일 하나를 읽으면 된다 |
| `audio.wav` | 신호음 음성 (약 71초). `result.json`의 `audioUrl`은 이 파일 이름이다. 실제 API에서는 `/assets/{id}` 주소가 된다 |
| `blueprint.json` | 설계도 원본. 고치면 `py sandbox/ai/make_timed_sample.py samples/parts-test`로 `result.json`과 음성을 다시 만든다 |

원본 페이지 그림(31, 32, 33쪽)은 BE 샘플의 합성 그림을 쓴다: `sandbox/be/fe-fixtures/media/page-31.png` 등. 실제 강의 슬라이드가 아니다.

## 장면별로 확인할 것

| 장면 | 부품과 자리 | 확인할 동작 | 끝났을 때 화면 |
|---|---|---|---|
| s1 | 제목(top), row 다이어그램(middle), 키워드(bottom) | show, 노드 highlight, 선 라벨 | 나누기·합치기 노드 강조 |
| s2 | 제목(top), tree 다이어그램 7노드 3단(middle) | 노드·선 highlight / unhighlight, 숨긴 노드·선 show | 트리 전체가 보임 |
| s3 | 제목(top), 한 줄 배열 + 칸 번호(middle) | 범위 강조 `"0-1"`, swap | 배열 `3, 8` |
| s4 | 제목(top), 2차원 격자 + 포인터 i, j(middle), 의사코드(bottom) | markLine, 칸 강조, setValue, move, 포인터 highlight | 셋째 줄 `1, 3, _, _`, i는 (0,1), j는 (1,1) |
| s5 | `clear: false`로 s4를 이어 씀. 수식(bottom) | setValue, 포인터 hide, setText, 코드 hide 후 수식 show | 셋째 줄 `1, 3, 5, 8`, 제목 "합치기 끝", 아래는 수식 |
| s6 | 원본 조각 33쪽(top), 본문(middle), 표(bottom) | focus, mark(라벨 "나누기"), unmark, 표 범위 강조 `"1,1-2"` | 표의 4칸 강조 |

- 탐색 확인: 예를 들어 s5 중간으로 바로 건너뛰면 s4의 동작까지 모두 계산된 화면이 나와야 한다([상태 복원](../../docs/04-video-blueprint.md#시간-규칙)).
- 2차원 격자는 줄마다 칸 수가 다르다(2, 2, 4칸). 표는 3자를 넘는 칸이 있어 표로 본다.
