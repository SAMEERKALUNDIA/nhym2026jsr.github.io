# Design brief

A one-page registration site for **National Ho Youth Meet 2026, Jamshedpur** — a
two-day gathering of Ho youth, students and elders at Birsa Munda Town Hall on
28 and 29 November 2026. It is not a marketing site: a visitor arrives to know the
dates, the venue, the four fees, and to sign up a family or a group in one go.
So the page is an invitation and a form, in that order, and every section ends
near the register action.

## Palette

Every value lives in `src/theme.css`. Warm paper cream ground (`--background`),
deep mahogany-maroon ink (`--primary`), and **terracotta** (`--brand`) as the one
loud colour — it belongs to the register action, the fee figures and the day
markers, and to almost nothing else. Leaf green (`--success`) appears only where
a registration is confirmed.

This is not a pale page with coloured buttons: one dark maroon band carries the
programme and the fee answer, so the page changes key twice down its length.

One colour scheme, light, deliberately. There is no `prefers-color-scheme`
override. Depth comes from soft radial glows built with `color-mix` on the
tokens and a faint dot texture on the dark bands, never from a hard shadow ring
or a hairline around every block.

## Faces

`--font-heading` is **Archivo Narrow** (500/600/700) — condensed, banner-like,
civic. It carries the event name, section headings, day numbers and the fee
figures. `--font-body` and `--font-label` are **Public Sans** (400/500/600/700),
a plain humanist text face for paragraphs, table detail and form labels.
`font-mono` is a real monospace stack only. Both faces load together in
`src/fonts.css`; changing one means changing the import and the token together.

Hero: `clamp(2.6rem, 5.4vw, 5rem)` step at 1.333. Section headings sit around
`clamp(1.75rem, 3.4vw, 2.6rem)`. Headings are condensed and tight
(`--heading-tracking: -0.01em`); the small uppercase labels get `0.14em` of
positive tracking. Body copy stays under 70 characters a line.

## Brand mark

`src/components/Brand.tsx` is a drawn monogram: a **shield-rhombus in ink with a
descending three-step stair inside it**, in white — reading both as a hillside
terrace (the Jamshedpur plateau the Ho villages sit on) and as a set of
ascending steps. Beside it the wordmark sets the event short name in
`--font-heading`, with a small tracked label line under it. `public/favicon.svg`
is the same figured mark at 32×32, in the same tokens' literal colours, because
a standalone file has no stylesheet behind it.

Icons are **lucide at `stroke-width: 2`**, nowhere heavier or lighter, and they
are imported one by one by name. Icons appear only where they carry meaning
faster than a word: the date, the venue, the phone, the participant kinds, the
fee total, and the form's remove/add controls.

## Imagery

Two photographs, both documentary and warm — this is a gathering, and the
picture is of a gathering, not of a mood. The hero image is a wide view of a
crowded open-air community gathering of Adivasi youth in eastern India, in
daylight, seen from within the crowd with a stage and banner bunting in the
middle distance. A second, narrower picture sits beside the two-day programme:
people seated close together under a tent with printed programme sheets in hand.
Both are photographic, both warm-daylight, neither is a person's portrait.

Nothing else on the page is a picture. The fee schedule is a table, the
registration is a form, and the programme is type on a dark band — those three
are the substance of the page and they are built from tokens, not from images.

## Shell

No site header bar: this is one page with one action, so the mark sits inside
the first screen's own top row beside the register button, and does not need a
second home. The footer is real — venue, dates, the person to call, the fee
reminder and the photograph credit — because a visitor who scrolls to the
bottom is usually looking for exactly that. The 404 is the one extra route.

## Voice

Plain, warm, specific and completely without marketing language. The event name
and dates in full, the venue named as Birsa Munda Town Hall, the four fees given
in rupees as the visitor gave them, the phone numbers as given. No testimonial,
no award, no statistic we were not told. Copy is sentence case except the event
name's own small tracked labels.
