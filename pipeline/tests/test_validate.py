"""검사기 테스트. 실행: py -m unittest discover -s pipeline/tests -t ."""

import copy
import json
import unittest
from pathlib import Path

from pipeline.validate import ALL_LAYOUTS, ALL_SLOTS, validate_blueprint

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "sandbox" / "ai" / "blueprint_v0"


def base_clip():
    """모든 11/11 필수 부품을 조금씩 쓰는 작은 정상 설계도."""
    return {
        "version": 0, "title": "합병 정렬", "theme": "dark",
        "scenes": [
            {
                "id": "s1", "clear": True,
                "lines": ["배열을 반으로 나눕니다.", "나눈 결과를 트리로 봅니다."],
                "texts": [{"id": "t1", "slot": "top", "style": "title", "content": "합병 정렬", "hidden": False}],
                "slides": [],
                "diagrams": [{
                    "id": "d1", "slot": "bottom", "layout": "tree", "hidden": True,
                    "nodes": [
                        {"id": "n1", "label": "8 3 5 1", "shape": "box"},
                        {"id": "n2", "label": "8 3", "shape": "box"},
                        {"id": "n3", "label": "5 1", "shape": "box"},
                    ],
                    "edges": [
                        {"id": "e1", "from": "n1", "to": "n2"},
                        {"id": "e2", "from": "n1", "to": "n3", "hidden": True},
                    ],
                }],
                "grids": [{
                    "id": "g1", "slot": "middle", "indexLabels": True, "hidden": False,
                    "cells": [["8", "3", "5", "1"]],
                    "pointers": [{"id": "p1", "label": "mid", "row": 0, "col": 1, "hidden": True}],
                }],
                "codes": [],
                "actions": [
                    {"line": 0, "do": "show", "target": "p1", "args": []},
                    {"line": 0, "do": "highlight", "target": "g1", "args": ["0-1"]},
                    {"line": 1, "do": "show", "target": "d1", "args": []},
                    {"line": 1, "do": "show", "target": "e2", "args": []},
                ],
                "sourcePages": [10],
            },
            {
                "id": "s2", "clear": True,
                "lines": ["슬라이드의 점화식을 봅니다.", "코드로 확인합니다."],
                "texts": [{"id": "t2", "slot": "top", "style": "formula", "content": "$T(n)=2T(n/2)+n$", "hidden": False}],
                "slides": [{"id": "sl1", "slot": "middle", "page": 12, "box": [0.1, 0.2, 0.8, 0.5], "hidden": False}],
                "diagrams": [],
                "grids": [],
                "codes": [{"id": "c1", "slot": "bottom", "language": "pseudo", "hidden": True,
                           "lines": ["mergeSort(A, l, r)", "  m = (l + r) / 2"]}],
                "actions": [
                    {"line": 0, "do": "focus", "target": "sl1", "args": ["0.2,0.3,0.4,0.2"]},
                    {"line": 0, "do": "mark", "target": "sl1", "args": ["0.2,0.3,0.2,0.1", "점화식"]},
                    {"line": 1, "do": "unmark", "target": "sl1", "args": ["0.2,0.3,0.2,0.1"]},
                    {"line": 1, "do": "show", "target": "c1", "args": []},
                    {"line": 1, "do": "markLine", "target": "c1", "args": ["2"]},
                ],
                "sourcePages": [12],
            },
        ],
    }


def errors_of(clip, pages=57, **kw):
    return validate_blueprint(clip, pages, **kw)


class SampleTests(unittest.TestCase):
    def test_base_clip_passes(self):
        self.assertEqual(errors_of(base_clip()), [])

    def test_samples_pass(self):
        for name in ("sample1_concept_quicksort.json", "sample2_process_partition.json"):
            clip = json.loads((SAMPLES / name).read_text(encoding="utf-8"))
            self.assertEqual(errors_of(clip), [], name)

    def test_sample3_passes_with_all_layouts(self):
        clip = json.loads((SAMPLES / "sample3_papertest_mvc.json").read_text(encoding="utf-8"))
        self.assertEqual(errors_of(clip, supported_layouts=ALL_LAYOUTS, supported_slots=ALL_SLOTS), [])
        self.assertTrue(any("layout cycle" in e for e in errors_of(clip)))


