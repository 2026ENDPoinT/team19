"""검사기 테스트. 실행: py -m unittest discover -s pipeline/tests -t ."""

import copy
import json
import unittest
from pathlib import Path

from pipeline.validate import ALL_LAYOUTS, ALL_SLOTS, screen_text_errors, validate_blueprint

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
        self.assertTrue(any("layout cycle" in e for e in errors_of(clip, supported_layouts=("row", "column", "tree"))))


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
        self.assertError(c, "아직 플레이어가 지원하지 않음", supported_layouts=("row", "column", "tree"))
        self.assertEqual(errors_of(c), [])  # cycle, layers는 D-52부터 기본 지원

    def test_title_too_long(self):
        c = base_clip()
        c["scenes"][0]["texts"][0]["content"] = "가" * 21
        self.assertError(c, "title 글자 수 21자")

    def test_body_text_must_not_be_a_sentence(self):
        for content, bad in [("이제 양쪽 네 구간이 모두 정렬됐어요", True), ("분할은 상수 시간이다.", True),
                             ("네 구간 정렬 완료", False), ("MVC 개요", False), ("합병에 필요", False)]:
            c = base_clip()
            c["scenes"][0]["texts"][0].update(style="body", content=content)
            self.assertEqual(bool(screen_text_errors(c)), bad, content)
            self.assertEqual(errors_of(c), [])  # 형식 계약은 문장형을 막지 않는다(BE 샘플 모드)
        c = base_clip()  # setText로 바꾼 글과 title은 각각 잡고, 넘어간다
        c["scenes"][0]["texts"].append({"id": "t9", "slot": "middle", "style": "keyword", "content": "분할", "hidden": True})
        c["scenes"][0]["actions"].append({"line": 1, "do": "setText", "target": "t9", "args": ["반으로 나눠요"]})
        c["scenes"][0]["actions"].append({"line": 1, "do": "setText", "target": "t1", "args": ["반으로 나눠요"]})
        self.assertEqual(len(screen_text_errors(c)), 1)

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


class TermTests(unittest.TestCase):
    """수식 항 강조 \\term{id}{LaTeX} (D-46)."""

    FORMULA = r"$Q=\term{p}{\sum_{s'}P}\big[\term{r}{R^a_{ss'}}+\term{g}{\gamma\frac{\term{n}{a}}{b}}\big]$"

    def clip(self, content=FORMULA, args=("r",), set_text=None):
        c = base_clip()
        s2 = c["scenes"][1]
        s2["texts"][0]["content"] = content
        acts = [{"line": 0, "do": "highlight", "target": "t2", "args": list(args)}]
        if set_text:
            acts = [{"line": 0, "do": "setText", "target": "t2", "args": [set_text]},
                    {"line": 1, "do": "highlight", "target": "t2", "args": list(args)}]
        s2["actions"] = [a for a in s2["actions"] if a["target"] != "t2"] + acts
        s2["actions"].sort(key=lambda a: a["line"])
        return c

    def errs(self, c, on=True):
        return validate_blueprint(c, 57, formula_terms=on)

    def test_good_terms(self):
        self.assertEqual(self.errs(self.clip(args=("r", "g"))), [])
        self.assertEqual(self.errs(self.clip(args=("n",))), [])     # 분수 안의 항
        self.assertEqual(self.errs(self.clip(args=())), [])         # args 없으면 수식 전체

    def test_unknown_term_and_set_text(self):
        self.assertTrue(any("항 x가 없음" in e for e in self.errs(self.clip(args=("x",)))))
        # setText 뒤에는 새 내용의 항만 쓸 수 있다
        new = r"$\term{r}{R}+1$"
        self.assertEqual(self.errs(self.clip(set_text=new, args=("r",))), [])
        self.assertTrue(self.errs(self.clip(set_text=new, args=("g",))))

    def test_bad_shapes(self):
        self.assertTrue(any("중복" in e for e in self.errs(self.clip(content=r"$\term{a}{x}+\term{a}{y}$", args=("a",)))))
        self.assertTrue(any("모양" in e for e in self.errs(self.clip(content=r"$\term{a}{x+1$", args=()))))
        self.assertTrue(any("소문자" in e for e in self.errs(self.clip(content=r"$\term{A}{x}$", args=()))))

    def test_off_until_fe_ready(self):
        self.assertTrue(any("지원하지 않음" in e for e in self.errs(self.clip(), on=False)))
        c = base_clip()
        c["scenes"][0]["texts"][0]["content"] = r"\term{a}{x}"
        self.assertTrue(any("formula에만" in e for e in self.errs(c)))


