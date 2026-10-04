#!/usr/bin/env bash
# Builds apps/templates/fonts/*.woff2 from the official google/fonts repository (ADR 0015 recipe;
# ADR 0017). Not run in CI: the outputs are committed. Needs fontTools 4.60 with brotli
# (`pip install 'fonttools[woff]==4.60.1'`); set PYTHON to that interpreter if it is not `python3`.
#
#   apps/templates/scripts/build-fonts.sh
#
# Per family: download the TTF at the pinned commit, pin every axis but `wght` (varLib.instancer),
# subset to latin + cyrillic as woff2 with kerning, ligatures and both figure styles, then check
# the cmap for the Ukrainian letters and the punctuation the copy uses. Fails on any miss.
#
# Reserved Font Names: subsetting makes a Modified Version (OFL-FAQ 2.6), which may not carry an
# RFN. Four families declare one (Playfair Display, Lora, Comfortaa, PT Serif with ParaType), so
# their naming records are renamed to a Stepler name; copyright and licence records are kept.
set -euo pipefail

# google/fonts main at the time of the build (2026-10-05); bump deliberately and rebuild all.
COMMIT=9710da1eacb3be272583c3224dcb70f9da6eadbb
RAW="https://raw.githubusercontent.com/google/fonts/${COMMIT}"
PYTHON="${PYTHON:-python3}"

# Google Fonts' `latin` and `cyrillic` unicode ranges, merged (ADR 0015).
LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
CYRILLIC='U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'
# і ї є ґ (and capitals), ’ « » №: the copy needs every one of them.
REQUIRED='0x456 0x457 0x454 0x491 0x406 0x407 0x404 0x490 0x2019 0xAB 0xBB 0x2116'

OUT="$(cd "$(dirname "$0")/../fonts" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# output name | path in google/fonts (static files for families without a variable TTF)
# | for an RFN family: the reserved name and the name the subset gets instead
FONTS=(
  "manrope|ofl/manrope/Manrope[wght].ttf"
  "unbounded|ofl/unbounded/Unbounded[wght].ttf"
  "playfair-display|ofl/playfairdisplay/PlayfairDisplay[wght].ttf|Playfair Display|Stepler Display Serif"
  "cormorant|ofl/cormorant/Cormorant[wght].ttf"
  "lora|ofl/lora/Lora[wght].ttf|Lora|Stepler Book Serif"
  "nunito|ofl/nunito/Nunito[wght].ttf"
  "rubik|ofl/rubik/Rubik[wght].ttf"
  "montserrat-alternates-500|ofl/montserratalternates/MontserratAlternates-Medium.ttf"
  "montserrat-alternates-700|ofl/montserratalternates/MontserratAlternates-Bold.ttf"
  "comfortaa|ofl/comfortaa/Comfortaa[wght].ttf|Comfortaa|Stepler Rounded"
  "pt-serif-400|ofl/ptserif/PT_Serif-Web-Regular.ttf|PT Serif|Stepler Text Serif"
  "pt-serif-700|ofl/ptserif/PT_Serif-Web-Bold.ttf|PT Serif|Stepler Text Serif"
  "golos-text|ofl/golostext/GolosText[wght].ttf"
)

for entry in "${FONTS[@]}"; do
  IFS='|' read -r name path reserved renamed <<<"$entry"
  url="${path//[/%5B}"
  url="${url//]/%5D}"
  src="$WORK/$name.ttf"
  curl -fsSL "${RAW}/${url}" -o "$src.download"
  mv "$src.download" "$src"
  # Pin any axis other than wght at its default (none of the current families has one).
  axes="$("$PYTHON" -c "
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
print(' '.join(f'{a.axisTag}={a.defaultValue:g}' for a in f['fvar'].axes if a.axisTag != 'wght') if 'fvar' in f else '')
" "$src")"
  if [ -n "$axes" ]; then
    # shellcheck disable=SC2086
    "$PYTHON" -m fontTools.varLib.instancer "$src" $axes -o "$src.pinned" -q
    mv "$src.pinned" "$src"
  fi
  "$PYTHON" -m fontTools.subset "$src" \
    --unicodes="${LATIN},${CYRILLIC}" \
    --flavor=woff2 \
    --layout-features+=kern,liga,tnum,pnum \
    --output-file="$OUT/$name.woff2"
  if [ -n "${reserved:-}" ]; then
    "$PYTHON" -c "
import sys
from fontTools.ttLib import TTFont
path, reserved, renamed = sys.argv[1:4]
# Every naming record: family, full, unique, PostScript, typographic, variations prefix, and
# every record from 256 up (fvar instance and STAT names). Attribution records keep the original
# names as published: copyright (0), trademark (7), manufacturer (8), designer (9), description
# (10), vendor and designer URLs (11, 12), licence and licence URL (13, 14).
ATTRIBUTION = {0, 7, 8, 9, 10, 11, 12, 13, 14}
font = TTFont(path)
# PostScript-style names: ID 6, ID 25, and fvar instances' postscriptNameID.
postscript = {6, 25} | {
    instance.postscriptNameID for instance in (font['fvar'].instances if 'fvar' in font else [])
}
forms = [(reserved, renamed), (reserved.replace(' ', ''), renamed.replace(' ', '')),
         (reserved.replace(' ', '_'), renamed.replace(' ', '')), ('ParaType', 'Stepler')]
for record in font['name'].names:
    if record.nameID in ATTRIBUTION:
        continue
    text = record.toUnicode()
    for old, new in forms:
        # PostScript names never contain spaces.
        text = text.replace(old, new.replace(' ', '') if record.nameID in postscript else new)
    record.string = text
for record in font['name'].names:
    if record.nameID not in ATTRIBUTION and any(old in record.toUnicode() for old, _ in forms):
        sys.exit(f'{path}: name {record.nameID} still has a reserved name')
font.save(path)
" "$OUT/$name.woff2" "$reserved" "$renamed"
  fi
  "$PYTHON" -c "
import sys
from fontTools.ttLib import TTFont
cmap = TTFont(sys.argv[1]).getBestCmap()
missing = [hex(int(c, 16)) for c in sys.argv[2:] if int(c, 16) not in cmap]
if missing:
    sys.exit(f'{sys.argv[1]}: missing {missing}')
" "$OUT/$name.woff2" $REQUIRED
  printf '%-32s %7d bytes\n' "$name.woff2" "$(wc -c <"$OUT/$name.woff2")"
done
