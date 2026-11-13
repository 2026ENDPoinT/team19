# UNIX 시스템 프로그래밍 · AI 영상 부품 추출용 관찰 노트

> 상태: 제출 초안 / 사람이 검토할 예시 · 담당: BE · 작성: BE/ChatGPT, 2026-11-13

## 1. 제출 목적과 범위

- 과목: **UNIX 시스템 프로그래밍 (Unix System Programming)**
- 자료: 업로드된 `lecture1.pdf`~`lecture9.pdf` 총 **9개, 417쪽**.
- 자료 성격: 영어·한국어 혼합, C/UNIX 시스템 호출 코드, 표와 연결도, 메모리/프로세스/파일 구조도.
- 활용: AI가 **개념을 어떻게 나누고, 어떤 시각화 부품을 선택하는지** 비교하는 사람의 초기 관찰 메모. 이 메모는 정답 레이블로 검증됐거나 모델이 학습됐다는 뜻이 아닙니다.
- 원본 PDF: `coordination/lecture-submissions/unix-system-programming/pdfs/`에 원본 9개를 함께 제출합니다(팀장 현장 지시, **비공개 팀 저장소 한정**). 파일 검증용 전체 SHA-256은 `manifest.csv`에 있습니다.

## 2. 강의 PDF 목록

| PDF | 자료 첫 장의 제목 | PDF 쪽수 | 주제 |
|---|---|---:|---|
| `lecture1.pdf` | UNIX 시스템 프로그래밍 개요 | 35 | UNIX 역사, POSIX, 시스템 호출과 운영체제 구조 |
| `lecture2.pdf` | File I/O | 50 | 파일 디스크립터, open/close/lseek/read/write, dup/dup2 |
| `lecture3.pdf` | Files and Directories | 79 | stat/fstat/lstat, 파일 권한, 하드 링크와 심볼릭 링크 |
| `lecture4.pdf` | Standard I/O Library | 57 | FILE 스트림, 버퍼링, fopen/fclose, 문자·줄·바이너리 입출력 |
| `lecture5.pdf` | System Data Files and Information | 16 | time_t, struct tm, localtime/gmtime, strftime |
| `lecture6.pdf` | Environment of a Process | 35 | 프로세스 종료, 메모리 영역, 환경변수, 동적 할당 |
| `lecture7.pdf` | Process Control | 57 | fork, vfork, wait/waitpid, exec, 프로세스 관계 |
| `lecture8.pdf` | Signal | 49 | 시그널 종류, 핸들러, signal/sigaction, 타이머 |
| `lecture9.pdf` | Interprocess Communication | 39 | pipe/FIFO, 메시지 큐, 공유 메모리, 세마포어 |

`lecture8.pdf`는 전달된 `lecture8 (1).pdf`를 이름만 통일한 동일 파일입니다. 원본 파일 해시는 `manifest.csv`에 기록했습니다. **쪽수는 PDF 파일의 실제 페이지 순서(1부터)**입니다.

## 3. 시각화 후보 메모 (제안, 아직 AI 결과와 비교하지 않음)

| PDF / 페이지 | 핵심 질문 · 개념 | 제안 화면/부품 | 비교할 핵심 | 상태 |
|---|---|---|---|---|
| `lecture1.pdf` 8쪽 | 응용 프로그램이 하드웨어에 접근하는 계층은? | 계층 도식 `diagrams` 또는 원본 `slides`+강조 | application → library/system calls → OS → machine 구분 | 제안 |
| `lecture2.pdf` 34~37쪽 | `dup()` 뒤 두 FD가 무엇을 공유하나? | 파일 디스크립터 연결 그림 `slides`+`actions` | FD만 둘, 같은 열린 파일 항목/오프셋을 가리킴 | 제안 |
| `lecture3.pdf` 34~36쪽 | 하드 링크는 파일을 복사한 것인가? | `file1`·`file2`에서 하나의 inode로 이어지는 `diagrams` | 다른 이름, 동일 inode | 제안 |
| `lecture4.pdf` 12~16쪽 | `fopen()`의 `r/w/a/+`는 무엇이 다른가? | 모드 비교표 `grids`+`texts` | 읽기/쓰기 가능 여부, 덮어쓰기·끝에 추가 | 제안 |
| `lecture5.pdf` 2~6, 14쪽 | `time_t`와 `struct tm`은 어떻게 변환하나? | 시간 표현 변환 흐름 `slides`+`texts` | calendar time ↔ broken-down time와 함수 연결 | 제안 |
| `lecture6.pdf` 12~14쪽 | C 프로그램의 메모리 영역은 어떻게 다른가? | `text/data/heap/stack` 구조 `slides`+강조 | static/global·지역 변수·동적 할당 위치 구분 | 제안 |
| `lecture7.pdf` 6, 12~14쪽 | `fork()` 후 부모·자식은 어떤 FD를 공유하나? | 부모/자식→파일 테이블 연결 `slides`+`actions` | 서로 다른 FD 테이블과 공유된 파일 상태 | 제안 |
| `lecture8.pdf` 15~19쪽 | 시그널을 받으면 어떤 처리 방법이 있나? | default/ignore/handler 분기 `texts`+`codes` | `SIG_DFL`, `SIG_IGN`, handler의 의미 | 제안 |
| `lecture9.pdf` 8~11쪽 | 파이프의 읽기/쓰기 끝은 누구에게 연결되나? | parent↔child 흐름 `diagrams`·`codes` | fd[0]=read, fd[1]=write, 불필요한 끝 닫기 | 제안 |

