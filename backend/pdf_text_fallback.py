"""Sample-mode PDF text: prefer PyMuPDF, fall back when its DLL cannot load.

The PNGs are visibly marked
placeholders, NOT true screenshots of PDF pages. No security policy is disabled.
"""
from __future__ import annotations

import importlib.util
import logging
from pathlib import Path
import struct
import zlib

from pypdf import PdfReader

logger = logging.getLogger(__name__)

# 5x7 bitmap glyphs needed by placeholder labels.
_FONT = {
    ' ': ('00000',)*7,
    '0': ('01110','10001','10011','10101','11001','10001','01110'),
    '1': ('00100','01100','00100','00100','00100','00100','01110'),
    '2': ('01110','10001','00001','00010','00100','01000','11111'),
    '3': ('11110','00001','00001','01110','00001','00001','11110'),
    '4': ('00010','00110','01010','10010','11111','00010','00010'),
    '5': ('11111','10000','10000','11110','00001','00001','11110'),
    '6': ('01110','10000','10000','11110','10001','10001','01110'),
    '7': ('11111','00001','00010','00100','01000','01000','01000'),
    '8': ('01110','10001','10001','01110','10001','10001','01110'),
    '9': ('01110','10001','10001','01111','00001','00001','01110'),
    'A': ('01110','10001','10001','11111','10001','10001','10001'),
    'D': ('11110','10001','10001','10001','10001','10001','11110'),
    'E': ('11111','10000','10000','11110','10000','10000','11111'),
    'F': ('11111','10000','10000','11110','10000','10000','10000'),
    'G': ('01111','10000','10000','10111','10001','10001','01110'),
    'I': ('01110','00100','00100','00100','00100','00100','01110'),
    'L': ('10000','10000','10000','10000','10000','10000','11111'),
    'M': ('10001','11011','10101','10101','10001','10001','10001'),
    'N': ('10001','11001','10101','10011','10001','10001','10001'),
    'O': ('01110','10001','10001','10001','10001','10001','01110'),
    'P': ('11110','10001','10001','11110','10000','10000','10000'),
    'R': ('11110','10001','10001','11110','10100','10010','10001'),
    'T': ('11111','00100','00100','00100','00100','00100','00100'),
    'U': ('10001','10001','10001','10001','10001','10001','01110'),
    'V': ('10001','10001','10001','10001','10001','01010','00100'),
    'X': ('10001','10001','01010','00100','01010','10001','10001'),
    'Y': ('10001','10001','01010','00100','00100','00100','00100'),
}


def _placeholder_png(destination: Path, number: int, text_length: int) -> None:
    """Write a labeled, deterministic PNG using Python's standard library only."""
    w, h = 420, 600
    rgb = bytearray((12, 24, 42) * (w*h))

    def rect(x: int, y: int, rw: int, rh: int, color: tuple[int, int, int]):
        for yy in range(max(0, y), min(h, y+rh)):
            start = (yy * w + max(0, x)) * 3
            end = (yy * w + min(w, x+rw)) * 3
            rgb[start:end] = bytes(color) * ((end-start)//3)

    def label(s: str, x: int, y: int, scale: int = 3):
        for c in s:
            bits = _FONT.get(c, _FONT[' '])
            for row, cells in enumerate(bits):
                for col, bit in enumerate(cells):
                    if bit == '1':
                        rect(x + col*scale, y + row*scale, scale, scale, (236, 242, 251))
            x += scale*6

    rect(0, 0, w, 70, (31, 77, 160))
    label('PDF TEXT ONLY', 38, 28, 3)
    label(f'PAGE {number}', 38, 115, 5)
    label('NO ORIGINAL IMAGE', 38, 225, 3)
    rect(38, 294, 344, 2, (87, 123, 174))
    for i in range(min(10, max(3, text_length // 12))):
        rect(38, 332 + 23*i, 160 + ((i*41 + text_length) % 180), 6, (55, 78, 113))
    # Encode each row with PNG filter method 0, without external image packages.
    scanlines = b''.join(b'\x00' + bytes(rgb[j*w*3:(j+1)*w*3]) for j in range(h))
    def chunk(typ: bytes, data: bytes):
        return struct.pack('>I', len(data)) + typ + data + struct.pack('>I', zlib.crc32(typ+data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(scanlines, 7)) + chunk(b'IEND', b'')
    destination.write_bytes(png)


def pymupdf_available() -> bool:
    """True when PyMuPDF is installed. Never imports it (stored-sample playback must not load the DLL,
    see extract_pdf_text_only); a DLL that is installed but blocked is still reported at extraction time."""
    try:
        return importlib.util.find_spec("pymupdf") is not None
    except (ImportError, ValueError):
        return False


def extract_pdf_text_only(pdf_path: Path, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        import pymupdf
    except (ImportError, OSError):
        logger.warning('PyMuPDF를 불러올 수 없어 pypdf로 대체합니다. 한글 텍스트와 줄바꿈 품질은 보장되지 않습니다.')
        reader = PdfReader(str(pdf_path), strict=False)
        if reader.is_encrypted or len(reader.pages) == 0:
            raise ValueError('비어 있거나 암호화된 PDF입니다.')
        texts = [(page.extract_text() or '').strip() for page in reader.pages]
    else:
        # Import lazily: stored sample playback must also work on DLL-blocked PCs.
        with pymupdf.open(stream=pdf_path.read_bytes(), filetype='pdf') as document:
            if document.needs_pass or document.page_count == 0:
                raise ValueError('비어 있거나 암호화된 PDF입니다.')
            texts = [page.get_text('text').strip() for page in document]
    pages = []
    for i, text in enumerate(texts, start=1):
        img = output_dir / f'page-{i}.png'
        _placeholder_png(img, i, len(text))
        pages.append({'number': i, 'text': text, 'imagePath': str(img), 'empty': not bool(text)})
    return {'pageCount': len(pages), 'pages': pages}
