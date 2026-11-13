# FE 테스트 코드 커버리지 (2026-11-14)

> 상태: 기록 · 담당: FE · 최종 수정: 2026-11-14 · FE/Claude

## 측정 방법

`frontend/`에서 Node 22 내장 커버리지로 측정했다(새 도구 설치 없음). 기준 커밋 `ddf4f32` 이후 main.

```bash
node --experimental-strip-types --experimental-test-coverage --test-coverage-include="src/**" --test tests/*.mjs
```

테스트 파일 56개, 모두 통과.

## 결과 요약

| 구분 | 줄 | 분기 | 함수 |
|---|---:|---:|---:|
| **측정된 파일(로직 `.ts` 29개)** | **95.9%** | **94.8%** | **96.4%** |

- 측정된 파일은 전체 소스 3,377줄 중 약 1,400줄이다. **화면 컴포넌트(`.tsx`) 등 23개 파일, 약 1,970줄은 측정 범위 밖이다**(아래 참고). 그래서 위 숫자는 "프론트엔드 전체"가 아니라 "계산·통신 로직"의 커버리지다.

## 파일별 (낮은 것 위주)

| 파일 | 줄 | 분기 | 빠진 부분 |
|---|---:|---:|---|
| `player/clipTransition.ts` | 20.4% | 100% | 클립 넘김 화면 효과(11~49줄). DOM 애니메이션이라 Node 테스트로 실행되지 않음 |
| `player/feedScroll.ts` | 86.5% | 66.7% | 스크롤 넘김 일부 분기 |
| `services/clips.ts` | 94.4% | 82.9% | 결과 응답 검사 일부(50~51, 55~56줄) |
| `player/state.ts` | 99.4% | 97.7% | 36~37줄(격자 범위 오류 한 갈래) |
| `player/diagramEdges.ts` | 99.2% | 97.9% | 122줄 |
| 나머지 24개 | 100% | 80~100% | — |

## 측정 범위 밖 (테스트가 직접 실행하지 않는 파일)

화면 그리기(React `.tsx`)와 브라우저에만 있는 기능에 의존하는 파일이다. 일부는 Vite로 불러와 렌더링 결과만 확인하는 테스트가 있지만(`processing-progress`, `near-render` 등) 커버리지 숫자에는 잡히지 않는다.

- 화면: `App.tsx`, `components/`(ActualClipPreview, OutlineFlow, LibraryPanel, PreparationPanel, ProcessingStatus, DotField, FileSummary, SiteHeader), `player/`(PlayerStage, PlayerControls, Grid, Diagram, Slide, Stamp, NearLayer, FitContent)
- 훅·기타: `components/usePreparation.ts`, `player/useAudioClock.ts`, `services/evalClips.ts`(Vite 전용 `import.meta.glob`), `services/samplePages.ts`, `data/learningModes.ts`, `main.tsx`

## 해석과 다음 할 일(제안)

- 재생 상태 계산(`state.ts`), 배치 계산(diagram·grid·near), API 통신(`services/`)처럼 **틀리면 화면 전체가 틀어지는 로직은 거의 다 테스트된다.**
- 빈틈은 **화면 컴포넌트**다. 실제로 11/14에 `PlayerStage.tsx`의 수식 항 검사 문자열이 깨졌을 때 테스트가 잡지 못했다(검사를 `formulaTerms.ts`의 `hasFormulaTerms`로 옮기고 테스트를 붙여 해결).
- 화면 쪽은 브라우저로 직접 확인해 왔다. 자동화가 필요하면 화면 검사 도구(Playwright 등) 추가를 별도로 논의한다. 기능 동결 이후라 지금은 추가하지 않는다.
