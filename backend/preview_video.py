"""Development ONLY: render real PDF text excerpts to a vertical MP4 preview.

Not an AI summary, not the team's final blueprint player. Never label it as such.
"""
from __future__ import annotations

import math
import os
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont
from imageio_ffmpeg import get_ffmpeg_exe


def font(size: int):
    choices = [
        "C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/malgunbd.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for choice in choices:
        try:
            return ImageFont.truetype(choice, size=size)
        except (OSError, ValueError):
            continue
    return ImageFont.load_default()


def wrap(text: str, width: int = 19, max_lines: int = 9) -> list[str]:
    words = str(text).replace("\n", " ").split()
    if not words:
        return [""]
    result, line = [], ""
    for word in words:
        if len(word) > width:
            if line:
                result.append(line)
                line = ""
            for i in range(0, len(word), width):
                result.append(word[i:i+width])
            continue
        if line and len(line) + 1 + len(word) > width:
            result.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        result.append(line)
    return result[:max_lines]


def render_preview(blueprint: dict, captions: list[dict], audio_path: Path, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    frames = target_dir / "preview-frames"
    frames.mkdir(exist_ok=True)
    width, height, fps = 540, 960, 6
    title_font, body_font, meta_font = font(35), font(29), font(20)
    length = min(40.0, max(c.get("endSec", 0) for c in captions))
    output = target_dir / "sample-preview.mp4"
    scene_lookup = {s["id"]: s for s in blueprint.get("scenes", [])}
    last_caption = None
    base = None
    for index in range(math.ceil(length * fps)):
        t = index / fps
        active = next((c for c in captions if c["startSec"] <= t < c["endSec"]), captions[-1])
        key = (active["sceneId"], active["lineIndex"])
        if key != last_caption:
            last_caption = key
            base = Image.new("RGB", (width, height), (9, 18, 34))
            d = ImageDraw.Draw(base)
            d.rounded_rectangle((24, 36, width - 24, height - 42), radius=32, fill=(19, 36, 65), outline=(52, 86, 147), width=2)
            d.rounded_rectangle((50, 74, 178, 114), radius=12, fill=(39, 92, 192))
            d.text((66, 80), "PDF 학습", font=meta_font, fill="white")
            title = wrap(blueprint.get("title", "학습 클립"), 16, 2)
            for j, line in enumerate(title):
                d.text((52, 160 + j * 52), line, font=title_font, fill="white")
            scene = scene_lookup.get(active["sceneId"], {})
            pg = ", ".join(str(x) for x in scene.get("sourcePages", []))
            d.text((52, 291), f"참고 PDF: {pg}쪽", font=meta_font, fill=(155, 182, 230))
            d.line((52, 344, width-52, 344), fill=(77, 112, 172), width=2)
            for j, line in enumerate(wrap(active["text"], 18, 11)):
                d.text((52, 410 + j * 51), line, font=body_font, fill=(235, 242, 252))
            d.text((52, 840), "샘플 미리보기 · AI 설명 아님", font=meta_font, fill=(160, 181, 212))
        frame = base.copy()
        d = ImageDraw.Draw(frame)
        d.rounded_rectangle((52, 885, width-52, 894), radius=4, fill=(44, 64, 100))
        d.rounded_rectangle((52, 885, 52 + round((width-104) * (t/length)), 894), radius=4, fill=(67, 157, 255))
        frame.save(frames / f"frame-{index:05d}.jpg", quality=79)
    ffmpeg = get_ffmpeg_exe()
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-framerate", str(fps),
           "-i", str(frames / "frame-%05d.jpg"), "-i", str(audio_path),
           "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
           "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(output)]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    finally:
        shutil.rmtree(frames, ignore_errors=True)
    return output
