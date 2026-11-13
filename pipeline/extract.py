"""PDF 추출: 페이지 글자와 페이지 그림(PNG). 유료 호출 없음. 강의마다 한 번만 한다(D-12).

사용법:
    from pipeline.extract import extract_pdf
    result = extract_pdf("lecture.pdf", "out/lec_01")

명령줄:
    .venv/Scripts/python -m pipeline.extract lecture.pdf out/lec_01
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

from pipeline.errors import PipelineError

IMAGE_LONG_SIDE = 1600   # 페이지 그림의 긴 변(px). 원본 조각을 확대(focus)해도 읽히는 크기
EMPTY_CHARS = 10         # 공백을 뺀 글자가 이보다 적고 그림도 없으면 빈 페이지
GAP_RATIO = 0.2          # 글자 사이 간격이 글자 크기의 이 비율을 넘으면 띄어쓰기
MAX_PAGES = 100          # 팀장 11/14: 모은 강의 49개 중 47개가 이 안. 넘으면 해설 비용·분할 품질·시간이 커진다


def extract_pdf(pdf_path, out_dir) -> dict:
    """PDF의 페이지마다 글자를 뽑고 그림(PNG)을 out_dir에 저장한다.

    돌려주는 값: {"pageCount": n, "pages": [{"number", "text", "imagePath", "empty"}]}
    - number는 1부터.
    - empty는 글자와 그림이 거의 없는 페이지. 표지, 목차 같은 페이지는 분할 단계에서 AI가 거른다.
    """
    out = Path(out_dir)
    try:
        # 파일을 먼저 읽어서 연다. 실패해도 파일을 붙잡고 있지 않는다(Windows).
        doc = pymupdf.open(stream=Path(pdf_path).read_bytes(), filetype="pdf")
    except Exception as e:  # 파일이 없거나 PDF가 아님
        raise PipelineError("PDF_INVALID", "PDF 파일을 열 수 없습니다.", retryable=False) from e
    if doc.needs_pass or doc.page_count == 0:
        doc.close()
        msg = "암호가 걸린 PDF는 처리할 수 없습니다." if doc.needs_pass else "페이지가 없는 PDF입니다."
        raise PipelineError("PDF_INVALID", msg, retryable=False)
    if doc.page_count > MAX_PAGES:
        n = doc.page_count
        doc.close()
        # shortcut: 긴 PDF는 거절만 한다. 해커톤 뒤 장·절 단위 자동 분할을 검토한다.
        raise PipelineError("PDF_TOO_LONG", f"PDF가 {n}쪽이에요. 지금은 {MAX_PAGES}쪽까지 만들 수 있어요. 필요한 부분만 나눠서 올려 주세요.",
                            retryable=False)

    out.mkdir(parents=True, exist_ok=True)
    pages = []
    with doc:
        for i, page in enumerate(doc):
            number = i + 1
            text = _page_text(page)
            zoom = IMAGE_LONG_SIDE / max(page.rect.width, page.rect.height)
            image_path = out / f"page-{number:03d}.png"
            page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(image_path)
            pages.append({
                "number": number,
                "text": text,
                "imagePath": str(image_path),
                "empty": _is_empty(page, text),
            })

    # 글자가 하나도 없는 스캔 PDF도 페이지 그림이 있으므로 여기서는 실패로 보지 않는다(D-18).
    return {"pageCount": len(pages), "pages": pages}


def _page_text(page) -> str:
    """글자 위치로 띄어쓰기를 복원해 페이지 글자를 만든다.

    PPT에서 내보낸 한국어 PDF는 띄어쓰기 문자가 없고 글자 사이 간격만 있는 경우가 많다
    ("분할정복알고리즘"). 글자 사이 간격이 글자 크기의 20%를 넘으면 띄어쓰기로 본다.
    """
    lines = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            s, prev_x1 = "", None
            for span in line["spans"]:
                for ch in span["chars"]:
                    x0, x1 = ch["bbox"][0], ch["bbox"][2]
                    if prev_x1 is not None and x0 - prev_x1 > span["size"] * GAP_RATIO and not s.endswith(" "):
                        s += " "
                    if not (ch["c"] == " " and s.endswith(" ")):
                        s += ch["c"]
                    prev_x1 = x1
            if s.strip():
                lines.append(s.strip())
    return "\n".join(lines)


def _is_empty(page, text: str) -> bool:
    if len(re.sub(r"\s+", "", text)) >= EMPTY_CHARS:
        return False
    return not page.get_images() and len(page.get_drawings()) <= 2


def main(argv=None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 2:
        print("사용법: python -m pipeline.extract 파일.pdf 출력폴더")
        return 2
    try:
        result = extract_pdf(argv[0], argv[1])
    except PipelineError as e:
        print(f"실패: {e}")
        return 1
    hangul = sum(len(re.findall(r"[가-힣]", p["text"])) for p in result["pages"])
    empty = [p["number"] for p in result["pages"] if p["empty"]]
    summary = {k: v for k, v in result.items() if k != "pages"}
    Path(argv[1], "pages.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{summary['pageCount']}쪽, 한글 {hangul}자, 빈 페이지 {empty or '없음'} → {argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
