# Memphis Revival

**Scaffolding disclaimer.** The Taste Engine is bottom-up: a board defines its own vocabulary
from the images it actually contains, and nothing on this page constrains what a board is
allowed to mean. This library exists for two jobs only: grounding style names in citable
literature so humans can discuss them without drift, and giving the extractor validation
harness known targets to test against. It is scaffolding, never a dictionary that a board
must fit.

## Orientation

**Era:** the group ran 1981-1988 (founded in Sottsass's Milan apartment in December 1980,
first show 18 September 1981, Sottsass out by 1985, dissolved 1988); the digital revival
wave runs roughly 2011-2020s across fashion, graphics, and web/UI.

**Also known as:** Memphis Milano, Memphis-Milano, New Design (Il Nuovo Design), Neo-Memphis
(the 2010s revival), 80s postmodern design, Sottsass-lineage postmodernism.

Memphis was a deliberate attack on functionalist good behavior: furniture and surfaces
built from plastic laminate, clashing color, and ornament that answered to no function,
chronicled from inside by Radice (1984; 1993) and cataloged by Horn (1985). The V&A placed
it at the center of postmodern design (Adamson and Pavitt, 2011), and Sudjic (2015) and
Thome (2014) cover Sottsass himself. The 2010s revival re-ran the vocabulary as graphics
and UI skin.

## Determinants

### Defining

**clashing-pastel-primary-palette**
One composition holds at least one saturated primary (red, yellow, cobalt) and at least one
pastel (pink, mint, lavender, peach), plus black, spanning four or more hue families with no
gesture toward tonal harmony.

**squiggle-motif**
Loose wavy or wiggly lines appear purely as decoration, either as single strokes or as a
dense, bacteria-like field covering a surface: the vocabulary of Sottsass's 1978 Bacterio
laminate.

**scattered-geometric-primitives**
Elementary shapes (circles, triangles, half-circles, zigzags, crosses, plus-signs) are
sprinkled across or behind the content as ornament. They are not icons and not data marks.

**ornament-without-function**
A large share of what you see does no informational, navigational, or structural work:
delete it and the content and layout stand unchanged. This is the anti-functionalist thesis
of the group (Radice, 1984).

**pattern-clash-adjacency**
Two or more unrelated patterns (say, a squiggle field against stripes against speckle) meet
at a hard edge with nothing mediating or harmonizing the join.

**flat-unmodeled-color**
Color areas are flat, hard-edged fills. No photographic gradients, soft shading, glow, or
simulated material depth.

**asymmetric-scatter-composition**
The layout refuses centered or mirrored stability: weight lands unevenly, decoration bleeds
off the edges, and no single axis holds the page together.

### Common

**speckle-chip-pattern**
A terrazzo- or confetti-like field of small irregular multicolor chips on a plain ground
fills a background, band, or the inside of a shape.

**black-white-counterchange-pattern**
Hard black-and-white stripes, checkerboards, grids, or dot fields sit in as pattern blocks
and vibrate against the colored areas.

**tilted-rotated-elements**
Shapes, pattern blocks, or text rotate 5 to 45 degrees off the orthogonal axis, breaking
grid alignment on purpose.

**black-keyline-outlines**
Shapes, cards, or buttons wear solid black contour strokes of even weight, reading like
drawn cartoon outlines.

**hard-offset-shadows**
Elements cast flat, zero-blur copies of themselves, offset diagonally in solid black or a
clashing color. This is the 2010s revival's stand-in for laminate layering; it is not part
of the 1980s print canon.

**chunky-playful-display-type**
Headlines use fat rounded or geometric display letterforms handled like toys: multicolored
letter by letter, outlined, or bouncing and tilting along the baseline.

### Optional

**toylike-scale-exaggeration**
At least one primitive is blown up wildly out of proportion to the content it decorates,
recalling stacked toy blocks or the totem massing of the furniture.

## Anti-determinants

- A neutral-dominant scheme (white, gray, or beige covering most of the canvas with one
  accent) disqualifies it: Memphis never lets neutrals win.
- A strict orthogonal modular grid, every element flush to columns with generous empty
  margins, contradicts the anti-functionalist stance.
- Harmonized, muted, or earth-tone color schemes are out: adjacent colors must clash across
  hue families rather than resolve into one family's gradient.
- Photorealistic gradients, glassmorphic blur, neumorphic soft shadows, chrome, or neon glow
  are out: every surface stays flat and hard-edged.
- Ornament limited to functional affordances (every visible element carrying information) is
  the modernist creed the group formed to attack; an ornament-free screenshot cannot be this
  style.
