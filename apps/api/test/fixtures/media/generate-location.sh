#!/usr/bin/env bash
# Regenerates the location fixtures (ADR 0008 addendum 2026-10-05): photos and videos that carry
# where they were taken, as phones write it, for the worker's location stripping tests. Like
# generate.sh, nothing is downloaded beyond Debian packages in the API's base image: ffmpeg and
# libheif make the media, exiftool (the worker's own tool) writes the tags. The coordinates are a
# public square in Kyiv, not anyone's home. The outputs are committed; rerun only to change them.
#
#   apps/api/test/fixtures/media/generate-location.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Same pinned base as apps/api/Dockerfile (Debian 12 bookworm).
image='node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6'

if [[ "${1:-}" != '--inside' ]]; then
  exec docker run --rm -v "$here:/work" -w /work "$image" bash /work/generate-location.sh --inside
fi

apt-get update -qq
apt-get install -y -qq --no-install-recommends ffmpeg libheif-examples libimage-exiftool-perl colord-data >/dev/null

tmp="$(mktemp -d)"
ff() { ffmpeg -v error -y "$@"; }
et() { exiftool -q -overwrite_original "$@"; }
LAT=50.4501
LON=30.5234
WHEN='2026:06:14 15:30:00'

# A 320×240 test-pattern frame, stored sideways: EXIF orientation 6 displays it 240×320.
ff -f lavfi -i 'testsrc2=size=320x240:rate=1' -frames:v 1 "$tmp/src.png"

# JPEG: EXIF GPS (with altitude), XMP GPS, IPTC/XMP place names, and what must stay: capture
# date, orientation, camera, sRGB ICC profile.
ff -i "$tmp/src.png" location.jpg
et -Orientation#=6 -DateTimeOriginal="$WHEN" -Make='Stepler Test Camera' -Model='T1' \
  '-ICC_Profile<=/usr/share/color/icc/colord/sRGB.icc' \
  -GPSLatitude=$LAT -GPSLatitudeRef=N -GPSLongitude=$LON -GPSLongitudeRef=E -GPSAltitude=180 \
  -XMP-exif:GPSLatitude=$LAT -XMP-exif:GPSLongitude=$LON \
  -XMP-photoshop:City=Kyiv -XMP-iptcCore:Location='Maidan' location.jpg

# HEIC (as an iPhone): EXIF GPS in the Exif item, capture date and camera.
heif-enc -q 50 "$tmp/src.png" -o location.heic >/dev/null
et -DateTimeOriginal="$WHEN" -Make='Stepler Test Camera' \
  -GPSLatitude=$LAT -GPSLatitudeRef=N -GPSLongitude=$LON -GPSLongitudeRef=E location.heic

# MP4 (as Android): `©xyz` and the Apple key, with a creation time.
ff -f lavfi -i 'testsrc=size=320x240:rate=25' -t 1 -c:v libx264 -pix_fmt yuv420p \
  -metadata creation_time=2026-06-14T15:30:00Z location.mp4
et -UserData:GPSCoordinates="$LAT, $LON, 180" -Keys:GPSCoordinates="$LAT, $LON, 180" location.mp4

# MOV (as an iPhone): `com.apple.quicktime.location.ISO6709` in the `mdta` keys, `©xyz`, the
# `loci` box and an ffmpeg-style `location` key; moov at the end (no faststart).
ff -f lavfi -i 'testsrc=size=320x240:rate=25' -t 1 -c:v libx264 -pix_fmt yuv420p -f mov \
  -movflags use_metadata_tags -metadata creation_time=2026-06-14T15:30:00Z \
  -metadata "com.apple.quicktime.location.ISO6709=+$LAT+0$LON+180.000/" \
  -metadata "location=+$LAT+0$LON/" location.mov
et -UserData:GPSCoordinates="$LAT, $LON, 180" location.mov

# WebM: a Matroska `LOCATION` tag (exiftool cannot write WebM; the worker remuxes it).
ff -f lavfi -i 'testsrc=size=160x120:rate=10' -t 1 -c:v libvpx-vp9 -b:v 100k \
  -metadata "LOCATION=+$LAT+0$LON/" -metadata DATE_RECORDED=2026-06-14 location.webm

rm -rf "$tmp"
exiftool -a -G1 -s -location:all -Keys:all -UserData:GPSCoordinates location.*
ls -l /work/location.*
