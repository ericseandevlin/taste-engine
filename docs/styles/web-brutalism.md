# Web Brutalism

**Scaffolding disclaimer.** The Taste Engine is bottom-up: a board defines its own vocabulary
from the images it actually contains, and nothing on this page constrains what a board is
allowed to mean. This library exists for two jobs only: grounding style names in citable
literature so humans can discuss them without drift, and giving the extractor validation
harness known targets to test against. It is scaffolding, never a dictionary that a board
must fit.

## Orientation

**Era:** the architectural source runs c. 1950s-1970s (New Brutalism, the term coined
1953-55); the web revival runs 2014 to the present, dating from Deville's catalog.

**Also known as:** New Brutalism, beton brut, web brutalism, brutalist web design; "raw web"
and "anti-design" are adjacent labels, not identical ones.

Banham (1955; 1966) and the Smithsons (1955) defined an architectural ethic of materials as found
and structure left visible; Le Corbusier's raw concrete gave it the name (surveys: Calder, 2016;
Chadwick, 2016; Elser et al., 2017). The web revival starts with Deville's brutalistwebsites.com
(2014), gets its manifesto from Copeland (2018), and its press moment from Arcement (2016).
O'Brien (2020) documented the split into two strands, which this engine treats as separate
validation classes. Architecture appears here as lineage prose only, never as a screenshot class.

## Determinants

### Shared umbrella (both strands)

**undisguised-construction**
The page shows its own joinery: borders, table rules, dividers, native form widgets, and
grid edges stay visible instead of being buried under whitespace, shadows, or decorative
chrome. The common core of the architectural ethic (Banham, 1955) and the web manifesto
(Copeland, 2018).

**hard-edged-zero-effects**
Corners are square and fills are flat across every container in the screenshot: no soft
drop shadows, no gradients, no blurs, no glassmorphic layering, anywhere.

One optional lineage marker floats across both strands: **grey-monochrome-palette** (concrete
greys, blacks, unbleached whites, one blunt accent at most); an ancestry echo, not a class definer.

### Strand: brutalism-minimal

The raw-HTML strand (Copeland, 2018; Craigslist, Hacker News): the Smithsons' economy, carried forward.

Defining for the strand:

**undisguised-construction** and **hard-edged-zero-effects** (the umbrella pair, above).

**browser-default-styling**
Text, links, and controls sit close to what unstyled HTML gives you: default or system
fonts, underlined links, native buttons and inputs. Defining here; the maximal strand
abandons it.

**dense-utilitarian-lists**
Content packs into tight text lists or tables with minimal padding and little or no imagery.
The page optimizes for information transfer, not visual comfort.

Common for the strand:

**system-or-monospace-typography**
Body and interface text run in system stacks, default serif (Times), or monospace, not in
licensed display faces picked for polish.

**default-blue-underlined-links**
Hyperlinks keep the browser's stock blue (near #0000EE) and stay underlined, instead of
adopting brand-colored link styling.

**visible-functional-affordances**
Everything clickable announces itself (underline, border, or native button chrome), and
nothing interactive masquerades as decoration: Copeland's (2018) rule that links look like
links and buttons look like buttons.

**monolithic-block-massing**
The layout reads as a few heavy, hard-edged, often full-width slabs stacked or interlocked
like poured sections, not a field of small floating cards: architectural mass on a screen.

### Strand: brutalism-maximal

The anti-design strand (Deville, 2014; 2016-era Balenciaga): keeps the refusal to look
comfortable, drops the restraint.

Defining for the strand:

**undisguised-construction** and **hard-edged-zero-effects** (the umbrella pair, above).

**harsh-unharmonized-color-clash**
Fully saturated hues (acid green, cyan, pure red) butt directly against each other with no
tonal ramp or mediation, producing deliberate discomfort.

**oversized-load-bearing-type**
Display type runs at monumental scale relative to the viewport, sometimes cropped by the
container or viewport edge: visual mass, not a groomed headline.

**deliberate-misalignment-or-overlap**
Elements collide, overlap, or sit visibly off-grid on purpose, while the rest of the page
shows enough craft to prove the roughness is a choice, not an accident.

Common for the strand:

**unretouched-lo-fi-imagery**
Photos and graphics arrive raw: pixelated, visibly compressed, uncropped, or default-sized,
with no masks, duotones, frames, or soft treatments.

**flat-solid-backgrounds**
Backgrounds are flat solid fields (often pure white, pure black, or one harsh color) or
crude tiled patterns, never photographic hero washes or soft gradient meshes.

## Anti-determinants

