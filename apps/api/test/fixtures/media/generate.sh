#!/usr/bin/env bash
# Regenerates the media fixtures in this directory (signature detection, Task 18; decoding, PR D).
# Nothing is downloaded and no local tools are needed beyond Docker: every file comes from
# ffmpeg's lavfi test sources, libheif's encoder, zip and printf inside the API's base image.
# The outputs are committed; rerun only to add or change a fixture.
#
#   apps/api/test/fixtures/media/generate.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Same pinned base as apps/api/Dockerfile (Debian 12 bookworm).
image='node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6'

if [[ "${1:-}" != '--inside' ]]; then
  exec docker run --rm -v "$here:/work" -w /work "$image" bash /work/generate.sh --inside
fi

apt-get update -qq
apt-get install -y -qq --no-install-recommends ffmpeg libheif-examples zip >/dev/null

tmp="$(mktemp -d)"
ff() { ffmpeg -v error -y "$@"; }

# Photos: one 320×240 test-pattern frame each.
ff -f lavfi -i 'testsrc2=size=320x240:rate=1' -frames:v 1 "$tmp/src.png"
ff -i "$tmp/src.png" photo.jpg
cp "$tmp/src.png" photo.png
ff -i "$tmp/src.png" -c:v libwebp photo.webp
ff -f lavfi -i 'testsrc=size=160x120:rate=4' -t 0.5 anim.gif
# HEIC with brand `heic` (compatible mif1, heic, miaf), as spike S5.
heif-enc -q 50 "$tmp/src.png" -o photo.heic

# Videos: one second of `testsrc`. The MOV has its moov box at the end (no faststart).
ff -f lavfi -i 'testsrc=size=320x240:rate=25' -t 1 -c:v libx264 -pix_fmt yuv420p clip.mp4
ff -f lavfi -i 'testsrc=size=320x240:rate=25' -t 1 -c:v libx264 -pix_fmt yuv420p -f mov clip.mov
ff -f lavfi -i 'testsrc=size=160x120:rate=10' -t 1 -c:v libvpx-vp9 -b:v 100k clip.webm

# Oversized inputs that are tiny on disk (review I1): a flat 11000×11000 HEIC (121 MP) and a
# flat 7000×7000 H.264 frame (49 MP). Decoding either whole would exhaust a 512 MB worker.
ff -f lavfi -i 'color=gray:s=11000x11000' -frames:v 1 "$tmp/huge.png"
heif-enc -q 10 "$tmp/huge.png" -o huge.heic
ff -f lavfi -i 'color=gray:s=7000x7000' -frames:v 1 -c:v libx264 -preset ultrafast -crf 51 -pix_fmt yuv420p huge.mp4

# A minimal one-page PDF.
printf '%s\n' '%PDF-1.4' \
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj' \
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj' \
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj' \
  'trailer << /Root 1 0 R >>' '%%EOF' >doc.pdf

# OOXML: the smallest packages Office writes start with [Content_Types].xml, as these do.
ooxml() { # <output> <main part path> <content type of the main part>
  local dir="$tmp/ooxml-$1"
  mkdir -p "$dir/_rels" "$dir/$(dirname "$2")"
  printf '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/%s" ContentType="%s"/></Types>' "$2" "$3" >"$dir/[Content_Types].xml"
  printf '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="%s"/></Relationships>' "$2" >"$dir/_rels/.rels"
  printf '<?xml version="1.0" encoding="UTF-8"?><root/>' >"$dir/$2"
  rm -f "$1"
  (cd "$dir" && zip -q -X "/work/$1" '[Content_Types].xml' _rels/.rels "$2")
}
ooxml doc.docx word/document.xml application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml
ooxml sheet.xlsx xl/workbook.xml application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml
ooxml deck.pptx ppt/presentation.xml application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml

printf 'Побажання молодятам: щастя, любові та терпіння!\nWishes in English too.\n' >notes.txt

# Rejected: a PE executable named .jpg, a plain ZIP, SVG, HTML and Latin-1 text (invalid UTF-8).
{ printf 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00'; head -c 240 /dev/zero; } >fake.jpg
rm -f archive.zip
(cd /work && zip -q -X archive.zip notes.txt)
printf '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>\n' >image.svg
printf '<!doctype html>\n<html><body><p>hello</p></body></html>\n' >page.html
printf 'caf\xe9 cr\xe8me br\xfbl\xe9e\n' >latin1.txt

rm -rf "$tmp"
ls -l /work
