# Design system

Documented from the code in `web/src/`. Tokens live in `@theme` in `styles.css`; nothing
inlines a hex value.

## Scene

Bright clinical workstation, printed lab report on the desk beside the screen. Light
ground, not a dark console — a dark UI under hospital lighting fights the room, and this
belongs next to records terminals and printed charts, not developer tools.

## Colour — Restrained

One accent, used only for meaning. Colour that is not carrying information is not used.

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `#f4f3ef` | page ground, warm off-white |
| `--color-panel` | `#fffefc` | panel surface |
| `--color-raised` | `#eeece6` | inset fields, track backgrounds |
| `--color-line` | `#dedbd2` | hairline rules |
| `--color-line-strong` | `#c3bfb2` | borders that need to hold an edge |
| `--color-ink` | `#23282a` | body text — charcoal with a green cast, never `#000` |
| `--color-ink-dim` | `#5c635f` | secondary text |
| `--color-ink-faint` | `#8b918b` | labels, axis ticks |
| `--color-signal` | `#b06a12` | **the one accent: "a human must look at this"** |
| `--color-signal-wash` | `#f6ead6` | signal background tint |
| `--color-ok` | `#2f6b4f` | verified outcome |
| `--color-stop` | `#a2412f` | rejected outcome, errors |

Outcome colours are data. `--color-signal` means manual review and nothing else — it is
never decorative.

**Banned:** pure black, any purple or violet, gradients, glow, glassmorphism, decorative
shadows. These are the tells that make an interface read as generated.

## Type

Two families, on a contrast axis (humanist sans + mono), self-hosted via `@fontsource`
because the demo machine runs offline and a CDN link would fall back to serif.

- **Instrument Sans** — labels, prose, headings.
- **IBM Plex Mono** — every numeric, with `font-variant-numeric: tabular-nums` so digits
  align in columns the way they do on a printed chart.

Fixed rem scale, not fluid: users are at a consistent workstation DPI, and a heading that
reflows in a panel looks worse, not better.

`.label` utility: 0.625rem, uppercase, 0.12em tracking, `--color-ink-faint`, weight 600.
Reserved for short field labels, never for prose.

## Layout

- **Hairline rules instead of cards.** Panels are separated by 1px lines on a flat ground,
  not by shadows or elevation. Nested cards never appear.
- Fixed 224px navigation rail; content area scrolls independently.
- Dense by intent. This is a tool for reading measurements, so tables run tight and panels
  carry many labels.

## Motion

One orchestrated reveal on a completed assessment (`.rise`, 260ms, `cubic-bezier(0.2, 0.7,
0.3, 1)`), staggered across the result panels. Nothing else animates. Motion conveys "a
result arrived", not decoration.

`@media (prefers-reduced-motion: reduce)` disables it outright.

## Components

`ui.tsx` holds the vocabulary: `Panel`, `Field`, `Btn`, `Th`/`Td`, `Dot`, `Empty`, `Id`.
Same button shape, same field shape, same table shape on every screen.

`BandLadder.tsx` is the one piece of custom visualisation, and it earns its place: it draws
the prediction interval on the clinical band scale and lights the boundary the interval
crosses. It shows *why* a case routed to review rather than announcing that it did. Keep it
explanatory; do not decorate it.

## Charts

SVG, generated server-side by `ml/evaluate.py` and `ml/trainlog.py`, using the same palette
so the deck and the running system read as one artifact. No chart library.
