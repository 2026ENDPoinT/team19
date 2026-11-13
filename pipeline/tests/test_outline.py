"""분할 계획과 페이지 해설 테스트. 모델 호출은 가짜로 바꿔서 유료 호출이 없다."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import pipeline
from pipeline import describe, outline
from pipeline.errors import PipelineError

PAGES = [{"number": n, "text": f"page {n} text about pipes and filters", "description": ""} for n in range(1, 6)]


def plan(pid, pages, pre=(), title="파이프 앤 필터(pipe and filter)", kind="concept"):
    return {"id": pid, "title": title, "kind": kind, "sourcePages": list(pages), "prerequisites": list(pre),
            "brief": "앞 필터의 출력이 다음 필터의 입력이 되는 구조를 예시 명령으로 따라간다."}


GOOD = {"sections": [{"title": "구조", "planIds": ["c1", "c2"]}],
        "clipPlans": [plan("c1", [2, 3]), plan("c2", [4], pre=["c1"], kind="example")]}
USAGE = {"provider": "fake", "model": "fake", "inputTokens": 1, "outputTokens": 1, "costUsd": 0.0}


class OutlineTest(unittest.TestCase):
    def test_good_outline_passes_and_gets_order(self):
        with mock.patch.object(outline.llm, "call_json", return_value=(GOOD, USAGE)) as call:
            r = outline.plan_outline("intro", PAGES, [])
        self.assertEqual(call.call_count, 1)
        self.assertEqual([p["order"] for p in r["clipPlans"]], [0, 1])
        self.assertEqual(r["clipPlans"][1]["prerequisites"], ["c1"])
        self.assertEqual(set(r), {"sections", "clipPlans", "usage"})

    def test_invalid_then_fixed_retries_once(self):
        bad = {"clipPlans": [plan("c1", [99])]}
        with mock.patch.object(outline.llm, "call_json", side_effect=[(bad, USAGE), (GOOD, USAGE)]) as call:
            r = outline.plan_outline("review", PAGES, [])
        self.assertEqual(call.call_count, 2)
        self.assertIn("없는 페이지 [99]", call.call_args_list[1].args[2])
        self.assertEqual(len(r["usage"]), 2)

    def test_still_invalid_raises(self):
        bad = {"clipPlans": [plan("c1", [1], pre=["c9"])]}
        with mock.patch.object(outline.llm, "call_json", return_value=(bad, USAGE)):
            with self.assertRaises(PipelineError) as e:
                outline.plan_outline("exam", PAGES, [])
        self.assertEqual(e.exception.code, "OUTLINE_INVALID")
        self.assertTrue(e.exception.retryable)

    def test_validation_rules(self):
        nums = {1, 2, 3}
        too_many = {"clipPlans": [plan(f"c{i}", [1]) for i in range(outline.CAPS["intro"] + 1)]}
        self.assertTrue(any("최대" in e for e in outline.validate_outline(too_many, "intro", nums)))
        long_title = {"clipPlans": [plan("c1", [1], title="가" * 31)]}
        self.assertTrue(outline.validate_outline(long_title, "intro", nums))
        bad_kind = {"clipPlans": [plan("c1", [1], kind="quiz")]}
        self.assertTrue(outline.validate_outline(bad_kind, "intro", nums))
        dup = {"clipPlans": [plan("c1", [1]), plan("c1", [2])]}
        self.assertTrue(outline.validate_outline(dup, "intro", nums))
        self.assertEqual(outline.validate_outline(GOOD, "intro", {1, 2, 3, 4}), [])

    def test_bad_mode_and_no_text(self):
        with self.assertRaises(PipelineError) as e:
            outline.plan_outline("deep", PAGES, [])
        self.assertEqual(e.exception.code, "INVALID_MODE")
        empty = [{"number": 1, "text": "  ", "description": ""}]
        with self.assertRaises(PipelineError) as e:
            outline.plan_outline("intro", empty, [{"number": 1, "description": ""}])
        self.assertEqual(e.exception.code, "PDF_NO_TEXT")

    def test_prompt_uses_descriptions_and_caps(self):
        user = outline.build_user_prompt("intro", PAGES, {2: "[표지] 장식"})
        self.assertIn("(페이지 해설) [표지] 장식", user)
        system = outline.build_system_prompt("exam")
        self.assertNotIn("<<", system)
        self.assertIn(str(outline.CAPS["exam"]), system)


class DescribeTest(unittest.TestCase):
    def test_batches_skip_empty_and_tag(self):
        with tempfile.TemporaryDirectory() as d:
            pages = []
            for n in range(1, 9):
                img = Path(d) / f"p{n}.png"
                img.write_bytes(b"png")
                pages.append({"number": n, "text": "t", "imagePath": str(img), "empty": n == 8})

            def fake(model, system, text, images, max_tokens):
                nums = [int(Path(p).stem[1:]) for p in images]
                return {"pages": [{"number": n, "kind": "cover" if n == 1 else "content",
                                   "description": f"d{n}", "textBroken": n == 2} for n in nums]}, USAGE

            with mock.patch.object(describe.llm, "call_json", side_effect=fake) as call:
                r = describe.describe_pages(pages)
        self.assertEqual(call.call_count, 2)                     # 7쪽을 6쪽씩
        self.assertEqual([p["number"] for p in r["pages"]], list(range(1, 9)))
        self.assertTrue(r["pages"][0]["description"].startswith("[표지]"))
        self.assertIn("추출 글자 깨짐", r["pages"][1]["description"])
        self.assertEqual(r["pages"][7]["kind"], "empty")
        self.assertEqual(r["pages"][7]["description"], "")

    def test_missing_item_in_response_is_blank(self):
        with tempfile.TemporaryDirectory() as d:
            img = Path(d) / "p1.png"
            img.write_bytes(b"png")
            pages = [{"number": 1, "text": "t", "imagePath": str(img), "empty": False}]
            with mock.patch.object(describe.llm, "call_json", return_value=({"pages": []}, USAGE)):
                r = describe.describe_pages(pages)
        self.assertEqual(r["pages"][0], {"number": 1, "description": "", "kind": "content", "textBroken": False})


class PackageTest(unittest.TestCase):
    def test_five_functions_exported(self):
        for name in ("extract_pdf", "describe_pages", "plan_outline", "make_blueprint", "make_audio"):
            self.assertTrue(callable(getattr(pipeline, name)), name)

    def test_import_is_light(self):
        # BE는 pipeline.validate만 가져다 쓴다. 패키지를 불러와도 PyMuPDF·SDK를 불러오지 않아야 한다.
        import subprocess
        code = "import pipeline, pipeline.validate, sys; print('pymupdf' in sys.modules, 'openai' in sys.modules)"
        out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                             cwd=Path(__file__).resolve().parents[2]).stdout.strip()
        self.assertEqual(out, "False False")


if __name__ == "__main__":
    unittest.main()


class CapTest(unittest.TestCase):
    def test_cap_scales_with_content_pages(self):
        self.assertEqual(outline.clip_cap("intro", 5), 2)
        self.assertEqual(outline.clip_cap("review", 26), 6)
        self.assertEqual(outline.clip_cap("exam", 57), 19)
        self.assertEqual(outline.clip_cap("exam", 200), 20)
        pages = [{"number": n, "text": "t"} for n in range(1, 5)]
        self.assertEqual(outline.count_content_pages(pages, {1: "[표지] 제목", 2: "글자만"}), 3)

    def test_cap_applied_in_validation(self):
        data = {"clipPlans": [plan(f"c{i}", [1]) for i in range(3)]}
        self.assertTrue(outline.validate_outline(data, "review", {1}, cap=2))
        self.assertEqual(outline.validate_outline(data, "review", {1}, cap=3), [])


class ModeTests(unittest.TestCase):
    def test_exam_coverage_and_mode_passed(self):
        plan = lambda pid, src: {"id": pid, "title": "제목", "kind": "concept", "sourcePages": src, "prerequisites": [], "brief": "가" * 40}
        data = {"sections": [], "clipPlans": [plan("c1", [1, 2])]}
        content = set(range(1, 11))
        self.assertTrue(any("90%" in e for e in outline.validate_outline(data, "exam", content, 20, content)))
        self.assertEqual(outline.validate_outline(data, "review", content, 20, content), [])   # 기본·입문은 반영률을 보지 않는다
        data["clipPlans"].append(plan("c2", list(range(3, 10))))
        self.assertEqual(outline.validate_outline(data, "exam", content, 20, content), [])     # 9/10 = 90%
        self.assertEqual(outline.normalize(data, "intro")["clipPlans"][0]["mode"], "intro")

    def test_blueprint_prompt_gets_mode(self):
        from pipeline.blueprint import build_user_prompt
        self.assertIn("입문", build_user_prompt({"title": "t", "mode": "intro"}, [], 1))
        self.assertNotIn("모드:", build_user_prompt({"title": "t"}, [], 1))


class ExampleTitleTests(unittest.TestCase):
    def test_example_gets_prefix_once(self):
        p = lambda pid, kind, title: {"id": pid, "title": title, "kind": kind, "sourcePages": [1], "prerequisites": [], "brief": "가" * 40}
        r = outline.normalize({"clipPlans": [p("c1", "example", "피봇 8로 분할"), p("c2", "example", "예시: 합병"), p("c3", "concept", "분할정복")]}, "exam")
        self.assertEqual([c["title"] for c in r["clipPlans"]], ["예시: 피봇 8로 분할", "예시: 합병", "분할정복"])


class FinalTitleLengthTest(unittest.TestCase):
    def test_limit_includes_added_example_prefix(self):
        for kind, title, valid in [
            ("example", "가" * 26, True),
            ("example", "가" * 27, False),
            ("example", "가" * 30, False),
            ("example", "예시: " + "가" * 26, True),
            ("concept", "가" * 30, True),
        ]:
            with self.subTest(kind=kind, title=title):
                data = {"clipPlans": [{**plan("c1", [2], kind=kind), "title": title}]}
                errors = outline.validate_outline(data, "review", {2})
                self.assertEqual(not errors, valid)
                if valid:
                    result = outline.normalize(data, "review")
                    self.assertLessEqual(len(result["clipPlans"][0]["title"]), outline.TITLE_MAX)
                    self.assertEqual(outline.validate_outline(result, "review", {2}), [])

    def test_oversized_final_title_uses_existing_retry(self):
        bad = {"clipPlans": [{**plan("c1", [2], kind="example"), "title": "가" * 30}]}
        with mock.patch.object(outline.llm, "call_json", side_effect=[(bad, USAGE), (GOOD, USAGE)]) as call:
            result = outline.plan_outline("review", PAGES, [])
        self.assertEqual(call.call_count, 2)
        self.assertIn("최종 title이 34자", call.call_args.args[2])
        self.assertTrue(all(len(p["title"]) <= outline.TITLE_MAX for p in result["clipPlans"]))


class ExactExamplePrefixTest(unittest.TestCase):
    def test_example_word_is_not_the_prefix(self):
        for title, expected in [
            ("예시를 통한 합병 이해", "예시: 예시를 통한 합병 이해"),
            ("예시 데이터 비교", "예시: 예시 데이터 비교"),
            ("예시: 합병", "예시: 합병"),
            ("  예시: 합병  ", "예시: 합병"),
        ]:
            with self.subTest(title=title):
                data = {"clipPlans": [{**plan("c1", [2], kind="example"), "title": title}]}
                self.assertEqual(outline.validate_outline(data, "review", {2}), [])
                result = outline.normalize(data, "review")
                self.assertEqual(result["clipPlans"][0]["title"], expected)
                self.assertEqual(outline.normalize(result, "review")["clipPlans"][0]["title"], expected)

    def test_prefix_check_still_respects_final_length(self):
        data = {"clipPlans": [{**plan("c1", [2], kind="example"), "title": "예시" + "가" * 25}]}
        self.assertTrue(outline.validate_outline(data, "review", {2}))
