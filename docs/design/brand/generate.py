# Stepler brand: the mark options, the wordmark and the logos (2026-10-06).
#
# Run from this folder: `python3 generate.py` (needs `pip install fonttools` for the wordmark's
# outlines; a docs-only tool, not a project dependency), then `node render.mjs` for the PNG
# icons and the preview sheets. Everything lands in out/<option>/; the applied option's files are
# copied by hand to apps/web/public/brand/ (see README.md).
#
# Options (all on a 64-unit square, optically centred, no hairlines: the thinnest stroke is 5
# units, 1.25px at 16px):
#   a  Pinned photo: the original concept refined. A photo frame tilted 10 degrees, a bold
#      geometric S inside, the pushpin as a plain red dot sitting on the frame's top edge.
#   b  Stapler: a monogram tile. The S in white on a Stepler-blue rounded square, a red staple
#      across the top-left corner (stepler ~ stapler).
#   c  Pin: the geometric S alone, the red pin dot on its upper terminal. The most legible at 16px.
import os

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FONT = os.path.join(HERE, '../../../packages/ui/src/fonts/golos-text-wght.woff2')

BLUE, BLUE_D = '#3657FF', '#4B68FF'
RED = '#FF4F32'
INK, INK_D = '#171A21', '#F5F6FA'
PAPER, PAPER_D = '#FFFFFF', '#1A1D24'

# The geometric S: two stacked circular bowls, one stroke with round caps.
S = 'M42.5 17A10.5 10.5 0 1 0 32 31A10.5 10.5 0 1 1 21.5 45'


def s_stroke(colour, width=7.0, scale=1.0, cx=32.0, cy=31.0):
    t = f'translate({cx} {cy}) scale({scale}) translate(-32 -31)'
    return (f'<path d="{S}" fill="none" stroke="{colour}" stroke-width="{width}" '
            f'stroke-linecap="round" transform="{t}"/>')


def mark_a(dark=False):
    paper, blue = (PAPER_D, BLUE_D) if dark else (PAPER, BLUE)
    return (f'<g transform="rotate(-10 32 34)">'
            f'<rect x="13" y="12.5" width="38" height="43" rx="6" fill="{paper}" stroke="{blue}" '
            f'stroke-width="5"/>{s_stroke(blue, 7, 0.68, 32, 35)}</g>'
            f'<circle cx="31" cy="11" r="5.5" fill="{RED}"/>')


def mark_b(dark=False):
    tile = BLUE_D if dark else BLUE
    return (f'<rect x="7" y="7" width="50" height="50" rx="13" fill="{tile}"/>'
            f'{s_stroke("#FFFFFF", 7, 0.8, 33, 32.5)}'
            f'<path d="M7.5 21.5L21.5 7.5" stroke="{RED}" stroke-width="5" stroke-linecap="round"/>')


def mark_c(dark=False):
    blue = BLUE_D if dark else BLUE
    return (f'{s_stroke(blue, 8, 1.18, 32, 32.5)}'
            f'<circle cx="45.4" cy="14.6" r="6" fill="{RED}"/>')


MARKS = {'a': mark_a, 'b': mark_b, 'c': mark_c}


def app_icon(option):
    """A 180/192/512 home-screen icon: an opaque square (iOS fills transparency with black)."""
    if option == 'b':
        return (f'<rect width="64" height="64" fill="{BLUE}"/>'
                f'{s_stroke("#FFFFFF", 7, 0.92, 33, 32.5)}'
                f'<path d="M4 20L20 4" stroke="{RED}" stroke-width="5.5" stroke-linecap="round"/>')
    return (f'<rect width="64" height="64" fill="#FFFFFF"/>'
            f'<g transform="translate(32 32) scale(.78) translate(-32 -32)">{MARKS[option]()}</g>')


def wordmark(text='stepler', weight=700, tracking=-0.035):
    """The word in Golos Text as one path (font units, baseline y=0), with its metrics."""
    font = instancer.instantiateVariableFont(TTFont(FONT), {'wght': weight})
    glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
    x, parts = 0.0, []
    for char in text:
        pen = SVGPathPen(glyphs)
        glyphs[cmap[ord(char)]].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        parts.append(pen.getCommands())
        x += glyphs[cmap[ord(char)]].width + tracking * upm
    return x - tracking * upm, upm, font['OS/2'].sxHeight, ' '.join(parts)


def letter(char='S', weight=700):
    """One glyph as a path, centred on a 64-unit square (the folded sidebar's mark)."""
    font = instancer.instantiateVariableFont(TTFont(FONT), {'wght': weight})
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    name = cmap[ord(char)]
    bounds = BoundsPen(glyphs)
    glyphs[name].draw(bounds)
    x0, y0, x1, y1 = bounds.bounds
    k = 44 / (y1 - y0)  # The letter 44 units tall: 22px at 32px.
    dx, dy = 32 - (x0 + x1) / 2 * k, 32 + (y0 + y1) / 2 * k
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, dx, dy)))
    return pen.getCommands()


def svg(view, body, label='Stepler'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" '
            f'aria-label="{label}">{body}</svg>\n')


def main():
    width, upm, xh, glyphs = wordmark()
    size = 34  # The wordmark's em in mark units: its x-height sits on the mark's centre line.
    k = size / upm
    baseline = 32 + xh * k / 2
    gap = 10
    logo_w = 64 + gap + width * k
    # The folded sidebar's mark (owner 2026-10-06): the wordmark's own S, blue, nothing else.
    s_path = letter()
    for theme, blue in (('light', BLUE), ('dark', BLUE_D)):
        with open(os.path.join(OUT, f'letter-s-{theme}.svg'), 'w') as f:
            f.write(svg('0 0 64 64', f'<path d="{s_path}" fill="{blue}"/>', 'Stepler'))
    for option, mark in MARKS.items():
        folder = os.path.join(OUT, option)
        os.makedirs(folder, exist_ok=True)
        for theme, dark, ink in (('light', False, INK), ('dark', True, INK_D)):
            word = (f'<g transform="translate({64 + gap} {baseline:.2f}) scale({k:.5f})">'
                    f'<path d="{glyphs}" fill="{ink}"/></g>')
            with open(os.path.join(folder, f'mark-{theme}.svg'), 'w') as f:
                f.write(svg('0 0 64 64', mark(dark)))
            with open(os.path.join(folder, f'logo-{theme}.svg'), 'w') as f:
                f.write(svg(f'0 0 {logo_w:.1f} 64', mark(dark) + word))
            wm = svg(f'0 {-0.74 * upm:.0f} {width:.0f} {0.98 * upm:.0f}',
                     f'<path d="{glyphs}" fill="{ink}"/>', 'stepler')
            with open(os.path.join(folder, f'wordmark-{theme}.svg'), 'w') as f:
                f.write(wm)
        # The favicon is the light mark: its own paper keeps it readable in a dark tab bar.
        with open(os.path.join(folder, 'favicon.svg'), 'w') as f:
            f.write(svg('0 0 64 64', mark(False)))
        with open(os.path.join(folder, 'app-icon.svg'), 'w') as f:
            f.write(svg('0 0 64 64', app_icon(option)))
    print('ok')


if __name__ == '__main__':
    main()