부품 이름은 영상 설계도 v0에 있는 유형을 참고한 **희망 표현**이며, 현재 구현에서 모든 연결/강조/배치를 지원한다는 뜻은 아닙니다.

## 4. 사람 검토용 대표 예시 3개

### 예시 A · `dup()`의 파일 디스크립터 공유
- 근거: **`lecture2.pdf` PDF 34~37쪽**, 특히 **37쪽 연결도**.
- 핵심 질문: `newfd = dup(fd)`를 실행하면 두 파일 디스크립터가 서로 다른 파일을 여는 것인가?
- 기대 설명: `fd`와 `newfd`는 서로 다른 FD 번호지만 같은 열린 파일 항목을 참조하므로 파일 위치(offset)를 공유합니다. 복사한 것은 파일 데이터가 아닙니다.
- 희망 시각화 흐름: (1) FD 3→열린 파일 항목 (2) `dup(fd)` 이후 FD 4→같은 항목 (3) 한쪽에서 위치 이동 시 둘 다 같은 오프셋 관찰.
- 제안 부품: 원본 37쪽 `slides`+`mark`, `texts`, 단계별 `actions`.
- 비교 항목: 같은 파일의 복제가 아니라 같은 열린 파일 항목의 참조라는 점을 AI가 잘 전달했는가?
- 사람 검토 상태: **제안, AI 결과 미대조**.

### 예시 B · 프로세스 메모리 레이아웃
- 근거: **`lecture6.pdf` PDF 12~14쪽**, 특히 **12쪽 메모리 구조도**.
- 핵심 질문: C 프로그램의 text/data/heap/stack은 왜 분리하는가?
- 기대 설명: 기계어는 text, 전역·정적 데이터는 data/bss, 동적 할당은 heap, 함수 호출의 지역 정보는 stack에 해당한다는 구분.
- 희망 시각화 흐름: (1) 원본 구조도 표시 (2) 각 영역 표시 (3) 전역 변수·`malloc()`·함수 지역 변수 위치를 순서대로 강조.
- 제안 부품: 원본 `slides`+`mark`, `texts`, `codes`.
- 비교 항목: 메모리 영역 명칭과 변수의 위치를 혼동하지 않는가?
- 사람 검토 상태: **제안, AI 결과 미대조**.

### 예시 C · 부모·자식 프로세스의 파이프
- 근거: **`lecture9.pdf` PDF 8~11쪽**, 특히 **9쪽의 두 방향 연결도**.
- 핵심 질문: `pipe(fd)`와 `fork()` 후 부모가 자식에게 데이터를 전달하려면 어느 쪽을 닫고 어느 쪽을 써야 하나?
- 기대 설명: 파이프에서 `fd[0]`은 읽기, `fd[1]`은 쓰기이며, 부모→자식 단방향 통신 예시에서는 부모가 읽기 끝을 닫고 쓰기 끝에 쓰며 자식은 쓰기 끝을 닫고 읽기 끝에서 읽습니다.
- 희망 시각화 흐름: (1) 파이프 생성 (2) `fork()`로 양쪽 FD 상속 (3) 필요 없는 끝 닫기 (4) 데이터 이동을 화살표로 표현.
- 제안 부품: `diagrams`(지원 범위 확인), `codes`, `texts`, 단계별 `actions`.
- 비교 항목: 송수신 방향과 `fd[0]/fd[1]`을 정확히 표시했는가?
- 사람 검토 상태: **제안, AI 결과 미대조**.

## 5. AI 담당자에게 전달할 관찰 포인트

- **원본의 도형을 그대로 보여 줄지, 부품으로 재구성할지**가 중요한 자료입니다. `dup`, `fork`, `pipe`에서는 개념 사이의 **화살표 연결 관계**가 핵심입니다.
- 코드가 등장한다고 모두 `codes` 부품만 쓰기보다, 코드를 실행한 후 FD·메모리·프로세스 상태 변화가 보이는지 확인하면 좋겠습니다.
- 1쪽 표지, 역사 연대표, 예제 코드가 많아 같은 분량으로 클립화하는 것보다 **의미 있는 개념 단위 분할**을 우선하고 싶습니다.
- 텍스트에는 한글·영문이 섞여 있으므로 실제 PDF 추출 문자와 원본 페이지를 비교하는 것이 좋겠습니다.
- 위 예시는 **팀원 개인의 관찰 초안**입니다. 팀장/AI의 형식 결정·시연 자료 선택을 대신하지 않습니다.

## 6. 자료 관리와 유의점

- 팀장의 2026-11-13 현장 지시에 따라 원본 PDF를 **비공개 팀 GitHub 저장소에 한정하여** 이 노트와 함께 제출합니다. 외부 공개·배포·저작권 재이용을 허가한다는 뜻은 아닙니다. 기존 문서의 별도 보관 방침과 달라진 부분은 팀장이 `coordination/decisions.md`에 반영할 필요가 있습니다.
- 다른 사람이 동일한 PDF인지 확인할 때 `manifest.csv`의 SHA-256을 사용합니다.
- 결함을 발견하면 **원본 PDF/페이지, 추출 글자, AI 생성 결과**를 구분해 기록합니다. 오류가 재현되지 않았는데 정상이라고 단정하지 않습니다.
