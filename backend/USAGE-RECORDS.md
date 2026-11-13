# BE 단계별 사용량 기록

> 상태: 초안 · 담당: BE · 최종 수정: 2026-11-13 · BE/Codex

`feature/be-usage-records`의 검토용 구현이다. main 병합·Push·실제 유료 실행은 하지 않는다. 기존 [파이프라인 계약](../contracts/pipeline.md)의 사용량 저장을 BE 내부 SQLite에 구현하며 API 응답은 확장하지 않는다.

## 저장 구조

새 `job_usage` 테이블만 `CREATE TABLE IF NOT EXISTS`로 추가한다. 기존 테이블의 열이나 저장 결과·파일을 변경/삭제하지 않고, 과거 Job에 비용을 채워 넣지 않는다. 실제 사용자 DB에는 이번 코드를 실행하지 않았다.

| 열 | 의미 |
|---|---|
| job_id | jobs.id를 참조하는 외래 키 |
| stage | describing / planning / blueprint / audio |
| status | started / recorded / unavailable |
| usage_json | 반환된 usage 목록 전체의 JSON, 기록 불가이면 SQL NULL |
| created_at, updated_at | UTC 기준 SQLite 시각 |

기본 키는 `(job_id, stage)`다. 단계 안에서 같은 모델이 여러 번 호출됐으면 목록 안의 항목을 모두 보존한다. 같은 Job·단계의 중복 실행은 새 AI 호출 전에 기본 키 제약으로 거부한다. 명시적 재시도는 기존 정책대로 새 Job ID를 사용하므로 이전 시도의 기록을 덮어쓰지 않는다.

## 기록 시점과 상태

1. 단계의 호출 직전에 `started`, `usage_json=NULL`을 별도 트랜잭션으로 저장한다. 이때 DB 저장에 실패하면 AI를 호출하지 않는다.
2. 함수가 반환하면 다른 결과 검사나 다음 유료 단계보다 먼저 usage를 저장하고 커밋한다. 외부 호출을 기다리는 동안 DB 트랜잭션을 잡아 두지 않는다.
3. dict 목록을 정상적으로 반환하면 `recorded`와 JSON을 저장한다. `costIsEstimate`, 토큰, 캐시, 음성 길이, 추가 메타데이터를 제거하거나 기본값으로 채우지 않는다.
4. 함수가 예외를 던졌거나 usage가 누락/잘못된 형식/JSON 직렬화 불가이면 `unavailable`, SQL NULL이다. 사용량의 형식 문제만으로 기존 성공 결과를 버리지는 않는다. **DB 저장 실패**는 Job 실패로 끝내 다음 유료 단계로 넘어가지 않는다. DB 접근이 회복돼야 실패 상태도 저장할 수 있다.
5. 이후 음성·검증·파일 등록이 실패해도 앞선 `recorded`는 그대로 남는다. 재시작 안전 처리(D-44)로 중단된 Job의 남은 `started`만 `unavailable`로 바꾼다. 자동 재개·재시도 정책은 변경하지 않는다.

`recorded`는 “사용량 목록을 받았다”는 뜻이며 완전한 청구액을 보증하지 않는다. 명시적인 `usage: []`는 그대로 `recorded`/`[]`이며 0원 필드를 만들지 않는다. 호출 전 실패·미실행 단계·이전 버전 Job에는 행이 없다. 행이 없거나 NULL인 것을 0원으로 합산하면 안 된다. TTS의 `costIsEstimate: true`는 추정값이며 실제 청구액으로 표현하지 않는다.

## 조회와 한계

사용량 조회 API나 FE 화면은 추가하지 않았다. 서버를 실행하지 않는 읽기 전용 SQLite 연결에서 다음처럼 확인할 수 있다.

```sql
SELECT job_id, stage, status, usage_json, created_at, updated_at
FROM job_usage WHERE job_id = ? ORDER BY created_at, rowid;
```

- 유료 단계 4개에서 **함수가 정상 반환한** usage를 보존한다. 비용 없는 PDF 추출에는 사용량 행을 만들지 않는다.
- AI 내부에서 일부 호출이 성공한 뒤 예외가 나면 그 비용은 반환되지 않는다. `unavailable`로만 남으며 실제 비용·호출 수는 복원할 수 없다. [Q-BE-04](../coordination/questions.md#q-be-04--toai-be--열림)의 AI 오류·usage 전달 협의는 계속 열려 있다.
- 외부 호출 성공 직후 프로세스가 종료되거나 DB/디스크가 고장 나면 반환값 저장을 보장할 수 없다. 남은 started/NULL은 미확인 상태이며 무과금의 증거가 아니다. 과거 누락 사용량도 복원하지 않는다.
- JSON의 값과 목록을 보존하는 기능이며 제공사 청구서 검증·금액 합계·지출 상한은 구현하지 않는다. 필드가 없는 항목의 비용을 추정하지 않는다.
- 단계 전체 시간 제한, SDK 재시도 정책, 음성만 재시도, 첫 실패 후 자동 생성 중단은 이번 변경 범위 밖이다. 키·기존 실행 환경변수도 변경하지 않는다. 테스트 프로세스의 임시 설정만 사용한다.

## 무과금 검증

`backend/tests/test_usage_records.py`: sample의 빈 목록, 단계별 반환 목록/TTS 추정값, 각 단계의 예외 및 반환 후 검증 실패, 누락/비정상 usage, 다음 단계 실행 중 이전 기록의 커밋, 동시 Job 격리/중복 호출 거부, 재시도 분리, 저장 실패 시 다음 호출 방지, 재시작, 기존 스키마·데이터·자산 보존을 확인한다.

전체 `backend/tests` + `pipeline/tests`: **326개 통과, 181.49초**(기존 304 + 신규 22). 기존 중단 복구 테스트의 준비 과정은 완료 Job 삭제 대신 호출 전 중단 상태를 직접 만드는 방식으로 바꿔 새 외래 키를 유지했다.

모든 데이터는 임시 폴더에 두고 sample·가짜 AI만 사용한다. 단일 pytest 프로세스로 외부 네트워크를 차단하고 실제 키·실행 중인 서버·사용자 DB를 사용하거나 변경하지 않았다. 설치된 SDK도 변경하지 않았다. FE 코드와 API 응답 구조를 바꾸지 않아 이번 검증 범위는 BE·AI 회귀와 API 응답 형태 확인이다.
