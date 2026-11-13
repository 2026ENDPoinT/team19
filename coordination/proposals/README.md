# 제안서

공용 문서(`docs/01`~`docs/07`), 계약(`contracts/`), 다른 역할의 영역을 바꾸고 싶을 때 쓴다.

## 규칙

- 제안서 하나에 파일 하나. 이름은 `P-내역할-번호-짧은제목.md`. 예: `P-BE-01-job-polling.md`
- 다른 역할은 **자기 역할의 의견 칸에만** 쓴다.
- 결정은 팀장이 "결정" 칸과 `decisions.md`에 적는다. 그 뒤에 해당 문서를 고친다.
- 상태: `의견 수집중` → `결정됨(D-xx)` 또는 `보류` / `철회`

## 양식

복사해서 쓴다.

```markdown
# P-역할-번호: 제목

> 상태: 의견 수집중 · 제안: 역할/도구 · 날짜 · 의견 마감: (날짜)

## 무엇을 정하려는가
(한두 문장)

## 왜 지금 필요한가

## 선택지
### A.
- 장점:
- 단점:
### B.
- 장점:
- 단점:

## 제안자의 추천과 이유

## 영향받는 문서와 파트

## 의견
### AI
(AI 역할만 작성)
### FE
(FE 역할만 작성)
### BE
(BE 역할만 작성)

## 결정 (팀장)
```

## 목록

| 번호 | 제목 | 상태 |
|---|---|---|
| [P-AI-01](P-AI-01-tech-stack.md) | 기술 스택 | 결정됨(D-17) |
| [P-BE-01](P-BE-01-storage-and-demo.md) | 저장 정책과 시연 방식 | 결정됨(D-25) |
| [P-AI-02](P-AI-02-blueprint-v0.md) | 영상 설계도 형식 v0 | 결정됨(D-26, D-27) |
| [P-BE-02](P-BE-02-api-and-pipeline-v0.md) | API와 AI 파이프라인 연결 계약 v0 | 결정됨(D-28) |
| [P-FE-01](P-FE-01-figma-design.md) | 승인 Figma 디자인 반영 및 화이트 UI 검토 | 결정됨(D-36) |
| [P-FE-02](P-FE-02-frontend-branch.md) | FE 개발 브랜치 단일화 | 결정됨(D-37) |
| [P-FE-03](P-FE-03-blueprint-player.md) | 실제 클립 A/B 설계도 플레이어 구현 | 결정됨(D-39) |
| [P-FE-04](P-FE-04-clip-sync-review.md) | A 클립 음성·자막·동작 싱크 공동 점검 | 결정됨(D-40) |
| [P-AI-03](P-AI-03-blueprint-eval-set.md) | 설계도 평가 세트와 예시 구성 | 의견 수집중 |
| [P-AI-04](P-AI-04-speech-text.md) | 설계도에 음성 원고(speech) 분리 | 의견 수집중 |
| [P-FE-05](P-FE-05-mp4-export.md) | 플레이어 MP4 내보내기 | 의견 수집중 |
| [P-FE-06](P-FE-06-column-layout.md) | 긴 단계 설명의 세로 배치 지원 앞당기기 | 의견 수집중 |
| [P-FE-07](P-FE-07-upload-preparation.md) | PDF 업로드와 준비 작업 상태 연결 | 의견 수집중 |
| [P-FE-08](P-FE-08-outline-flow.md) | 모드 요청·실제 클립 목록·재생 연결 | 의견 수집중 |
| [P-FE-09](P-FE-09-eval-player.md) | 다른 과목 저장 결과 플레이어 연결 | 의견 수집중 |
| [P-FE-10](P-FE-10-ponytail.md) | Ponytail 개인 환경 시험 사용 | 의견 수집중 |
| [P-FE-11](P-FE-11-player-colors.md) | 네온 팔레트와 설명 구간 수식 강조 | 의견 수집중 |
| [P-AI-05](P-AI-05-personal-library.md) | 개인별 저장(내 강의함)을 1단계로 당기기 | 결정됨(D-50) |
| [P-AI-06](P-AI-06-text-emphasis.md) | 화면 글 안의 핵심 단어 강조 | 의견 수집중 |
| [P-AI-07](P-AI-07-stamp.md) | 화살표·노드·글 위에 X(O) 도장 | 결정됨(D-53) |
| [P-AI-08](P-AI-08-plain-node.md) | 테두리 없는 다이어그램 노드 | 결정됨(D-54) |
| [P-AI-09](P-AI-09-staging.md) | 보조 자리로 옮기기(place)와 강조 밖 흐리게 | 결정됨(D-56) |
| [P-AI-10](P-AI-10-modes.md) | 학습 모드를 입문 · 기본 · 심화로 다시 정의 | 의견 수집중 |
| [P-FE-12](P-FE-12-real-mode.md) | 실제 AI 서버 생성 요청 연결 | 의견 수집중 |
| [P-FE-13](P-FE-13-highlight-density.md) | 강조 밀도 제한과 상단 상위 개념 제목 | 논의중 |
| [P-FE-14](P-FE-14-sentence-source-page.md) | 설명 문장별 근거 PDF 페이지 전달 | 논의중 |
