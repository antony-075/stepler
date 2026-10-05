# Template fonts: sources, licences and sizes

The twelve heading/body families the guest page templates offer (`FONT_IDS` in
`@stepler/contracts`; ADR 0017). All are under the SIL Open Font License 1.1; each family's
licence, with its copyright line, is next to the files as `OFL-<Family>.txt`, copied unchanged
from the same upstream commit.

- **Upstream:** the official Google Fonts repository, https://github.com/google/fonts, commit
  `9710da1eacb3be272583c3224dcb70f9da6eadbb` (main on 2026-10-05). Licence (`license: "OFL"`)
  and the `latin` and `cyrillic` subsets were checked in each family's `METADATA.pb` there.
- **Build:** `apps/templates/scripts/build-fonts.sh` with fontTools 4.60.1 (ADR 0015 recipe):
  axes other than `wght` pinned (none of these families has one), subset to Google Fonts'
  `latin` + `cyrillic` ranges as woff2 with `kern`, `liga`, `tnum`, `pnum` on top of the default
  features, and a cmap check for і ї є ґ (and capitals), ’, «, » and №.
- **Reserved Font Names:** subsetting makes a Modified Version (OFL-FAQ 2.6), which may not use
  a Reserved Font Name. Four families declare one, so the build renames every naming record of
  their subsets, the variable fonts' instance and STAT names (IDs 256 and up) included, and
  fails if any still carries the reserved name; the attribution records (copyright, trademark,
  manufacturer, designer, description, URLs, licence; IDs 0 and 7–14) are unchanged. The
  `@font-face` family names in `fonts.css` use the new names too.
  - Playfair Display → «Stepler Display Serif»
  - Lora → «Stepler Book Serif»
  - Comfortaa → «Stepler Rounded»
  - PT Serif (RFNs «PT Sans», «PT Serif», «ParaType») → «Stepler Text Serif»
- **Never fetched at runtime:** the web app loads these files with `next/font/local`, not
  preloaded, and only the template in use applies them.

| File | Upstream path (google/fonts) | Axes / weight | Bytes |
|---|---|---|---:|
| `geologica.woff2` | `ofl/geologica/Geologica[CRSV,SHRP,slnt,wght].ttf` (built for ADR 0015, not rebuilt here; same bytes as `packages/ui/src/fonts/geologica-wght-shrp.woff2`) | wght 100–900, SHRP 0–100 | 40 824 |
| `manrope.woff2` | `ofl/manrope/Manrope[wght].ttf` | wght 200–800 | 32 016 |
| `unbounded.woff2` | `ofl/unbounded/Unbounded[wght].ttf` | wght 200–900 | 80 824 |
| `playfair-display.woff2` | `ofl/playfairdisplay/PlayfairDisplay[wght].ttf` | wght 400–900 | 50 216 |
| `cormorant.woff2` | `ofl/cormorant/Cormorant[wght].ttf` | wght 300–700 | 45 092 |
| `lora.woff2` | `ofl/lora/Lora[wght].ttf` | wght 400–700 | 52 204 |
| `nunito.woff2` | `ofl/nunito/Nunito[wght].ttf` | wght 200–1000 | 50 400 |
| `rubik.woff2` | `ofl/rubik/Rubik[wght].ttf` | wght 300–900 | 44 412 |
| `montserrat-alternates-500.woff2` | `ofl/montserratalternates/MontserratAlternates-Medium.ttf` | 500 (static) | 28 980 |
| `montserrat-alternates-700.woff2` | `ofl/montserratalternates/MontserratAlternates-Bold.ttf` | 700 (static) | 29 136 |
| `comfortaa.woff2` | `ofl/comfortaa/Comfortaa[wght].ttf` | wght 300–700 | 40 276 |
| `pt-serif-400.woff2` | `ofl/ptserif/PT_Serif-Web-Regular.ttf` | 400 (static) | 46 436 |
| `pt-serif-700.woff2` | `ofl/ptserif/PT_Serif-Web-Bold.ttf` | 700 (static) | 41 560 |
| `golos-text.woff2` | `ofl/golostext/GolosText[wght].ttf` | wght 400–900 | 51 408 |
| **Total** | | | **633 784** (592 960 new; Geologica is a copy) |

A template page downloads only its own one or two families: at most about 133 KB (Unbounded
plus Manrope for «Вечірка»), and nothing extra for «Класика», which uses the interface's
Geologica.