if __name__ == "__main__":
    unittest.main()


class SpeechTests(unittest.TestCase):
    """음성 원고 speech (P-AI-04)."""

    def with_speech(self, speech):
        clip = base_clip()
        clip["scenes"][0]["speech"] = speech
        return errors_of(clip)

    def test_speech_ok(self):
        self.assertEqual(self.with_speech(["", "나눈 결과를 트리로 봐요."]), [])

    def test_speech_count_mismatch(self):
        self.assertTrue(any("문장 수" in e for e in self.with_speech([""])))

    def test_speech_digits(self):
        self.assertTrue(any("아라비아 숫자" in e for e in self.with_speech(["배열을 2개로 나눕니다.", ""])))

    def test_speech_content_changed(self):
        self.assertTrue(any("내용이 너무 다름" in e for e in self.with_speech(["오늘은 날씨가 좋아요.", ""])))

    def test_audio_uses_speech(self):
        from unittest import mock
        from pipeline import audio
        clip = base_clip()
        clip["scenes"][0]["speech"] = ["배열을 반으로 갈라요.", ""]
        sent = []

        def fake_tts(client, model, voice, text):
            sent.append(text)
            return b"\x00\x00" * 2400

        import tempfile
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(audio, "_tts", side_effect=fake_tts), \
                mock.patch.object(audio, "_client", return_value=object()):
            r = audio.make_audio(clip, d, fmt="wav")
        self.assertEqual(sent[0], "배열을 반으로 갈라요.")
        self.assertEqual(sent[1], clip["scenes"][0]["lines"][1])
        self.assertEqual(r["captions"][0]["text"], clip["scenes"][0]["lines"][0])


def test_stamp_action():
    import copy
    from pipeline.validate import validate_blueprint
    bp = {"version": 0, "title": "t", "theme": "dark", "scenes": [{"id": "s1", "clear": True, "lines": ["가", "나"], "speech": ["", ""],
          "texts": [{"id": "t1", "slot": "top", "style": "title", "content": "제목", "hidden": False}], "slides": [], "diagrams": [], "grids": [], "codes": [],
          "actions": [{"line": 0, "do": "stamp", "target": "t1", "args": ["x"]}, {"line": 1, "do": "unstamp", "target": "t1", "args": []}], "sourcePages": [1]}]}
    assert validate_blueprint(bp, 1) == []
    bad = copy.deepcopy(bp)
    bad["scenes"][0]["actions"][0]["args"] = ["v"]
    assert any("stamp" in e for e in validate_blueprint(bad, 1))


def test_place_action_and_top_slot():
    import copy
    from pipeline.validate import validate_blueprint
    bp = {"version": 0, "title": "t", "theme": "dark", "scenes": [{"id": "s1", "clear": True, "lines": ["가", "나"], "speech": ["", ""],
          "texts": [{"id": "t1", "slot": "top", "style": "title", "content": "제목", "hidden": False},
                    {"id": "k1", "slot": "middle", "style": "keyword", "content": "핵심", "hidden": False},
                    {"id": "k2", "slot": "middle", "style": "keyword", "content": "다음", "hidden": True}],
          "slides": [], "diagrams": [], "grids": [], "codes": [],
          "actions": [{"line": 1, "do": "place", "target": "k1", "args": ["top"]}, {"line": 1, "do": "show", "target": "k2", "args": []}],
          "sourcePages": [1]}]}
    assert validate_blueprint(bp, 1) == []                       # 위 자리: 제목 + 부품 1개
    bad = copy.deepcopy(bp)
    bad["scenes"][0]["texts"][2]["slot"] = "top"
    bad["scenes"][0]["actions"][1]["target"] = "k2"
    bad["scenes"][0]["actions"].append({"line": 1, "do": "place", "target": "k2", "args": ["top"]})
    assert validate_blueprint(bad, 1)                            # 위 자리에 부품 2개 + 제목은 안 됨
    bad2 = copy.deepcopy(bp)
    bad2["scenes"][0]["actions"][0]["args"] = ["full"]
    assert any("place" in e for e in validate_blueprint(bad2, 1))
