"""PDF 추출 테스트. 실행: .venv/Scripts/python -m unittest discover -s pipeline/tests -t ."""

import tempfile
import unittest
from pathlib import Path

import pymupdf

from pipeline.errors import PipelineError
from pipeline.extract import extract_pdf


def make_pdf(path: Path) -> None:
    doc = pymupdf.open()
    p1 = doc.new_page()
    p1.insert_text((72, 72), "합병 정렬은 분할 정복 알고리즘이다", fontname="korea", fontsize=14)
    doc.new_page()  # 빈 페이지
    doc.save(path)


class ExtractTests(unittest.TestCase):
    def test_korean_text_images_and_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "a.pdf"
            make_pdf(pdf)
            r = extract_pdf(pdf, Path(tmp) / "out")
            self.assertEqual(r["pageCount"], 2)
            p1, p2 = r["pages"]
            self.assertEqual(p1["number"], 1)
            self.assertIn("합병 정렬은 분할 정복", p1["text"])
            self.assertFalse(p1["empty"])
            self.assertTrue(p2["empty"])
            for p in r["pages"]:
                self.assertTrue(Path(p["imagePath"]).is_file())

    def test_invalid_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.pdf"
            bad.write_text("PDF 아님", encoding="utf-8")
            with self.assertRaises(PipelineError) as cm:
                extract_pdf(bad, Path(tmp) / "out")
            self.assertEqual(cm.exception.code, "PDF_INVALID")
            self.assertFalse(cm.exception.retryable)


if __name__ == "__main__":
    unittest.main()


def test_too_long_pdf_rejected(tmp_path):
    import pymupdf
    import pytest
    from pipeline import extract
    from pipeline.errors import PipelineError
    doc = pymupdf.open()
    for _ in range(3):
        doc.new_page()
    pdf = tmp_path / "long.pdf"
    doc.save(pdf)
    old, extract.MAX_PAGES = extract.MAX_PAGES, 2
    try:
        with pytest.raises(PipelineError) as e:
            extract.extract_pdf(pdf, tmp_path / "out")
        assert e.value.code == "PDF_TOO_LONG" and not (tmp_path / "out").exists()
    finally:
        extract.MAX_PAGES = old
