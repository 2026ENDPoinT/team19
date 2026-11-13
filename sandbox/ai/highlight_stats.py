"""설계도의 강조 밀도 집계 (무료). 프롬프트의 강조 규칙이 지켜지는지 전후로 비교할 때 쓴다.

    .venv/Scripts/python sandbox/ai/highlight_stats.py samples/eval/algo-dc-review-c4/result-sol.json [...]

동시에 켜진 강조를 문장마다 센다. 이어진 칸 구간은 1개로 세고, 수식 항 강조(\\term)는 뺀다.
"""

from __future__ import annotations

import json
import re
import sys


def cells_of(arg: str) -> list[tuple[int, int]]:
    m = re.fullmatch(r"(?:(\d+),)?(\d+)(?:-(\d+))?", arg)
    row, start, end = int(m.group(1) or 0), int(m.group(2)), int(m.group(3) or m.group(2))
    return [(row, c) for c in range(start, end + 1)]


def runs(cells: set[tuple[int, int]]) -> int:
    return sum(1 for r, c in cells if (r, c - 1) not in cells)


def stats(bp: dict) -> dict:
    on_ids: set[str] = set()
    on_cells: dict[str, set] = {}
    kinds: dict[str, str] = {}
    rows: dict[str, list] = {}
    per_line, whole_rows, title_changes = [], 0, 0
    for sc in bp["scenes"]:
        if sc["clear"]:
            on_ids.clear(), on_cells.clear()
        kinds.update((t["id"], t["style"]) for t in sc["texts"])
        rows.update((g["id"], g["cells"]) for g in sc["grids"])
        for i in range(len(sc["lines"])):
            for a in (a for a in sc["actions"] if a["line"] == i):
                t, args = a["target"], a["args"]
                if a["do"] == "setText" and kinds.get(t) == "title":
                    title_changes += 1
                elif a["do"] == "hide":
                    on_ids.discard(t), on_cells.pop(t, None)
                elif a["do"] in ("highlight", "unhighlight") and not (kinds.get(t) == "formula" and args):
                    turn_on = a["do"] == "highlight"
                    if t in rows and args:
                        cells = {c for x in args for c in cells_of(x)}
                        on_cells[t] = (on_cells.get(t, set()) | cells) if turn_on else (on_cells.get(t, set()) - cells)
                        if turn_on:
                            whole_rows += sum(1 for r, row in enumerate(rows[t]) if len(row) > 2 and all((r, c) in cells for c in range(len(row))))
                    elif turn_on:
                        on_ids.add(t)
                    else:
                        on_ids.discard(t), on_cells.pop(t, None)
            per_line.append(len(on_ids) + sum(runs(c) for c in on_cells.values()))
    return {"문장": len(per_line), "강조 3개 이상 켜진 문장": sum(1 for n in per_line if n > 2), "최대 동시 강조": max(per_line, default=0),
            "줄 전체 강조": whole_rows, "제목 바꾸기": title_changes}


if __name__ == "__main__":
    assert runs({(0, 0), (0, 1), (0, 3)}) == 2 and cells_of("1,2-4") == [(1, 2), (1, 3), (1, 4)]
    for f in sys.argv[1:]:
        d = json.load(open(f, encoding="utf-8"))
        print(f, stats(d.get("blueprint", d)))
