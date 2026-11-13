"""영상 설계도 v0 검사기 (D-27). 형식 규칙은 docs/04-video-blueprint.md.

사용법:
    from pipeline.validate import validate_blueprint
    errors = validate_blueprint(blueprint, page_count=57)   # 빈 목록이면 통과

명령줄:
    py -m pipeline.validate --pages 57 파일.json [파일2.json ...]
"""

from __future__ import annotations

import argparse
import difflib
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

# FE가 구현한 것만 넣는다. 11/11 범위는 D-34, column은 D-43.
SUPPORTED_LAYOUTS = ("row", "column", "tree")
SUPPORTED_SLOTS = ("top", "middle", "bottom")
SUPPORTED_THEMES = ("dark",)

ALL_LAYOUTS = ("row", "column", "tree", "layers", "cycle")
ALL_SLOTS = ("top", "middle", "bottom", "full")
TEXT_STYLES = ("title", "body", "keyword", "formula")
SHAPES = ("box", "circle")
COMPONENT_KEYS = {"texts": "text", "slides": "slide", "diagrams": "diagram", "grids": "grid", "codes": "code"}

LIMITS = {
    "text": {"title": 20, "body": 60, "keyword": 15},
    "diagram_nodes": 6,
    "tree_nodes": 7,
    "tree_levels": 3,
    "layers": 3,
    "layer_nodes": 4,
    "diagram_edges": 8,
    "node_label": 12,
    "grid_row_cells": 12,      # 한 줄 배열
    "grid_2d": (6, 6),         # 2차원 (행, 열)
    "table": (5, 4),           # 칸 내용이 3자를 넘는 칸이 있으면 표로 본다
    "table_cell_trigger": 3,
    "cell_chars": 10,
    "code_lines": 12,
    "code_line_chars": 40,
    "mark_label": 10,
    "marks_visible": 3,
    "scene_lines": 5,
    "actions_per_line": 5,
}

# 동작 이름: 대상이 될 수 있는 종류
ACTIONS = {
    "show": {"text", "slide", "diagram", "node", "edge", "grid", "pointer", "code"},
    "hide": {"text", "slide", "diagram", "node", "edge", "grid", "pointer", "code"},
    "highlight": {"text", "node", "edge", "grid", "pointer", "code"},
    "unhighlight": {"text", "node", "edge", "grid", "pointer", "code"},
    "move": {"pointer"},
    "swap": {"grid"},
    "setValue": {"grid"},
    "setText": {"text"},
    "focus": {"slide"},
    "mark": {"slide"},
    "unmark": {"slide"},
    "markLine": {"code"},
}

EPS = 1e-9


def validate_blueprint(
    blueprint: dict,
    page_count: int,
    supported_layouts=SUPPORTED_LAYOUTS,
    supported_slots=SUPPORTED_SLOTS,
    supported_themes=SUPPORTED_THEMES,
) -> list[str]:
    """설계도 하나를 검사하고 오류 문장 목록을 돌려준다. 비어 있으면 통과다."""
    return _Checker(page_count, supported_layouts, supported_slots, supported_themes).run(blueprint)


