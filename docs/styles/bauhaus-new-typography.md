# Bauhaus / New Typography

**Scaffolding disclaimer.** The Taste Engine is bottom-up: a board defines its own vocabulary
from the images it actually contains, and nothing on this page constrains what a board is
allowed to mean. This library exists for two jobs only: grounding style names in citable
literature so humans can discuss them without drift, and giving the extractor validation
harness known targets to test against. It is scaffolding, never a dictionary that a board
must fit.

## Orientation

**Era:** c. 1923-1933, from the Weimar/Dessau Bauhaus print workshop through the New
Typography movement, cut off by the 1933 Nazi shutdown and Tschichold's arrest.

**Also known as:** Neue Typographie, elementare typographie (elemental typography),
functional typography, Bauhaus typography, typophoto.

Moholy-Nagy's Bauhaus essays (1923; 1925) and Tschichold's manifesto-turned-handbook
(Tschichold, 1925; 1928) codified a program of asymmetric, sans-serif, machine-age print
built from elemental shapes and photography. Kandinsky (1926) supplied the shape-and-color
theory, Bayer (1926) argued for a single-case universal alphabet, and Tschichold (1935)
restated the system as asymmetric typography. Kinross (1992) and Meggs and Purvis (2016)
give the standard histories.

## Determinants

### Defining

**asymmetric-composition**
No central spine: headline, text blocks, and graphic elements sit off-center and hold each
other in balance through weight and placement instead of mirroring (Tschichold, 1928).

**geometric-sans-only**
All text, everywhere on the page, is a geometric or grotesque sans. Serifs, slabs, scripts,
and blackletter never appear.

**primary-triad-plus-black-palette**
Color is rationed to saturated red, yellow, and/or blue, joined by black and the unprinted
white of the paper. Red plus black on white is the signature reduction; pastels, earth
tones, and extended secondary palettes are out.

**flat-geometric-primitives**
Circles, squares, triangles, and bars act as hard-edged, flat participants in the
composition, buildable with ruler and compass, and they carry weight rather than decorate.

**extreme-scale-hierarchy**
Rank is expressed through big jumps in size and weight (display at three times body or more,
bold against regular in one layout) and through position, never through decorative framing.

**active-whitespace-counterweight**
Large empty areas are shaped on purpose and pull their weight in the balance; the inked
content covers a minority of the canvas.

**flush-left-ragged-right**
Multi-line body text starts from the left edge and rags on the right; centered text blocks
do not appear.

**hard-edge-flat-fill**
Every shape and letterform is a solid, crisp-edged fill. No gradients, drop shadows, bevels,
ornamental outlines, or surface texture anywhere.

### Common

**heavy-rule-scaffolding**
Thick printed rules and bars, horizontal and vertical, carve the page into zones, underline
emphasis, and anchor the whole arrangement.

**diagonal-dynamic-axis**
Something on the page tilts off the horizontal, often at 45 or 90 degrees (a rule, arrow,
photo edge, or line of type), driving a directional vector across the composition.

**letterforms-as-graphic-objects**
Type is the primary visual material: single letters or short words blow up to poster scale
and behave as shapes in their own right.

**lowercase-display-setting**
Display text commits to one case, typically all-lowercase (Bayer's, 1926, universal-alphabet
argument) or a solid all-caps block, never decorative mixed case with swash capitals.

**photomontage-over-illustration**
When images appear they are photographs or photomontage fused with type, the "typophoto" of
Moholy-Nagy (1925); hand-drawn decorative illustration is absent.

**modular-standardized-format**
Margins, block widths, and alignment edges repeat a small set of standardized measures (the
DIN-norm instinct): elements share datum lines instead of landing ad hoc.

### Optional

**shape-color-correspondence**
When the primitives take color, the Kandinsky (1926) pairing surfaces: yellow triangle,
red square, blue circle.

## Anti-determinants

- A title stack centered on the page's vertical midline: the axially symmetric layout is the
  direct enemy Tschichold's 1928 rules were written against.
- Serif, blackletter, or calligraphic/script faces anywhere in the layout.
- Ornament of any kind: printer's flowers, decorative borders, vignettes, flourishes,
  filigree frames.
- Gradients, drop shadows, embossing, 3D bevels, or skeuomorphic texture on any element.
- Pastel, muted, or many-hued palettes: more than roughly five distinct hues, or desaturated
  tints, breaks the primary-plus-black reduction.
- Hand-drawn decorative illustration standing in for photography.
- Horror vacui: a page filled edge to edge with content, leaving no shaped emptiness, sits
  outside the style.
- Justified symmetric text columns used as gray decorative mass (the New Typography justified
  only when it served function, never as centered ornament).

## Canonical exemplars

