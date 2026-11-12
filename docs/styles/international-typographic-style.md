# International Typographic Style

**Scaffolding disclaimer.** The Taste Engine is bottom-up: a board defines its own vocabulary
from the images it actually contains, and nothing on this page constrains what a board is
allowed to mean. This library exists for two jobs only: grounding style names in citable
literature so humans can discuss them without drift, and giving the extractor validation
harness known targets to test against. It is scaffolding, never a dictionary that a board
must fit.

## Orientation

**Era:** core period c. 1950s-1970s, developed in Zurich (Muller-Brockmann, Lohse, Vivarelli)
and Basel (Ruder, Hofmann), with roots in 1920s-40s Swiss modernism (Keller, Bill, Ballmer,
and Tschichold's later career).

**Also known as:** Swiss Style, Swiss School, Neue Grafik / New Graphic Design, Swiss
International Style.

The style consolidated in postwar Zurich and Basel around a doctrine of objective,
grid-governed communication (Muller-Brockmann, 1981; Ruder, 1967; Hofmann, 1965), and was
broadcast through the journal Neue Grafik (Muller-Brockmann et al., eds., 1958-1965). It went
international in the 1960s-70s via Unimark, Vignelli, and the US federal design program;
Hollis (2006) traces the full arc. Gerstner (1964) framed it as programmatic design, which is
why it later ported to screens more cleanly than any other print canon.

## Determinants

### Defining

**modular-column-grid**
Everything sits on one repeating column armature with even gutters. The tell is edge
recurrence: headings, paragraphs, and images that have nothing to do with each other keep
landing on the same few vertical alignment lines across the whole layout (Muller-Brockmann, 1981).

**single-sans-serif-family**
One neutral grotesque carries all the text (the Akzidenz-Grotesk, Helvetica, Univers class,
or a modern stand-in like Inter or Neue Haas). Variation comes only from weight and size,
and if a second family shows up at all it stays marginal.

**flush-left-ragged-right**
Body copy and multi-line headings anchor to the left edge and let the right edge fall where
it falls (Ruder, 1967). Centered paragraphs and centered stacked headlines do not occur.

**asymmetric-composition**
Mass is balanced, never mirrored. Flip the layout about its vertical midline and you see a
different picture; no dominant centered axis organizes the page.

**size-weight-position-hierarchy**
What matters is set bigger, bolder, or higher in the grid, and that is the whole signaling
system. Banners, drop caps, colored boxes acting as badges, and underline flourishes are not
used to rank content.

**photographic-or-geometric-imagery**
Pictures are either matter-of-fact photography (documentary in spirit, often black-and-white)
or flat constructed geometry. Hand-drawn, painterly, cartoon, and textured-3D illustration
are all absent (Hofmann, 1965).

**flat-unmodulated-color-fields**
Every patch of color is one even fill. Gradients, drop shadows, bevels, glows, photo textures
behind type, and any other faked depth appear nowhere on the page.

### Common

**restricted-palette-single-accent**
Black, white, and greys do most of the work, plus one saturated accent (classically a warm
red), two at the outside. A color histogram shows the two neutral poles and at most a couple
of chromatic spikes.

**active-structured-whitespace**
Empty space is composed, not left over: the borders of the large blank regions coincide with
grid lines, and a substantial share of the canvas deliberately carries nothing.

**extreme-type-scale-contrast**
The type scale is stepped, not ramped: display sizes jump to roughly four times body size or
beyond, with few sizes in between.

**repeated-spacing-module**
Vertical gaps recycle a small set of values built from one base unit (a baseline-grid rhythm)
instead of drifting element by element.

**rules-and-bars-only-graphics**
Beyond photography, the graphic inventory is hairline rules, solid rectangular bars, and
primitive shapes (circles, arcs, squares), each aligned to the grid.

**full-bleed-imagery**
Photographs or color fields run all the way to the canvas edge with no framing margin, a
habit carried over from the poster format. Board-owner determinant, corroborated by poster
practice: this one is not in the research JSON's determinant set; it is added here because
the JSON's own web-translation note identifies edge bleeds as part of the poster grammar
that responsive layouts degrade.

### Optional

**lowercase-display-setting**
Display lines favor all-lowercase or sentence case in the Basel manner; decorative all-caps
words and small-caps dress-up are missing.

**consistent-diagonal-rotation**
If anything rotates, the whole block rotates once, at a single angle, keeping its internal
alignment. Elements never scatter at assorted angles.

## Anti-determinants

- A layout organized around a centered, mirror-symmetric axis fails outright.
- A serif, slab, script, blackletter, or novelty display face in any prominent role fails.
- Ornament of any species: borders, flourishes, frames, drop caps, mascots, icon clutter.
- Gradients, drop shadows, bevels, embossing, texture, glassmorphism, or simulated 3D depth.
- Hand-drawn, painterly, cartoon, or expressive collage illustration.
- Warped, outlined, distressed, or deliberately near-illegible letterforms (that is the
  Weingart / New Wave revolt against this style, not the style itself).
- Three or more typeface families in one composition.
- Persuasion by mood instead of information, e.g. staged lifestyle photography deployed as
  decoration; it contradicts the style's stated objectivity.

## Canonical exemplars

| Work | Creator | Year | Medium | Licensing (condensed) |
|---|---|---|---|---|
| beethoven (Tonhalle Zurich poster) | Josef Muller-Brockmann | 1955 | offset litho poster | Copyright runs to 2066 (life+70); local only |
| der Film (Kunstgewerbemuseum poster) | Josef Muller-Brockmann | 1960 | poster | Same estate, to 2066; local only |
| Giselle, Basler Freilichtspiele | Armin Hofmann | 1959 | photolitho poster | Protected to 2090 (d. 2020); local only |
| Typographie (book spreads) | Emil Ruder | 1967 | book design | Protected to 2040 (d. 1970); local only |
| Neue Grafik journal spreads | Muller-Brockmann, Lohse, Neuburg, Vivarelli | 1958-1965 | journal design | Multiple estates, latest d. 1996; local only |
| NYC Transit Authority Standards Manual | Unimark (Vignelli and Noorda) | 1970 | identity manual | MTA holds rights; 2014 reissue is a licensed facsimile; local only |
| NASA Graphics Standards Manual | Danne and Blackburn for NASA | 1975 | identity manual | US federal work, universally treated as freely reproducible; shippable |
| The Vignelli Canon | Massimo Vignelli | 2010 | PDF book | Distributed free by the author, but not public domain; link, do not vendor |

Real canonical images live local-only in boards/validation-local/ (gitignored); the repo
ships synthetic renders only.

## Common misattributions

- Generic minimalism or flat UI gets labeled Swiss. The separator is modular-column-grid:
  when the edges of unrelated elements do not recur on shared lines, it is minimalism, not
  this style.
- Any use of Helvetica gets called Swiss. Without asymmetric-composition and
  size-weight-position-hierarchy it is just a font choice; post-2013 flat design descends
  from this canon but usually drops the grid discipline and the ragged-right rule.
- Bauhaus and Constructivist work gets conflated with it. Bauhaus favors geometric universal
  faces (the Futura class), symbolic geometry, and centered or diagonally dynamic layouts,
  where this style demands neutral grotesques and objective photography; Hollis (2006) dates
  the split to postwar Zurich and Basel.
- Weingart and Greiman's "Swiss Punk" / New Wave gets mislabeled as the style itself.
  Layered, distressed, deliberately hard-to-read type violates flat-unmodulated-color-fields
  and the pure size/weight hierarchy; it is the 1970s reaction against the style, taught in
  the same Basel school.
- Web brutalism gets tagged Swiss because both read as raw. Brutalism leans on browser
  defaults, clashing color, and anti-grid roughness; this style requires systematic spacing
  modules and a restricted palette.

## Print-to-web translation

Of the four styles in this library, this one crosses to the browser with the least loss: the
modular grid, the single sans family, the flush-left rag, flat fills, and size/weight
hierarchy map almost one-to-one onto CSS Grid, font stacks, and design tokens, which is how
Vinh (2010) could port Muller-Brockmann to the web nearly verbatim and why corporate design
systems read as its heirs. What does not survive is the poster itself: a fixed single
viewport. Extreme scale contrast, edge bleeds, and precisely balanced asymmetry all degrade
under responsive reflow and infinite scroll, and the web's default centered container quietly
deletes the asymmetry determinant. Objective photography usually becomes no photography, so
web instances tend to read as the typographic subset of the style.

Cited web instances:

- iA.net (Information Architects): Reichenstein's "Web Design is 95% Typography" (2006)
  imported Ruder-school doctrine directly; the standard citation for this style on the web.
- swissincss.com (Jon Yablonski): canonical posters rebuilt and animated in pure CSS; cited
  by CSS-Tricks and Khoi Vinh as the definitive web homage.
- subtraction.com (Khoi Vinh): long-running Helvetica-and-grid site by the author of the
  web-grid book (Vinh, 2010).
- aisleone.net and thegridsystem.org (Antonio Carusone): widely cited blog and grid resource,
  both set in the idiom they document.
- Early Medium.com and the 2010s flat-design wave: commonly cited mass-market dilutions
  (grid plus grotesque plus flat color, minus the asymmetry).