class _Checker:
    def __init__(self, page_count, layouts, slots, themes):
        self.page_count = page_count
        self.layouts = tuple(layouts)
        self.slots = tuple(slots)
        self.themes = tuple(themes)
        self.errors: list[str] = []
        self.all_ids: set[str] = set()
        self.items: dict[str, dict] = {}   # 지금 화면에 있을 수 있는 대상 id -> 정보

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    # ---------- 클립 ----------

    def run(self, clip) -> list[str]:
        if not isinstance(clip, dict):
            return ["clip: 설계도는 JSON 객체여야 함"]
        if clip.get("version") != 0:
            self.err("clip", "version은 0이어야 함")
        if not _nonempty_str(clip.get("title")):
            self.err("clip", "title 없음")
        if clip.get("theme") not in self.themes:
            self.err("clip", f"theme은 {', '.join(self.themes)} 중 하나")
        if not isinstance(self.page_count, int) or self.page_count < 1:
            self.err("clip", "page_count(실제 PDF 페이지 수)가 1 이상의 정수가 아님")
            self.page_count = 0
        scenes = clip.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            self.err("clip", "scenes가 비어 있음")
            return self.errors

        scene_ids: set[str] = set()
        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                self.err(f"scene {i}", "장면은 객체여야 함")
                continue
            sid = scene.get("id")
            where = f"scene {sid if _nonempty_str(sid) else i}"
            if not _nonempty_str(sid):
                self.err(where, "id 없음")
            elif sid in scene_ids:
                self.err(where, f"scene id 중복: {sid}")
            else:
                scene_ids.add(sid)
            self.check_scene(scene, where, first=(i == 0))
        return self.errors

    # ---------- 장면 ----------

    def check_scene(self, sc: dict, where: str, first: bool) -> None:
        clear = sc.get("clear")
        if not isinstance(clear, bool):
            self.err(where, "clear는 true 또는 false")
        if first or clear is True:
            self.items = {}

        lines = sc.get("lines")
        if not isinstance(lines, list) or not lines or not all(_nonempty_str(x) for x in lines):
            self.err(where, "lines는 비어 있지 않은 문장 목록이어야 함")
            lines = lines if isinstance(lines, list) else []
        if len(lines) > LIMITS["scene_lines"]:
            self.err(where, f"문장이 {len(lines)}개 (상한 {LIMITS['scene_lines']}개). 장면을 나눌 것")
        if "speech" in sc:
            self.check_speech(sc["speech"], lines, where)

        for key in (*COMPONENT_KEYS, "actions", "sourcePages"):
            if not isinstance(sc.get(key), list):
                self.err(where, f"{key} 배열이 없음 (없으면 []로)")

        pages = [p for p in (sc.get("sourcePages") or []) if self.check_page(p, where, "sourcePages")]

        for key, kind in COMPONENT_KEYS.items():
            for comp in sc.get(key) or []:
                if not isinstance(comp, dict):
                    self.err(where, f"{key}의 항목은 객체여야 함")
                    continue
                self.add_component(comp, kind, where, pages)

        self.run_actions(sc.get("actions") or [], len(lines), where)

    def check_speech(self, speech, lines: list, where: str) -> None:
        """음성 원고(P-AI-04). 생략 가능. 쓰면 lines와 문장 수가 같고, ""는 그 문장을 lines로 읽는다는 뜻."""
        if not isinstance(speech, list) or not all(isinstance(x, str) for x in speech):
            self.err(where, "speech는 문자열 목록이어야 함")
            return
        if len(speech) != len(lines):
            self.err(where, f"speech가 {len(speech)}개, lines가 {len(lines)}개. 문장 수가 같아야 함")
            return
        for i, (sp, ln) in enumerate(zip(speech, lines)):
            if not sp.strip():
                continue
            if re.search(r"[0-9]", sp):
                self.err(where, f"speech[{i}]에 아라비아 숫자가 남아 있음. 한글로 읽는 대로 쓸 것")
            if _similarity(sp, ln) < SPEECH_MIN_SIMILARITY:
                self.err(where, f"speech[{i}]가 lines[{i}]와 내용이 너무 다름. 읽는 법만 바꿀 것")

    def check_page(self, p, where, field) -> bool:
        if not isinstance(p, int) or isinstance(p, bool) or p < 1 or p > self.page_count:
            self.err(where, f"{field}의 페이지 {p!r}가 1~{self.page_count} 범위 밖")
            return False
        return True

    # ---------- 부품 ----------

    def add_id(self, where, ident, info) -> bool:
        if not _nonempty_str(ident):
            self.err(where, "id 없음")
            return False
        if ident in self.all_ids:
            self.err(where, f"id 중복: {ident}")
            return False
        self.all_ids.add(ident)
        self.items[ident] = info
        return True

    def add_component(self, c: dict, kind: str, where: str, pages: list[int]) -> None:
        cid = c.get("id")
        w = f"{where} {cid}"
        info = {"kind": kind, "ref": c, "slot": c.get("slot"), "visible": c.get("hidden") is False}
        if not self.add_id(where, cid, info):
            return
        if c.get("slot") not in self.slots:
            self.err(w, f"slot은 {', '.join(self.slots)} 중 하나")
        if not isinstance(c.get("hidden"), bool):
            self.err(w, "hidden은 true 또는 false")
        getattr(self, f"check_{kind}")(c, info, w, pages)

    def check_text(self, t, info, w, pages):
        style = t.get("style")
        if style not in TEXT_STYLES:
            self.err(w, f"style은 {', '.join(TEXT_STYLES)} 중 하나")
        self.check_text_content(t.get("content"), style, w)

    def check_text_content(self, content, style, w):
        if not _nonempty_str(content):
            self.err(w, "content 없음")
            return
        if style == "formula":
            if "\n" in content:
                self.err(w, "formula는 한 줄이어야 함")
        elif style in LIMITS["text"] and len(content) > LIMITS["text"][style]:
            self.err(w, f"{style} 글자 수 {len(content)}자 (상한 {LIMITS['text'][style]}자)")

    def check_slide(self, s, info, w, pages):
        page = s.get("page")
        if self.check_page(page, w, "page") and page not in pages:
            self.err(w, f"page {page}가 이 장면의 sourcePages에 없음")
        box = _rect(s.get("box"))
        if box is None:
            self.err(w, "box는 [x, y, w, h] 숫자 4개, 너비와 높이는 0보다 크고 영역 전체가 0~1 안")
        info["box"] = box
        info["marks"] = set()

    def check_diagram(self, d, info, w, pages):
        layout = d.get("layout")
        if layout not in ALL_LAYOUTS:
            self.err(w, f"layout은 {', '.join(ALL_LAYOUTS)} 중 하나")
        elif layout not in self.layouts:
            self.err(w, f"layout {layout}은 아직 플레이어가 지원하지 않음 (지원: {', '.join(self.layouts)})")
        nodes = d.get("nodes") if isinstance(d.get("nodes"), list) else []
        edges = d.get("edges") if isinstance(d.get("edges"), list) else []
        if not nodes:
            self.err(w, "nodes가 비어 있음")
        node_ids = set()
        for n in nodes:
            if not isinstance(n, dict):
                self.err(w, "nodes의 항목은 객체여야 함")
                continue
            nid = n.get("id")
            if self.add_id(w, nid, {"kind": "node", "parent": d.get("id"), "visible": n.get("hidden") is not True}):
                node_ids.add(nid)
            if n.get("shape") not in SHAPES:
                self.err(f"{w} {nid}", "shape는 box 또는 circle")
            if not _nonempty_str(n.get("label")):
                self.err(f"{w} {nid}", "label 없음")
            elif len(n["label"]) > LIMITS["node_label"]:
                self.err(f"{w} {nid}", f"label {len(n['label'])}자 (상한 {LIMITS['node_label']}자)")
            if "hidden" in n and not isinstance(n["hidden"], bool):
                self.err(f"{w} {nid}", "hidden은 true 또는 false")
        links = []
        for e in edges:
            if not isinstance(e, dict):
                self.err(w, "edges의 항목은 객체여야 함")
                continue
            eid = e.get("id")
            self.add_id(w, eid, {"kind": "edge", "parent": d.get("id"), "visible": e.get("hidden") is not True})
            a, b = e.get("from"), e.get("to")
            if a not in node_ids or b not in node_ids:
                self.err(f"{w} {eid}", "from, to가 이 다이어그램의 노드가 아님")
            elif a == b:
                self.err(f"{w} {eid}", "자기 자신으로 가는 선")
            else:
                links.append((a, b))
            if "label" in e and not isinstance(e["label"], str):
                self.err(f"{w} {eid}", "label은 문자열")
            if "hidden" in e and not isinstance(e["hidden"], bool):
                self.err(f"{w} {eid}", "hidden은 true 또는 false")

        max_nodes = LIMITS["tree_nodes"] if layout == "tree" else LIMITS["diagram_nodes"]
        if len(nodes) > max_nodes:
            self.err(w, f"노드 {len(nodes)}개 (상한 {max_nodes}개)")
        if len(edges) > LIMITS["diagram_edges"]:
            self.err(w, f"선 {len(edges)}개 (상한 {LIMITS['diagram_edges']}개)")
        if layout == "tree" and node_ids:
            self.check_tree(node_ids, links, w)
        if layout == "layers" and node_ids:
            self.check_layers(node_ids, links, w)

    def check_tree(self, node_ids, links, w):
        parent = {}
        for a, b in links:
            if b in parent:
                self.err(w, f"tree에서 노드 {b}의 부모가 둘 이상")
                return
            parent[b] = a
        roots = [n for n in node_ids if n not in parent]
        if len(roots) != 1:
            self.err(w, f"tree의 뿌리 노드가 {len(roots)}개 (1개여야 함)")
            return
        levels = {}
        for n in node_ids:
            depth, cur, seen = 1, n, set()
            while cur in parent:
                if cur in seen:
                    self.err(w, "tree에 순환이 있음")
                    return
                seen.add(cur)
                cur = parent[cur]
                depth += 1
            levels[n] = depth
        if max(levels.values()) > LIMITS["tree_levels"]:
            self.err(w, f"tree 깊이 {max(levels.values())}단 (상한 {LIMITS['tree_levels']}단)")

    def check_layers(self, node_ids, links, w):
        layer = {n: 0 for n in node_ids}
        for _ in range(len(node_ids)):
            changed = False
            for a, b in links:
                if layer[b] < layer[a] + 1:
                    layer[b] = layer[a] + 1
                    changed = True
            if not changed:
                break
        else:
            self.err(w, "layers에 순환이 있음")
            return
        count = defaultdict(int)
        for v in layer.values():
            count[v] += 1
        if len(count) > LIMITS["layers"]:
            self.err(w, f"layers {len(count)}층 (상한 {LIMITS['layers']}층)")
        if max(count.values()) > LIMITS["layer_nodes"]:
            self.err(w, f"한 층에 노드 {max(count.values())}개 (상한 {LIMITS['layer_nodes']}개)")

    def check_grid(self, g, info, w, pages):
        cells = g.get("cells")
        ok = (isinstance(cells, list) and cells
              and all(isinstance(r, list) and r and all(isinstance(x, str) for x in r) for r in cells))
        if not ok:
            self.err(w, "cells는 문자열 칸의 줄 목록이어야 함")
            info["cells"] = [[]]
            return
        info["cells"] = [list(r) for r in cells]
        if not isinstance(g.get("indexLabels"), bool):
            self.err(w, "indexLabels는 true 또는 false")
        rows, cols = len(cells), max(len(r) for r in cells)
        if rows == 1:
            if cols > LIMITS["grid_row_cells"]:
                self.err(w, f"한 줄 배열 {cols}칸 (상한 {LIMITS['grid_row_cells']}칸)")
        else:
            table = any(len(x) > LIMITS["table_cell_trigger"] for r in cells for x in r)
            mr, mc = LIMITS["table"] if table else LIMITS["grid_2d"]
            if rows > mr or cols > mc:
                self.err(w, f"{'표' if table else '2차원 격자'} {rows}×{cols} (상한 {mr}×{mc})")
        for r in cells:
            for x in r:
                if len(x) > LIMITS["cell_chars"]:
                    self.err(w, f"칸 내용 '{x}' {len(x)}자 (상한 {LIMITS['cell_chars']}자)")
        pointers = g.get("pointers")
        if not isinstance(pointers, list):
            self.err(w, "pointers 배열이 없음 (없으면 []로)")
            pointers = []
        for p in pointers:
            if not isinstance(p, dict):
                self.err(w, "pointers의 항목은 객체여야 함")
                continue
            pid = p.get("id")
            pinfo = {"kind": "pointer", "grid": g.get("id"), "visible": p.get("hidden") is False}
            self.add_id(w, pid, pinfo)
            if not _nonempty_str(p.get("label")):
                self.err(f"{w} {pid}", "label 없음")
            if not isinstance(p.get("hidden"), bool):
                self.err(f"{w} {pid}", "hidden은 true 또는 false")
            r, c = p.get("row"), p.get("col")
            if not (_int(r) and _int(c) and 0 <= r < rows and 0 <= c < len(cells[r])):
                self.err(f"{w} {pid}", f"위치 ({r}, {c})가 격자 밖")

    def check_code(self, c, info, w, pages):
        if not _nonempty_str(c.get("language")):
            self.err(w, "language 없음")
        lines = c.get("lines")
        if not isinstance(lines, list) or not lines or not all(isinstance(x, str) for x in lines):
            self.err(w, "lines는 비어 있지 않은 문자열 목록이어야 함")
            info["lines"] = 0
            return
        info["lines"] = len(lines)
        if len(lines) > LIMITS["code_lines"]:
            self.err(w, f"코드 {len(lines)}줄 (상한 {LIMITS['code_lines']}줄)")
        for i, x in enumerate(lines, 1):
            if len(x) > LIMITS["code_line_chars"]:
                self.err(w, f"{i}번째 줄 {len(x)}자 (상한 {LIMITS['code_line_chars']}자)")

    # ---------- 동작 ----------

    def run_actions(self, actions: list, n_lines: int, where: str) -> None:
        by_line = defaultdict(list)
        last = 0
        for i, a in enumerate(actions):
            w = f"{where} action {i}"
            if not isinstance(a, dict):
                self.err(w, "동작은 객체여야 함")
                continue
            line = a.get("line")
            if not _int(line) or not 0 <= line < n_lines:
                self.err(w, f"line {line!r}이 문장 범위(0~{n_lines - 1}) 밖")
                continue
            if line < last:
                self.err(w, "line 순서가 뒤로 감 (문장 순서대로 적을 것)")
            last = max(last, line)
            by_line[line].append((w, a))

        for line in range(n_lines):
            acts = by_line.get(line, [])
            if len(acts) > LIMITS["actions_per_line"]:
                self.err(f"{where} line {line}", f"동작 {len(acts)}개 (상한 {LIMITS['actions_per_line']}개). 문장을 나눌 것")
            for w, a in acts:
                self.apply(a, w)
            self.check_screen(f"{where} line {line}")

    def apply(self, a: dict, w: str) -> None:
        do, target, args = a.get("do"), a.get("target"), a.get("args")
        if do not in ACTIONS:
            self.err(w, f"모르는 동작: {do}")
            return
        info = self.items.get(target)
        if info is None:
            self.err(w, f"대상 없음: {target} (이 장면이나 clear: false로 이어지는 앞 장면에 있어야 함)")
            return
        kind = info["kind"]
        if kind not in ACTIONS[do]:
            self.err(w, f"{do}는 {kind}에 쓸 수 없음")
            return
        if not isinstance(args, list) or not all(isinstance(x, str) for x in args):
            self.err(w, "args는 문자열 배열")
            return

        if do in ("show", "hide"):
            if args:
                self.err(w, f"{do}는 args가 없어야 함")
            info["visible"] = do == "show"
        elif do in ("highlight", "unhighlight"):
            if kind == "grid":
                if not args:
                    self.err(w, "격자 강조에는 칸 위치가 필요함")
                for s in args:
                    self.cells_of(info["cells"], s, w)
            elif args:
                self.err(w, f"{kind} 강조에는 args가 없어야 함")
        elif do == "move":
            grid = self.items.get(info["grid"])
            if len(args) != 1:
                self.err(w, "move는 칸 위치 1개")
            elif grid:
                self.cell_of(grid["cells"], args[0], w)
        elif do == "swap":
            if len(args) != 2:
                self.err(w, "swap은 칸 위치 2개")
                return
            p, q = self.cell_of(info["cells"], args[0], w), self.cell_of(info["cells"], args[1], w)
            if p and q:
                g = info["cells"]
                g[p[0]][p[1]], g[q[0]][q[1]] = g[q[0]][q[1]], g[p[0]][p[1]]
        elif do == "setValue":
            if len(args) != 2:
                self.err(w, "setValue는 칸 위치와 새 값")
                return
            p = self.cell_of(info["cells"], args[0], w)
            if len(args[1]) > LIMITS["cell_chars"]:
                self.err(w, f"새 값 {len(args[1])}자 (상한 {LIMITS['cell_chars']}자)")
            if p:
                info["cells"][p[0]][p[1]] = args[1]
        elif do == "setText":
            if len(args) != 1:
                self.err(w, "setText는 새 내용 1개")
            else:
                self.check_text_content(args[0], info["ref"].get("style"), w)
        elif do in ("focus", "mark", "unmark"):
            self.slide_action(do, info, args, w)
        elif do == "markLine":
            if len(args) != 1 or not args[0].isdigit() or not 1 <= int(args[0]) <= info["lines"]:
                self.err(w, f"markLine 줄 번호는 1~{info['lines']}")

    def slide_action(self, do, info, args, w):
        max_args = 2 if do == "mark" else 1
        if not 1 <= len(args) <= max_args:
            self.err(w, f"{do}의 args는 \"x,y,w,h\"" + (" 와 라벨(생략 가능)" if do == "mark" else ""))
            return
        rect = _rect(args[0].split(","))
        if rect is None:
            self.err(w, f"{do} 영역 \"{args[0]}\"는 0~1 안의 \"x,y,w,h\"")
            return
        box = info.get("box")
        if box and not _inside(rect, box):
            self.err(w, f"{do} 영역이 원본 조각의 box 밖")
        if do == "mark":
            if len(args) == 2 and len(args[1]) > LIMITS["mark_label"]:
                self.err(w, f"mark 라벨 {len(args[1])}자 (상한 {LIMITS['mark_label']}자)")
            info["marks"].add(rect)
        elif do == "unmark":
            if rect not in info["marks"]:
                self.err(w, "unmark할 mark가 없음 (mark와 같은 영역을 적을 것)")
            info["marks"].discard(rect)

    def check_screen(self, where: str) -> None:
        by_slot = defaultdict(list)
        for ident, info in self.items.items():
            if info["kind"] in COMPONENT_KEYS.values() and info["visible"]:
                by_slot[info["slot"]].append(ident)
                if info["kind"] == "slide" and len(info["marks"]) > LIMITS["marks_visible"]:
                    self.err(where, f"{ident}에 mark {len(info['marks'])}개 (상한 {LIMITS['marks_visible']}개)")
        for slot, ids in by_slot.items():
            if len(ids) > 1:
                self.err(where, f"{slot} 자리에 부품 {len(ids)}개가 동시에 보임: {', '.join(ids)}")
        if by_slot.get("full") and len(by_slot) > 1:
            self.err(where, "full 부품이 보이는 동안 다른 부품이 보임")

    # ---------- 칸 위치 ----------

    def cell_of(self, cells, s, w):
        """'4' -> (0, 4), '1,3' -> (1, 3)"""
        parts = s.split(",")
        try:
            nums = [int(x) for x in parts]
        except ValueError:
            nums = []
        if len(nums) == 1:
            nums = [0, nums[0]]
        if len(nums) != 2 or not (0 <= nums[0] < len(cells) and 0 <= nums[1] < len(cells[nums[0]])):
            self.err(w, f"칸 위치가 범위 밖: {s}")
            return None
        return nums[0], nums[1]

    def cells_of(self, cells, s, w):
        """'0-3' 또는 '1,0-3' 같은 범위도 받는다."""
        head, _, tail = s.rpartition(",")
        if "-" in tail:
            a, _, b = tail.partition("-")
            prefix = f"{head}," if head else ""
            p, q = self.cell_of(cells, prefix + a, w), self.cell_of(cells, prefix + b, w)
            if p and q and p[1] > q[1]:
                self.err(w, f"범위가 거꾸로임: {s}")
        else:
            self.cell_of(cells, s, w)