| Work | Creator | Year | Medium | Licensing (condensed) |
|---|---|---|---|---|
| Bauhaus Exhibition poster, Weimar | Joost Schmidt | 1923 | litho poster | Public domain (US pre-1931; EU expired 2019); shippable |
| Malerei, Photographie, Film (Bauhausbucher 8) | Laszlo Moholy-Nagy | 1925 | book design | Public domain since 2017; scans on Internet Archive; shippable |
| Staatliches Bauhaus in Weimar 1919-1923 title pages | Moholy-Nagy (with Bayer) | 1923 | book design | Moholy portions PD; Bayer pages EU-protected to 2056, US PD; US-only caveat |
| Universal alphabet studies; Kandinsky birthday poster | Herbert Bayer | 1925-1926 | type studies / poster | US PD (pre-1931), EU protected to 2056; US-hosted only, else local |
| Die neue Typographie design; Phoebus Palast posters | Jan Tschichold | 1927-1928 | book / posters | US PD, EU protected to 2045; 1995 translation text fully copyrighted; US-only caveat |
| Bauhaus Exhibition poster (blue profile head) | Fritz Schleifer | 1923 | litho poster | US PD, EU protected to 2048; local in EU contexts |
| Beat the Whites with the Red Wedge | El Lissitzky | 1919 | litho poster (Constructivist precursor) | Public domain everywhere; shippable |

Real canonical images live local-only in boards/validation-local/ (gitignored); the repo
ships synthetic renders only.

## Common misattributions

- Swiss / International Typographic Style work gets stamped "Bauhaus" constantly. The
  giveaway: Swiss work locks to a strict orthogonal mathematical grid in a restrained,
  near-monochrome palette, while this style keeps diagonal-dynamic-axis moves and
  flat-geometric-primitives in primary colors as active players.
- Art Deco geometric posters get tagged Bauhaus. Deco is symmetric and ornamental, with
  stylized decorative letterforms and metallic or gradient luxury effects, which breaks
  asymmetric-composition, hard-edge-flat-fill, and the no-ornament rule.
- De Stijl / Mondrian-grid pastiche gets conflated with it. De Stijl shares the primaries
  plus black but allows only orthogonal rectangles; circles, triangles, diagonals, or
  photomontage mark the work as this style instead.
- Memphis and 1980s postmodern "geometric confetti" reuses circles, triangles, and squiggles,
  but in pastel, clashing palettes with scattered anti-hierarchical layouts;
  extreme-scale-hierarchy and the primary-triad palette are missing.
- Generic post-2013 flat-design UI is not this style by default: flat fills alone lack the
  defining asymmetry, the primitives as compositional actors, and the 3x-plus scale jumps.
- Constructivism (Rodchenko, Lissitzky) is the closest true relative and often merged with
  it. The separating lean: New Typography's DIN standardization and functional
  business-printing program (letterheads, norms, flush-left rules) versus Constructivism's
  dense agitprop photomontage.

## Print-to-web translation

The typographic core survives the trip to the browser almost intact: flush-left ragged-right
sans is literally the browser default, hierarchy by size and weight jumps replaces
decoration cleanly, flat hard-edged fills cost nothing in CSS, and the DIN standardization
instinct maps straight onto design tokens, type scales, and 8-point spacing systems; read
today, Tschichold (1928) sounds like a UI style guide. What does not carry over is the
defining dynamism. Rotated type, 45-degree rules, and diagonal vectors fight horizontal
reading flow, responsive reflow, and accessibility, so honest web instantiations confine
them to hero or poster zones and keep the working UI orthogonal, which means a screenshot
can be a faithful translation while scoring low on diagonal-dynamic-axis. The trap runs the
other way too: generic flat-minimal UI passes the palette and flatness checks, so the engine
must weight asymmetric-composition, primitives-as-actors, and the 3x-plus scale hierarchy to
separate true instantiations from default Bootstrap flatness.

Cited web instances:

- Letterform Archive, "Bauhaus Typography at 100" online exhibition
  (exhibitions.letterformarchive.org/bauhaus): the canonical digital presentation, itself set
  in flush-left sans hierarchy over active whitespace.
- bauhaus100.com / bauhaus100.de (official 2019 centenary sites): widely referenced
  period-faithful web translations: geometric sans, red/black/white, heavy rules, asymmetric
  modules.
- bauhaus-dessau.de (Bauhaus Dessau Foundation): frequently cited for its stark
  black-and-white geometric-sans identity on an asymmetric grid.
- UKO (collaboration platform): named in Envato / Design Shack roundups for geometric
  abstract shapes in primary colors over flat grounds.
- bauhaus-movement.com (shop and magazine): a commonly cited case of the primary-triad
  palette plus geometric primitives applied to e-commerce UI.
- Dropbox 2017 brand-refresh landing pages: repeatedly described in the design press as
  Bauhaus- or modernist-derived (flat primaries, geometric shapes, extreme scale jumps); a
  looser, partial instantiation.