- Soft drop shadows, blur, glassmorphism, or any z-depth elevation implying stacked surfaces.
- Content in rounded-corner cards floating on a subtly tinted ground (the SaaS/Material idiom).
- A harmonized pastel or brand palette with smooth tonal ramps between hues.
- Skeuomorphic dressing (fake paper, leather, embossing, retro-CRT costume) that disguises the medium.
- A hero built on gradient-washed stock or lifestyle photography with text on a darkened scrim.
- Clickable things styled as unmarked decoration: undecorated links, div-buttons that read as labels.
- Typography performing luxury: upscale serif display faces, tight optical kerning, a graceful
  modular scale deployed to feel expensive.

## Canonical exemplars

| Work | Creator | Year | Medium | Licensing (condensed) |
|---|---|---|---|---|
| Unite d'Habitation, Marseille (source of "beton brut") | Le Corbusier | 1952 | architecture | French copyright to 2035; FoP non-commercial only; CC-licensed photos or local |
| Hunstanton School, Norfolk | Alison and Peter Smithson | 1954 | architecture | UK FoP covers buildings; the photo itself still needs PD/CC |
| Boston City Hall | Kallmann McKinnell and Knowles | 1968 | architecture | Pre-1990 US building, no architectural copyright; ships with a PD/CC photo |
| Barbican Estate, London | Chamberlin, Powell and Bon | 1965-1976 | architecture | UK FoP; photo must be PD/CC |
| Habitat 67, Montreal | Moshe Safdie | 1967 | architecture | Canadian law permits photos of architecture; ships with a PD/CC photo |
| brutalistwebsites.com | Pascal Deville | 2014- | website / catalog | Copyrighted, and its screenshots belong to the sites shown; link only |
| Craigslist homepage | Craigslist Inc. | 1996- | website | Corporate copyright, litigious owner; local only |
| "What Is Code?" (Bloomberg Businessweek) | Paul Ford with Bloomberg design | 2015 | web editorial | Bloomberg corporate work; local only |

Real canonical images live local-only in boards/validation-local/ (gitignored); the repo
ships synthetic renders only.

## Common misattributions

- Any merely unstyled or dated website. Accidental lack of design (a small-business page
  frozen in 2003) is not brutalism; the separator is undisguised-construction held as a
  consistent stance, with enough visible craft elsewhere to prove the rawness is chosen.
- "Neubrutalism / neobrutalism" UI kits (thick black outlines, candy-pastel fills, hard
  offset shadows, friendly rounded shapes; the 2021-era Gumroad and Figma community kits).
  The harmonized pastels and decorative offset shadows fail both palette determinants and
  betray the anti-decoration intent of hard-edged-zero-effects: polish wearing rough clothes.
- Modernist minimalism gets tagged brutalist because it is plain. A strict grid, Helvetica, and
  generous whitespace come with groomed hierarchy and finish that fail browser-default-styling
  and undisguised-construction; restraint executed with finesse is the opposite ethic.
- Terminal/hacker retro (green-on-black CRT skins, scanlines) is a skeuomorphic costume of a dead
  medium, violating honesty of materials; real web brutalism exposes the current medium's
  defaults instead of impersonating an old one.
- Sites ABOUT brutalist architecture. Polished editorial layouts full of concrete photography
  confuse subject matter with style; they typically fail hard-edged-zero-effects and
  visible-functional-affordances.

## Print-to-web translation

The architectural canon crosses to the web only by analogy: concrete mass, weathering, and
civic monumentality have no pixel equivalent, so Copeland (2018) redefines the raw material
as HTML and the content itself. Honest exposure becomes default styling, underlined links,
visible structure, and performance treated as design; monumentality survives loosely as
oversized type and slab-like blocks. Since Deville's 2014 catalog the web style has split in
two (O'Brien, 2020): a minimalist raw-HTML strand (Craigslist, Hacker News,
brutalist-web.design) carrying the Smithsons' economy, and a maximalist anti-design strand
(Deville's collection, 2016-era Balenciaga) that keeps the refusal of comfort but abandons
the restraint. The engine scores them as sibling substyles, never as one target.

Cited web instances:

- craigslist.org: the canonical "unintentional brutalism" citation; dense default-styled lists,
  default-blue links, zero polish since 1996.
- news.ycombinator.com (Hacker News): every element is exactly what it looks like; utilitarian
  table layout, system type.
- drudgereport.com: raw HTML essentially unchanged since 1997, cited in nearly every survey.
- brutalistwebsites.com: Deville's 2014 catalog; the definition source and an instance.
- brutalist-web.design: Copeland's manifesto site, itself a demo of the minimal strand.
- art.yale.edu (Yale School of Art): famously raw, student-editable; the most cited institutional example.
- Bloomberg interactive features c. 2015-16 (e.g. "What Is Code?"): mainstream editorial adoption
  of harsh color, exposed structure, and anti-polish.
- balenciaga.com (2016-17 era): fashion's maximal instantiation; pixelated graphics and rough-hewn
  type against luxury photography.