class ErrorTests(unittest.TestCase):
    def assertError(self, clip, text, **kw):
        errs = errors_of(clip, **kw)
        self.assertTrue(any(text in e for e in errs), f"'{text}' 오류가 없음: {errs}")

    def test_two_components_in_one_slot(self):
        c = base_clip()
        c["scenes"][0]["texts"].append({"id": "t9", "slot": "top", "style": "body", "content": "설명", "hidden": False})
        self.assertError(c, "top 자리에 부품 2개")

    def test_hide_then_show_in_same_slot_is_ok(self):
        c = base_clip()
        c["scenes"][0]["texts"].append({"id": "t9", "slot": "top", "style": "body", "content": "설명", "hidden": True})
        c["scenes"][0]["actions"] += [
            {"line": 1, "do": "hide", "target": "t1", "args": []},
            {"line": 1, "do": "show", "target": "t9", "args": []},
        ]
        c["scenes"][0]["actions"] = [a for a in c["scenes"][0]["actions"] if a["target"] != "e2"]
        self.assertEqual(errors_of(c), [])

    def test_full_slot_alone(self):
        c = base_clip()
        c["scenes"][1]["slides"][0]["slot"] = "full"
        self.assertError(c, "slot은")  # 11/11 범위에서는 full 미지원
        self.assertError(c, "full 부품이 보이는 동안", supported_slots=ALL_SLOTS)

    def test_page_out_of_range(self):
        c = base_clip()
        c["scenes"][1]["sourcePages"] = [99]
        c["scenes"][1]["slides"][0]["page"] = 99
        self.assertError(c, "1~57 범위 밖")

    def test_slide_page_not_in_source_pages(self):
        c = base_clip()
        c["scenes"][1]["sourcePages"] = [11]
        self.assertError(c, "sourcePages에 없음")

    def test_unsupported_layout(self):
        c = base_clip()
        c["scenes"][0]["diagrams"][0]["layout"] = "cycle"
        self.assertError(c, "아직 플레이어가 지원하지 않음")

    def test_title_too_long(self):
        c = base_clip()
        c["scenes"][0]["texts"][0]["content"] = "가" * 21
        self.assertError(c, "title 글자 수 21자")

    def test_swap_out_of_range(self):
        c = base_clip()
        c["scenes"][0]["actions"].append({"line": 1, "do": "swap", "target": "g1", "args": ["0", "4"]})
        self.assertError(c, "칸 위치가 범위 밖: 4")

    def test_mark_outside_box(self):
        c = base_clip()
        c["scenes"][1]["actions"][1]["args"] = ["0.0,0.0,0.2,0.1", "x"]
        self.assertError(c, "mark 영역이 원본 조각의 box 밖")

    def test_unmark_without_mark(self):
        c = base_clip()
        c["scenes"][1]["actions"][2]["args"] = ["0.5,0.3,0.1,0.1"]
        self.assertError(c, "unmark할 mark가 없음")

    def test_duplicate_id(self):
        c = base_clip()
        c["scenes"][1]["texts"][0]["id"] = "t1"
        self.assertError(c, "id 중복: t1")

    def test_duplicate_scene_id(self):
        c = base_clip()
        c["scenes"][1]["id"] = "s1"
        self.assertError(c, "scene id 중복")

    def test_too_many_actions_per_line(self):
        c = base_clip()
        c["scenes"][0]["actions"] += [{"line": 0, "do": "highlight", "target": "t1", "args": []}] * 4
        self.assertError(c, "동작 6개")

    def test_tree_too_deep(self):
        c = base_clip()
        d = c["scenes"][0]["diagrams"][0]
        d["nodes"].append({"id": "n4", "label": "8", "shape": "box"})
        d["nodes"].append({"id": "n5", "label": "8", "shape": "box"})
        d["edges"].append({"id": "e3", "from": "n2", "to": "n4"})
        d["edges"].append({"id": "e4", "from": "n4", "to": "n5"})
        self.assertError(c, "tree 깊이 4단")

    def test_target_from_cleared_scene(self):
        c = base_clip()
        c["scenes"][1]["actions"].append({"line": 1, "do": "show", "target": "g1", "args": []})
        self.assertError(c, "대상 없음: g1")

    def test_clear_false_keeps_components(self):
        c = base_clip()
        c["scenes"][1]["clear"] = False
        # 앞 장면의 t1(top), g1(middle)이 남아 있어 자리가 겹친다
        self.assertError(c, "top 자리에 부품 2개")

    def test_box_out_of_range(self):
        c = base_clip()
        c["scenes"][1]["slides"][0]["box"] = [0.5, 0.5, 0.6, 0.2]
        self.assertError(c, "box는")

    def test_marked_line_out_of_range(self):
        c = base_clip()
        c["scenes"][1]["actions"][4]["args"] = ["3"]
        self.assertError(c, "markLine 줄 번호는 1~2")

    def test_input_not_modified(self):
        c = base_clip()
        before = copy.deepcopy(c)
        errors_of(c)
        self.assertEqual(c, before)


if __name__ == "__main__":
    unittest.main()
