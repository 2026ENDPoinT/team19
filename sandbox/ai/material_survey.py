"""강의자료 조사: 페이지별 통계(숫자만)와 9쪽 요약 그림을 만든다."""
import sys, os, re, json
import pymupdf

SRC = sys.argv[1]          # materials 폴더
OUT = sys.argv[2]          # 결과 폴더
os.makedirs(OUT, exist_ok=True)

def trigrams(s):
    t = re.sub(r"\s+", "", s)
    return {t[i:i+3] for i in range(len(t) - 2)}

def jac(a, b):
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)

TILE_W, TILE_H, COLS, ROWS = 560, 315, 3, 3
summary = []
for name in sorted(os.listdir(SRC)):
    if not name.lower().endswith(".pdf"):
        continue
    doc = pymupdf.open(os.path.join(SRC, name))
    short = re.sub(r"[^0-9A-Za-z가-힣_]+", "_", os.path.splitext(name)[0])[:30]
    pages = []
    prev = None
    for i, page in enumerate(doc):
        text = page.get_text()
        g = trigrams(text)
        drawings = page.get_drawings()
        pages.append({
            "p": i + 1,
            "chars": len(re.sub(r"\s+", "", text)),
            "hangul": len(re.findall(r"[가-힣]", text)),
            "images": len(page.get_images(full=True)),
            "drawings": len(drawings),
            "annots": len(list(page.annots() or [])),
            "dup_prev": round(jac(prev, g), 2) if prev is not None else 0,
        })
        prev = g
    # 9쪽씩 요약 그림
    per = COLS * ROWS
    for s in range(0, len(doc), per):
        sheet = pymupdf.open()
        sp = sheet.new_page(width=TILE_W * COLS, height=TILE_H * ROWS)
        for k, pno in enumerate(range(s, min(s + per, len(doc)))):
            r = pymupdf.Rect((k % COLS) * TILE_W, (k // COLS) * TILE_H,
                             (k % COLS + 1) * TILE_W, (k // COLS + 1) * TILE_H)
            sp.show_pdf_page(r, doc, pno)
            sp.insert_text((r.x0 + 6, r.y0 + 14), str(pno + 1), fontsize=12, color=(1, 0, 0))
        sp.get_pixmap(dpi=72).save(os.path.join(OUT, f"{short}_sheet{s // per + 1:02d}.png"))
    n = len(pages)
    summary.append({
        "file": name, "short": short, "pages": n,
        "median_chars": sorted(p["chars"] for p in pages)[n // 2],
        "hangul_total": sum(p["hangul"] for p in pages),
        "low_text_pages": sum(p["chars"] < 40 for p in pages),
        "pages_with_images": sum(p["images"] > 0 for p in pages),
        "median_drawings": sorted(p["drawings"] for p in pages)[n // 2],
        "annots_total": sum(p["annots"] for p in pages),
        "near_dup_pages": [p["p"] for p in pages if p["dup_prev"] > 0.8 and p["chars"] > 40],
    })
    with open(os.path.join(OUT, short + "_pages.json"), "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)

for s in summary:
    d = s["near_dup_pages"]
    print(f'{s["short"]:<30} 쪽={s["pages"]:>3} 중앙글자={s["median_chars"]:>4} 한글={s["hangul_total"]:>6} '
          f'글자적음={s["low_text_pages"]:>2} 그림있는쪽={s["pages_with_images"]:>3} 중앙도형수={s["median_drawings"]:>5} '
          f'주석={s["annots_total"]:>4} 반복쪽={len(d)}')
