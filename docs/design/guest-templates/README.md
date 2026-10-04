# Guest page templates: design source

The artboards for the six guest page templates and the editor, copied from the Claude Design
canvas https://claude.ai/artifact/Yb2spDGP6qMpj7zrutxNzJ (2026-10-04) so the repository keeps
them. Open any `*.dc.html` file in a browser.

| File | What |
|---|---|
| `T1-phone.dc.html`, `T1-desktop.dc.html` | T1 «Класика» (`classic`) |
| `T2-phone.dc.html`, `T2-desktop.dc.html` | T2 «На весь екран» (`fullscreen`) |
| `T3-phone.dc.html`, `T3-desktop.dc.html` | T3 «Журнал» (`journal`) |
| `T4-phone.dc.html`, `T4-desktop.dc.html` | T4 «Листівка» (`postcard`) |
| `T5-phone.dc.html`, `T5-desktop.dc.html` | T5 «Вечірка» (`party`) |
| `T6-phone.dc.html`, `T6-desktop.dc.html` | T6 «Мінімалізм» (`minimal`) |
| `E-editor-desktop.dc.html`, `E-editor-phone.dc.html` | The editor in «Гостьова сторінка» |

The binding values (palettes, options, layout summaries, editor copy) are condensed in
`docs/superpowers/plans/2026-10-05-guest-page-templates.md`, Appendix A and Appendix B. Where the
artboards and the plan disagree, the plan wins.

## Accepted designer deviations

- T3's first frame is 4:3 on phones.
- T4 uses polaroids (rotation and shadow on frames; ADR 0015 is amended for it).
- T2's sheet is always dark.
- T5 is dark-only.
- T6 has a solid background only.

## Resolved conflicts (owner, 2026-10-05, decision D5)

- T2 uses Manrope 800 headings and the accent `#F2A65A` (the editor's values), not the artboard's
  Montserrat Alternates with `#E9C17A`.
- T5's default accent is Лайм `#C5F04A` (the editor's), not the artboard's violet `#A56BFF`.
- Each template has a fixed scheme: T2 and T5 dark, the rest light.
- The artboards omit the footer in some states (T4 desktop, T3/T4 after an upload) and show the
  lock reason as a hover-only tooltip. Every template keeps the legal notice and the footer
  (ADR 0016), and the editor shows lock reasons as visible text.
- Until PR K, `classic` is today's guest page ported as is, not the T1 artboard.