- Classical serif typography with luxury restraint as the dominant voice.
- Big fields of untouched whitespace as the main compositional device (Swiss-style breathing
  room): empty ground exists here only to be scattered upon.

## Canonical exemplars

| Work | Creator | Year | Medium | Licensing (condensed) |
|---|---|---|---|---|
| Carlton room divider (Bacterio plinth) | Ettore Sottsass | 1981 | laminate furniture | Copyright to 2077 (d. 2007); actively licensed by Memphis Milano; local only |
| Bacterio laminate pattern | Ettore Sottsass | 1978 | printed laminate | Authored pattern, still commercially licensed; the generic squiggle idea is free, this exact pattern is not; local only |
| Casablanca sideboard | Ettore Sottsass | 1981 | laminate furniture | Copyright to 2077; in production; local only |
| Super lamp | Martine Bedin | 1981 | lighting | Living creator; design and product photos both protected; local only |
| First chair | Michele De Lucchi | 1983 | furniture | Living creator; in production; local only |
| Memphis textiles and laminates (e.g. Gabon) | Nathalie du Pasquier | 1982 | surface pattern | Living creator, actively re-licensed (HAY and other collabs); local only |
| D'Antibes cabinet | George Sowden | 1981 | furniture | Living creator; local only |
| Walala X Play / Industry City murals (revival) | Camille Walala | 2017-2019 | environmental graphics | Living artist, commercial practice; local only |

Real canonical images live local-only in boards/validation-local/ (gitignored); the repo
ships synthetic renders only.

## Common misattributions

- Corporate Memphis is not Memphis. The Alegria-style flat-people tech illustration borrows
  nothing but the name: it centers bendy-limbed human characters in a harmonized palette and
  has no pattern-clash-adjacency, no squiggle-motif, no speckle-chip-pattern.
- Vaporwave and synthwave 80s nostalgia gets conflated with it. The separator is
  flat-unmodeled-color: Memphis has zero gradients, chrome, sunset glows, or scanlines.
- Trapper Keeper and "Saved by the Bell" 90s mass-market graphics are real downstream
  dilutions, but they add airbrush sheen and neon glow the canon never had; the flat
  laminate surface is the tell.
- Studio Alchimia (Mendini's Proust chair, the "redesign" parodies) is the precursor group
  Sottsass walked out of, and it often gets filed under Memphis. Historically distinct,
  though at screenshot level the vocabularies overlap heavily.
- Any bright flat-geometric poster, Bauhaus-derived work included, gets tagged Memphis. The
  separators are deliberate hue clash plus ornament-without-function, against the harmonized,
  functionally motivated geometry of the modernist line.

## Print-to-web translation

The furniture canon reaches the web as surface treatment: clashing pastel-plus-primary
palettes, squiggle and terrazzo pattern blocks, primitives scattered behind content, tilted
elements, black keylines, and hard offset shadows standing in for laminate layering. What
does not translate is the core material argument (plastic laminate as celebrated fakery,
totemic 3D massing) and, more fundamentally, the anti-functionalism itself: a shipping
website still has to work, so web Memphis is ornamental skin over conventional UX rather
than genuinely dysfunctional structure, and true production examples are rare (Gumroad 2021
is the usual citation; most instantiations live in Dribbble and Webflow showcases). One more
constraint matters for this repo: nothing in the exemplar canon is public domain, since
every principal is living or died after 2007, so a public repo can ship only original
recreations of the generic vocabulary (squiggles, speckle fields, primitive scatter), never
authored patterns like Bacterio, which stay in the local validation folder.

Cited web instances:

- Gumroad (2021 rebrand): the most cited production example of the revival vocabulary on a
  real SaaS product; flat clashing fields, black keylines, hard offset shadows (often filed
  as neo-brutalism with Memphis DNA).
- camillewalala.com: portfolio of the designer most credited with leading the revival; the
  site itself runs the pattern-clash vocabulary.
- memphis-milano.com: the group's official archive and shop, dressed in the original
  patterns.
- Mailchimp (2018 rebrand): frequently cited as Memphis-adjacent in revival discussions,
  though it drifts toward Corporate Memphis flat-illustration territory.
- Webflow's "Made in Webflow: Memphis" showcase and Dribbble's memphis-design tag: the
  standard cited collections of web instantiations (mostly demos and templates, not
  production sites).
- The Develobear Memphis-UI tutorial: a commonly referenced how-to for translating the
  vocabulary into UI components.
