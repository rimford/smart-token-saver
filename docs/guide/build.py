#!/usr/bin/env python3
"""Builds the guide page (index.html) from template.html: the Smart Token Saver logo goes in as inline SVG.

Inline SVG instead of <img src="data:..."> because some viewers (file preview, strict CSP) block data: images.
The logo is drawn here; hooks/brand-head.ts (markLogoSvg) is the same drawing made small for the bar.

Run: python3 -I docs/guide/build.py. The result, docs/guide/index.html, is a page of its own: GitHub Pages serves the
docs folder, so the guide is at https://rimford.github.io/smart-token-saver/guide/ once the change is on main.
The page's look (fonts, cover, colours) and the logo are the plugin's own.
"""
from pathlib import Path

here = Path(__file__).parent
NAVY, ORANGE, WHITE = "#00243B", "#D97757", "#FFFFFF"


def spark(cx: float, cy: float, r: float) -> str:
    return (f"M{cx} {cy - r}Q{cx} {cy} {cx + r} {cy}Q{cx} {cy} {cx} {cy + r}"
            f"Q{cx} {cy} {cx - r} {cy}Q{cx} {cy} {cx} {cy - r}Z")


def logo_svg(main: str, accent: str, label: str = "") -> str:
    a11y = f' role="img" aria-label="{label}"' if label else ' aria-hidden="true" focusable="false"'
    return (f'<svg{a11y} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
            f'<path d="M24 7.5L39 16.25V33.75L24 42.5L9 33.75V16.25Z" fill="none" stroke="{main}" stroke-width="2.5" stroke-linejoin="round"/>'
            f'<rect x="16" y="18.7" width="16" height="2.6" rx="1.3" fill="{main}"/>'
            f'<rect x="18.5" y="23.7" width="11" height="2.6" rx="1.3" fill="{main}"/>'
            f'<rect x="21" y="28.7" width="6" height="2.6" rx="1.3" fill="{accent}"/>'
            f'<path d="{spark(40.5, 7.5, 5.25)}" fill="{accent}"/>'
            '</svg>')


page = (here / "template.html").read_text()
# On the navy cover: white with the orange accent. In the footer the main colour follows the page (navy on light, pale on dark).
page = page.replace("{{COVER_LOGO}}", logo_svg(WHITE, ORANGE, "Smart Token Saver logo"))
page = page.replace("{{EYEBROW_LOGO}}", logo_svg(WHITE, ORANGE))
page = page.replace("{{FOOTER_LOGO}}", logo_svg("currentColor", ORANGE))
assert "{{" not in page, "placeholder left"
# The template starts at <title>: the document's start goes before it, with the logo as the tab's icon.
from urllib.parse import quote
icon = quote(logo_svg(NAVY, ORANGE))
page = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<link rel="icon" href="data:image/svg+xml,{icon}">\n') + page
(here / "index.html").write_text(page)
print("wrote", here / "index.html")