# speech와 lines 비교(P-AI-04): 숫자·수사·기호를 빼고 남은 글이 이만큼은 같아야 한다.
SPEECH_MIN_SIMILARITY = 0.5
_NUMBERISH = re.compile(r"[0-9\s.,!?~·:;()\[\]{}+\-*/=<>^%'\"“”‘’…]|[영공일이삼사오육칠팔구십백천만억하나둘셋넷다섯여섯일곱여덟아홉열스물서른마흔쉰]")


def _similarity(a: str, b: str) -> float:
    a, b = _NUMBERISH.sub("", a), _NUMBERISH.sub("", b)
    if not a or not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _nonempty_str(x) -> bool:
    return isinstance(x, str) and x.strip() != ""


def _int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _rect(values):
    """[x, y, w, h]를 숫자 4개로 바꾼다. 형식이 틀리거나 0~1 밖이면 None."""
    if not isinstance(values, list) or len(values) != 4:
        return None
    try:
        x, y, w, h = (float(v) for v in values)
    except (TypeError, ValueError):
        return None
    if any(isinstance(v, bool) for v in values):
        return None
    if not all(math.isfinite(v) for v in (x, y, w, h)) or w <= 0 or h <= 0:
        return None
    if x < -EPS or y < -EPS or x + w > 1 + EPS or y + h > 1 + EPS:
        return None
    return (round(x, 6), round(y, 6), round(w, 6), round(h, 6))


def _inside(r, box) -> bool:
    return (r[0] >= box[0] - EPS and r[1] >= box[1] - EPS
            and r[0] + r[2] <= box[0] + box[2] + EPS and r[1] + r[3] <= box[1] + box[3] + EPS)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="영상 설계도 v0 검사기")
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--pages", type=int, required=True, help="실제 PDF 페이지 수")
    ap.add_argument("--all-layouts", action="store_true", help="아직 플레이어가 지원하지 않는 배치와 full 자리도 허용")
    args = ap.parse_args(argv)
    extra = {"supported_layouts": ALL_LAYOUTS, "supported_slots": ALL_SLOTS} if args.all_layouts else {}
    failed = 0
    for f in args.files:
        try:
            clip = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            errors = [f"JSON을 읽을 수 없음: {e}"]
        else:
            errors = validate_blueprint(clip, args.pages, **extra)
        print(f"{'통과' if not errors else '실패'}: {f}")
        for e in errors:
            print(f"  - {e}")
        failed += bool(errors)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
