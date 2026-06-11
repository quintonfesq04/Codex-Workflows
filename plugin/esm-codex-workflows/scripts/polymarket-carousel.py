#!/usr/bin/env python3
"""Render a Polymarket-style baseball IG carousel from a JSON brief.

Usage:
  python3 scripts/polymarket-carousel.py templates/polymarket-carousel-brief.json
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


W, H = 1080, 1350
TOP_BAND = 360
MEME_BAND = 202
WHITE = "#FFFFFF"
BLACK = "#000000"


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.strip()
    if not value.startswith("#") or len(value) != 7:
        raise ValueError(f"Expected #RRGGBB color, got {value!r}")
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))


def font(path: str | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if path and Path(path).exists():
        return ImageFont.truetype(path, size=size)
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def crop_cover(path: str, target_w: int, target_h: int, focal: list[float] | tuple[float, float]):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    iw, ih = img.size
    scale = max(target_w / iw, target_h / ih)
    nw, nh = int(iw * scale + 0.5), int(ih * scale + 0.5)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    fx, fy = focal
    left = max(0, min(nw - target_w, int(nw * fx - target_w / 2)))
    top = max(0, min(nh - target_h, int(nh * fy - target_h / 2)))
    return img.crop((left, top, left + target_w, top + target_h))


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> str:
    lines: list[str] = []
    current = ""
    for word in text.split():
        test = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), test, font=fnt)[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def fit_single(text: str, font_path: str | None, max_width: int, max_size: int, min_size: int):
    probe = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(probe)
    for size in range(max_size, min_size - 1, -1):
        fnt = font(font_path, size)
        bb = draw.textbbox((0, 0), text, font=fnt)
        if bb[2] - bb[0] <= max_width:
            return fnt
    return font(font_path, min_size)


def fit_multi(text: str, font_path: str | None, max_width: int, max_height: int, max_size: int, min_size: int):
    probe = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(probe)
    for size in range(max_size, min_size - 1, -1):
        fnt = font(font_path, size)
        spacing = int(size * 0.22)
        wrapped = wrap_text(draw, text, fnt, max_width)
        bb = draw.multiline_textbbox((0, 0), wrapped, font=fnt, spacing=spacing)
        if bb[2] - bb[0] <= max_width and bb[3] - bb[1] <= max_height:
            return fnt, wrapped, spacing
    fnt = font(font_path, min_size)
    return fnt, wrap_text(draw, text, fnt, max_width), int(min_size * 0.22)


def add_cover_gradient(base: Image.Image, primary: str, secondary: str, style: str, gradient_scale: float):
    canvas = base.convert("RGBA")
    primary_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    support_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    black_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pr, pg, pb = hex_rgb(primary)
    sr, sg, sb = hex_rgb(secondary)
    primary_draw = ImageDraw.Draw(primary_layer)
    support_draw = ImageDraw.Draw(support_layer)
    black_draw = ImageDraw.Draw(black_layer)
    base_start_y = 365 if style == "black" else 375
    gradient_scale = max(0.55, min(1.15, float(gradient_scale)))
    start_y = H - int((H - base_start_y) * gradient_scale)
    height = H - start_y
    for y in range(start_y, H):
        t = (y - start_y) / max(1, height - 1)
        primary_alpha = min(255, int(330 * (t**0.58)))
        support_alpha = min(82, int(82 * (t**2.1)))
        black_alpha = min(215, int(215 * (t**1.55)))
        primary_draw.line([(0, y), (W, y)], fill=(pr, pg, pb, primary_alpha))
        support_draw.line([(0, y), (W, y)], fill=(sr, sg, sb, support_alpha))
        black_draw.line([(0, y), (W, y)], fill=(0, 0, 0, black_alpha))
    if style == "black":
        return Image.alpha_composite(Image.alpha_composite(Image.alpha_composite(canvas, primary_layer), black_layer), support_layer)
    return Image.alpha_composite(Image.alpha_composite(Image.alpha_composite(canvas, primary_layer), support_layer), black_layer)


def add_info_gradient(base: Image.Image, primary: str, secondary: str):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    pr, pg, pb = hex_rgb(primary)
    sr, sg, sb = hex_rgb(secondary)
    start_y = 815
    height = H - start_y
    for y in range(start_y, H):
        t = (y - start_y) / max(1, height - 1)
        alpha = min(155, int(155 * (t**1.32)))
        mix = 0.20 * (t**1.8)
        r = int(pr * (1 - mix) + sr * mix)
        g = int(pg * (1 - mix) + sg * mix)
        b = int(pb * (1 - mix) + sb * mix)
        draw.line([(0, y), (W, y)], fill=(r, g, b, alpha))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def paste_logo(canvas: Image.Image, logo_path: str | None, position: str):
    if not logo_path or not Path(logo_path).exists():
        return
    logo = Image.open(logo_path).convert("RGBA")
    target_w = 240
    target_h = int(logo.height * target_w / logo.width)
    logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    pixels = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            r, g, b, a = pixels[x, y]
            if a:
                pixels[x, y] = (255, 255, 255, a)
    x = W - target_w - 42 if position == "right" else 42
    canvas.alpha_composite(logo, (x, 42))


def draw_caption(draw: ImageDraw.ImageDraw, text: str, body_font: str | None, band_h: int):
    fnt, wrapped, spacing = fit_multi(text, body_font, 930, band_h - 105 if band_h == TOP_BAND else band_h - 54, 48, 30)
    bb = draw.multiline_textbbox((0, 0), wrapped, font=fnt, spacing=spacing)
    x = (W - (bb[2] - bb[0])) / 2 - bb[0]
    y = (band_h - (bb[3] - bb[1])) / 2 - bb[1] - 2
    draw.multiline_text((x, y), wrapped, font=fnt, fill=(0, 0, 0), spacing=spacing, align="center")


def draw_stat(draw: ImageDraw.ImageDraw, stat: str, primary: str, secondary: str, headline_font: str | None):
    stat = stat.upper()
    fnt = fit_single(stat, headline_font, 1018, 118, 72)
    bb = draw.textbbox((0, 0), stat, font=fnt)
    x = (W - (bb[2] - bb[0])) / 2 - bb[0]
    y = H - (bb[3] - bb[1]) - 42 - bb[1]
    draw.text((x + 8, y + 8), stat, font=fnt, fill=primary, stroke_width=16, stroke_fill=primary)
    draw.text((x, y), stat, font=fnt, fill=secondary, stroke_width=13, stroke_fill=primary)
    draw.text((x, y), stat, font=fnt, fill=secondary, stroke_width=7, stroke_fill=WHITE)
    draw.text((x, y), stat, font=fnt, fill=secondary)


def render_cover(brief: dict, out_dir: Path):
    primary, secondary = brief["team_colors"][:2]
    assets = brief.get("assets", {})
    cover = brief["cover"]
    canvas = crop_cover(cover["image"], W, H, cover.get("focal", [0.5, 0.5]))
    canvas = add_cover_gradient(canvas, primary, secondary, cover.get("gradient", "black"), cover.get("gradient_scale", 1.0))
    canvas = canvas.convert("RGBA")
    paste_logo(canvas, assets.get("logo"), cover.get("logo_position", "left"))
    draw = ImageDraw.Draw(canvas)
    lines = [line.upper() for line in cover["text"]]
    colors = cover.get("line_colors") or [WHITE, secondary]
    specs = cover.get("line_specs")
    if not specs:
        specs = [
            {"max_width": 960, "max_size": 390, "min_size": 270},
            {"max_width": 1040, "max_size": 520, "min_size": 340},
        ][: len(lines)]
    fitted = []
    total_h = 0
    for line, spec in zip(lines, specs):
        fnt = fit_single(line, assets.get("headline_font"), spec["max_width"], spec["max_size"], spec["min_size"])
        bb = draw.textbbox((0, 0), line, font=fnt)
        height = bb[3] - bb[1]
        fitted.append((line, fnt, bb, height))
        total_h += height
    gap = cover.get("gap", 6)
    total_h += gap * (len(fitted) - 1)
    y_cursor = H - total_h - cover.get("bottom_margin", 42)
    for index, (line, fnt, bb, height) in enumerate(fitted):
        x = (W - (bb[2] - bb[0])) / 2 - bb[0]
        y = y_cursor - bb[1]
        draw.text((x, y), line, font=fnt, fill=colors[min(index, len(colors) - 1)])
        y_cursor += height + gap
    canvas.convert("RGB").save(out_dir / cover.get("filename", "01_cover.png"), "PNG")


def render_info_slide(slide: dict, brief: dict, out_dir: Path):
    primary, secondary = brief["team_colors"][:2]
    assets = brief.get("assets", {})
    canvas = Image.new("RGBA", (W, H), WHITE)
    image = crop_cover(slide["image"], W, H - TOP_BAND, slide.get("focal", [0.5, 0.5]))
    canvas.paste(image, (0, TOP_BAND))
    canvas = add_info_gradient(canvas, primary, secondary)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, TOP_BAND), fill=WHITE)
    draw_caption(draw, slide["copy"], assets.get("body_font"), TOP_BAND)
    draw_stat(draw, slide["stat"], primary, secondary, assets.get("headline_font"))
    canvas.convert("RGB").save(out_dir / slide["filename"], "PNG")


def crop_meme(path: str):
    target_h = H - MEME_BAND
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    iw, ih = img.size
    scale = max(W / iw, target_h / ih)
    nw, nh = int(iw * scale + 0.5), int(ih * scale + 0.5)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, min(nw - W, int((nw - W) / 2)))
    top = max(0, min(nh - target_h, int((nh - target_h) / 2)))
    return img.crop((left, top, left + W, top + target_h))


def render_meme(brief: dict, out_dir: Path):
    meme = brief.get("meme")
    meme_path = brief.get("assets", {}).get("meme")
    if not meme or not meme_path:
        return
    canvas = Image.new("RGB", (W, H), WHITE)
    canvas.paste(crop_meme(meme_path), (0, MEME_BAND))
    draw = ImageDraw.Draw(canvas)
    draw_caption(draw, meme["caption"], brief.get("assets", {}).get("body_font"), MEME_BAND)
    canvas.save(out_dir / meme.get("filename", "99_meme.png"), "PNG")


def contact_sheet(out_dir: Path):
    files = sorted(out_dir.glob("*.png"))
    if not files:
        return
    thumb_w, thumb_h = 216, 270
    cols = min(5, len(files))
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (thumb_w * cols, thumb_h * rows), WHITE)
    for i, file_path in enumerate(files):
        img = Image.open(file_path).convert("RGB")
        img.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(img, ((i % cols) * thumb_w, (i // cols) * thumb_h))
    sheet.save(out_dir / "contact_sheet.png", "PNG")


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/polymarket-carousel.py path/to/brief.json", file=sys.stderr)
        return 2
    brief_path = Path(sys.argv[1]).expanduser()
    brief = json.loads(brief_path.read_text())
    output_root = Path(brief.get("output_root", "polymarket-carousel-output")).expanduser()
    out_dir = output_root / brief["post_folder"]
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    render_cover(brief, out_dir)
    for slide in brief.get("slides", []):
        render_info_slide(slide, brief, out_dir)
    render_meme(brief, out_dir)
    contact_sheet(out_dir)
    if brief.get("mirror_to_documents", False):
        docs = Path.home() / "Documents" / brief["post_folder"]
        if docs.exists():
            shutil.rmtree(docs)
        shutil.copytree(out_dir, docs)
    print(out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
