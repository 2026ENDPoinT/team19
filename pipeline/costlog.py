"""개발 중 유료 호출 기록. 명령줄로 돌린 호출만 sandbox/ai/cost-log.jsonl에 한 줄씩 쌓는다.

설계도 비용은 클립 내용과 모델 출력 길이에 따라 매번 달라서 한 숫자로 적을 수 없다.
그래서 호출마다 쌓아 두고 sandbox/ai/cost_summary.py로 모델·단계별 범위를 본다(docs/06).
서버(BE)에서 부를 때는 쓰지 않는다. BE는 usage를 Job에 저장한다.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

LOG = Path(__file__).resolve().parents[1] / "sandbox" / "ai" / "cost-log.jsonl"


def append(stage: str, target: str, usage: list[dict], note: str = "") -> None:
    """stage: blueprint / audio 등. target: 결과 파일이나 폴더. usage: 호출별 사용량 목록."""
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        for u in usage:
            row = {"time": datetime.now().isoformat(timespec="seconds"), "stage": stage, "target": target, "note": note, **u}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
