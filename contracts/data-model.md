# 데이터 모양 v0

> 상태: 확정 v0 (D-26, D-28) · 담당: BE (설계도 부분은 AI) · 최종 수정: 2026-11-12 · AI/Claude

결정 과정은 [P-BE-02](../coordination/proposals/P-BE-02-api-and-pipeline-v0.md). 만들어 보며 고치고, 바꿀 때는 제안서로 한다.

## 전체 관계

- **강의(Lecture)** 하나에 **페이지(Page)** 여러 개. PDF 추출은 강의마다 한 번만 한다(D-12).
- 강의 하나에 모드별 **분할 계획(Outline)**. 모드는 `intro`, `review`, `exam`(D-29).
- 분할 계획 하나에 **클립 계획(ClipPlan)** 여러 개, 클립 계획 하나에 **클립(Clip)** 하나.
- 클립 하나에 **클립 결과(ClipResult)**: 설계도 + 음성 + 문장별 시간.
- 오래 걸리는 처리는 모두 **작업(Job)**으로 추적한다.

## 강의 (Lecture)와 페이지 (Page)

| 항목 | 이름 | 설명 |
|---|---|---|
| 번호 | id | |
| 제목 | title | |
| 상태 | status | `ready`는 PDF 추출 완료 |
| 페이지 수 | pageCount | 처리 중에는 null |
| 추출 작업 | preparationJobId | |
| 페이지 | pages[].number, text, imageUrl, empty | 번호는 1부터. `empty`는 내용 없는 페이지 |

## 분할 계획 (Outline)과 클립 계획 (ClipPlan)

| 항목 | 이름 | 설명 |
|---|---|---|
| 모드 | mode | `intro` / `review` / `exam` |
| 큰 분류 | sections | 예: 합병 정렬, 퀵 정렬 |
| 클립 계획 | clipPlans[] | 아래 |
| 클립 계획: 순서 | order | 0부터, 피드 순서 |
| 클립 계획: 제목 | title | |
| 클립 계획: 종류 | kind | `concept`(개념) / `process`(과정 따라가기) / `example`(예시 풀기) / `compare`(비교). AI가 정한다(2026-11-12) |
| 클립 계획: 근거 페이지 | sourcePages | 1부터 |
| 클립 계획: 선수 클립 | prerequisites | 먼저 볼 클립 계획 id |
| 클립 계획: 핵심 메모 | brief | 설계도를 만들 때 AI에게 줄 요약 |

## 클립 (Clip)

| 항목 | 이름 | 설명 |
|---|---|---|
| 번호 | id | |
| 클립 계획 번호 | planId | |
| 상태 | status | `pending`(생성 전) / `running` / `completed` / `failed` |
| 작업 | jobId | 아직 등록 전이면 null |
| 오류 | error | [api.md](api.md#오류-모양)의 오류 모양 |
| 결과 | result | 완료 전에는 null |

## 클립 결과 (ClipResult)

```json
{
  "resultId": "res_01",
  "durationSec": 3.2,
  "audioUrl": "/assets/audio_01",
  "blueprint": { "version": 0, "title": "...", "theme": "dark", "scenes": [] },
  "captions": [
    {"sceneId": "s1", "lineIndex": 0, "text": "퀵 정렬은 피봇을 기준으로 나눕니다.", "startSec": 0, "endSec": 3.2}
  ]
}
```

- `blueprint` 형식은 [docs/04](../docs/04-video-blueprint.md)에 있다. `version`이 든 JSON을 그대로 저장한다.
- `captions`는 설계도의 모든 문장에 하나씩 있다(장면 순서, 문장 순서대로). 시간은 클립 음성 시작을 0으로 둔 초 단위다.
- 같은 `resultId`의 설계도, 음성, 자막을 함께 쓴다. 음성만 다시 만들면 설계도는 그대로 두고 음성과 captions만 바뀐다.
- 음성은 클립당 파일 하나다.

## 작업 (Job)

| 항목 | 이름 | 설명 |
|---|---|---|
| 번호 | id | |
| 종류 | type | 추출, 분할, 클립 생성 등. 이름은 BE가 정한다 |
| 대상 | 대상 id | 강의, Outline, 클립 |
| 상태 | status | `pending` / `running` / `completed` / `failed` |
| 단계 | stage | 지금 하는 단계 이름 |
| 진행률 | progress | 잴 수 없으면 null |
| 오류 | error | [api.md](api.md#오류-모양)의 오류 모양 |
| 시도 | 시도 번호, 이전 시도 id | 재시도하면 새 Job을 만들고 이전 시도를 연결한다 |
| 사용량 | usage | AI 호출별 모델, 토큰, 비용 ([pipeline.md](pipeline.md)) |

서버를 다시 켤 때 `running`이던 작업은 `failed`(`SERVER_RESTARTED`)로 두고, 유료 호출을 자동으로 다시 하지 않는다.

## 보관 (D-25)

SQLite + 로컬 파일. 원본 PDF는 생성 직후 삭제하지 않는다. 자동 정리는 2단계다.
