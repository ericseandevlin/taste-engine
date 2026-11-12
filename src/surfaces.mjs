#!/usr/bin/env node
// surfaces.mjs — output surfaces and the complexity gate.
//
// WHY THIS EXISTS
// The engine's first real test generated a WEBSITE from a moodboard, and the
// results were unlearnable. A website is not one design problem: it is audience
// understanding, content strategy, information architecture, UX, UI, typography,
// and visual design stacked on each other. A board of references carries TASTE.
// It carries none of the rest. So when the output disappointed, there was no way
// to tell whether the extraction was wrong, the brief was loose, the generator
// was weak, or the request was simply underspecified. Too many confounds.
//
// The fix is friction in the right place. A board can fully specify a poster.
// It cannot fully specify a website. So we classify what is being asked for, and
// when the board is not enough on its own, we ask for the missing context BEFORE
// generating instead of producing a confident, mediocre answer.
//
// This is not a refusal and it is not a lecture. It is the question a good
// designer asks before starting work.

// --- Complexity tiers -------------------------------------------------------
//
// simple      One fixed surface, minimal copy, nothing to navigate. The board
//             is sufficient. Generate straight away.
// composed    Several related surfaces, or real content doing real work. The
//             board sets the look; it cannot decide the sequence or the message.
// interactive People perform tasks. Taste is the last 10% of the problem, and
//             saying so out loud is part of the job.
export const TIERS = ['simple', 'composed', 'interactive'];

// Context keys the gate asks for. Each is a question the board cannot answer.
export const CONTEXT_KEYS = {
  audience: 'Who is this for, and what do they need to do?',
  content: 'What content actually exists, and what is it saying?',
  surfaces: 'How many surfaces or states, and how do they relate?',
  job: 'What is the ONE thing this has to accomplish?',
  neighbors: 'What does this have to live next to?',
};

const SIMPLE_REQUIRES = [];
const COMPOSED_REQUIRES = ['audience', 'content', 'surfaces', 'job'];
const INTERACTIVE_REQUIRES = ['audience', 'content', 'surfaces', 'job', 'neighbors'];

export const SURFACES = {
  poster: {
    id: 'poster',
    name: 'Poster',
    tier: 'simple',
    canvas: { w: 1414, h: 2000, label: 'ISO A-series portrait (1:1.414), fixed' },
    copyBudget: 'Under 15 words total. A title, a subject, a date, a venue. Nothing else.',
    opening:
      'Design a single printed POSTER as ONE self-contained HTML file with inline <style>, sized to an exact fixed canvas.',
    directives: [
      'This is a fixed-canvas print surface, not a web page. No scrolling, no navigation, no header, no footer, no menu, no buttons, no links, no hover states, no responsive breakpoints.',
      'Everything must resolve inside the canvas in one view. Nothing may overflow or be clipped.',
      'Composition is the entire job: scale contrast, alignment, and negative space carry it. There is no second screen to explain anything.',
    ],
  },
  cover: {
    id: 'cover',
    name: 'Book or zine cover',
    tier: 'simple',
    canvas: { w: 1400, h: 2100, label: '2:3 portrait, fixed' },
    copyBudget: 'Under 12 words total. Title, author, and optionally a publisher or edition line.',
    opening:
      'Design a single BOOK OR ZINE COVER as ONE self-contained HTML file with inline <style>, sized to an exact fixed canvas.',
    directives: [
      'This is a fixed-canvas print surface, not a web page. No navigation, no scrolling, no interactive elements.',
      'Everything must resolve inside the canvas in one view. Nothing may overflow or be clipped.',
      'One gesture carries the cover. Hierarchy between title and author is the core decision.',
    ],
  },
  slide: {
    id: 'slide',
    name: 'Title card or single slide',
    tier: 'simple',
    canvas: { w: 1920, h: 1080, label: '16:9 landscape, fixed' },
    copyBudget: 'Under 15 words total. A title, optionally a subtitle and a speaker or date line.',
    opening:
      'Design a single TITLE CARD (one slide) as ONE self-contained HTML file with inline <style>, sized to an exact fixed canvas.',
    directives: [
      'This is a fixed-canvas projection surface, not a web page. No navigation, no scrolling, no interactive elements.',
      'Everything must resolve inside the canvas in one view. Nothing may overflow or be clipped.',
      'It will be read from across a room. Restraint and scale do the work.',
    ],
  },
  graphic: {
    id: 'graphic',
    name: 'Social graphic (single)',
    tier: 'simple',
    canvas: { w: 1080, h: 1350, label: '4:5 portrait, fixed' },
    copyBudget: 'Under 20 words total. It is read on a phone, in passing.',
    opening:
      'Design a single SOCIAL GRAPHIC as ONE self-contained HTML file with inline <style>, sized to an exact fixed canvas.',
    directives: [
      'This is a fixed-canvas image, not a web page. No navigation, no scrolling, no interactive elements.',
      'Everything must resolve inside the canvas in one view. Nothing may overflow or be clipped.',
      'It is viewed small and quickly. Type that works at thumbnail size is the constraint.',
    ],
  },
  'graphic-set': {
    id: 'graphic-set',
    name: 'Social graphic set',
    tier: 'composed',
    canvas: { w: 1080, h: 1350, label: '4:5 portrait, fixed, repeated across slides' },
    copyBudget: 'Under 20 words per slide.',
    opening:
      'Design a SET of social graphics as ONE self-contained HTML file with inline <style>, each slide on an exact fixed canvas, stacked vertically in the document.',
    directives: [
      'These are fixed-canvas images, not web pages. No navigation, no interactive elements.',
      'The set must read as one system: shared grid, shared type treatment, varied only where the content demands it.',
      'Sequence matters. The first slide earns attention, the last one closes.',
    ],
  },
  deck: {
    id: 'deck',
    name: 'Presentation deck',
    tier: 'composed',
    canvas: { w: 1920, h: 1080, label: '16:9 landscape, fixed, repeated across slides' },
    copyBudget: 'Sparse. A slide is a headline and evidence, not a document.',
    opening:
      'Design a PRESENTATION DECK as ONE self-contained HTML file with inline <style>, each slide on an exact fixed canvas, stacked vertically in the document.',
    directives: [
      'These are fixed-canvas projection surfaces. No navigation chrome, no interactive elements.',
      'The deck must read as one system, with a small set of repeating slide layouts rather than a bespoke layout per slide.',
    ],
  },
  homepage: {
    id: 'homepage',
    name: 'Website homepage',
    tier: 'interactive',
    canvas: null, // responsive
    copyBudget: 'Real copy, structured into sections.',
    opening:
      'Build a complete, production-quality single-page website (a homepage) as ONE self-contained HTML file with inline <style>.',
    directives: [
      'No external assets, no frameworks, no CDN links, no web fonts that require network. It must open directly from disk and be responsive (desktop and mobile).',
    ],
  },
  app: {
    id: 'app',
    name: 'Application interface',
    tier: 'interactive',
    canvas: null,
    copyBudget: 'Real labels, real states, real data shapes.',
    opening:
      'Build an application interface as ONE self-contained HTML file with inline <style>.',
    directives: [
      'No external assets, no frameworks, no CDN links. It must open directly from disk.',
      'Interface states are part of the design: empty, loading, error, and populated.',
    ],
  },
};

export const DEFAULT_SURFACE = 'homepage';

export function getSurface(id) {
  const s = SURFACES[id];
  if (!s) {
    throw new Error(`Unknown surface "${id}". Known: ${Object.keys(SURFACES).join(', ')}`);
  }
  return s;
}

export function requiredContextFor(tier) {
  if (tier === 'simple') return [...SIMPLE_REQUIRES];
  if (tier === 'composed') return [...COMPOSED_REQUIRES];
  if (tier === 'interactive') return [...INTERACTIVE_REQUIRES];
  throw new Error(`Unknown tier "${tier}"`);
}

// A context value only counts if it is a non-empty, non-placeholder string.
// Someone filling the file with "TBD" to get past the gate is defeating the
// point, so the obvious dodges are rejected.
const PLACEHOLDER = /^(tbd|todo|n\/a|na|none|\?+|-+|xxx+|placeholder|unknown)$/i;

export function isAnswered(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length < 3) return false;
  return !PLACEHOLDER.test(v);
}

// The gate. Pure, so it is fully testable without touching the network.
//
// Returns { allowed, tier, surface, missing, questions, message }.
// Never throws on a missing context: an unanswerable request is a conversation,
// not a crash.
export function gateSurface(surfaceId, context = null) {
  const surface = getSurface(surfaceId);
  const required = requiredContextFor(surface.tier);
  const missing = required.filter((k) => !isAnswered(context?.[k]));
  const allowed = missing.length === 0;
  return {
    allowed,
    tier: surface.tier,
    surface: surface.id,
    missing,
    questions: missing.map((k) => ({ key: k, question: CONTEXT_KEYS[k] })),
    message: allowed ? okMessage(surface, context) : blockMessage(surface, missing),
  };
}

function okMessage(surface, context) {
  if (surface.tier === 'simple') {
    return `[gate] ${surface.name} is a single fixed surface. The board specifies it. Generating.`;
  }
  return `[gate] ${surface.name} context supplied (${Object.keys(context || {}).length} fields). Generating.`;
}

function blockMessage(surface, missing) {
  const lines = [
    '',
    `A moodboard covers taste. A ${surface.name.toLowerCase()} needs more than taste.`,
    '',
  ];
  if (surface.tier === 'interactive') {
    lines.push(
      'People perform tasks here, so taste is the last 10% of the problem. Audience,',
      'content, and structure decide whether this works. The board only decides how it looks.',
      '',
    );
  } else {
    lines.push(
      'This is several related surfaces, so the board can set the look but it cannot',
      'decide the sequence or the message.',
      '',
    );
  }
  lines.push('Answer these first:', '');
  for (const k of missing) lines.push(`  ${k}: ${CONTEXT_KEYS[k]}`);
  lines.push(
    '',
    'Put the answers in a JSON file and pass it:',
    '',
    `  npm run generate -- --kind ${surface.id} --context ./context.json`,
    '',
    'Shape:',
    '',
    `  ${JSON.stringify(Object.fromEntries(missing.map((k) => [k, '...'])))}`,
    '',
    'Or start with a single fixed surface instead, which the board CAN fully specify:',
    '',
    `  ${simpleSurfaceIds().map((id) => `--kind ${id}`).join('   ')}`,
    '',
    'To generate anyway, without the context, pass --skip-gate. The output will look',
    'plausible and teach you nothing about whether the taste extraction worked.',
    '',
  );
  return lines.join('\n');
}

export function simpleSurfaceIds() {
  return Object.values(SURFACES)
    .filter((s) => s.tier === 'simple')
    .map((s) => s.id);
}

// Prompt fragment for a surface: what to build, on what canvas, with how much copy.
export function surfaceDirectives(surface, context = null) {
  const lines = [surface.opening, ''];
  if (surface.canvas) {
    lines.push(
      `CANVAS: exactly ${surface.canvas.w}px by ${surface.canvas.h}px (${surface.canvas.label}).`,
      `Set the root element to that exact size, center it in the viewport on a neutral backdrop, and let NOTHING escape or scroll inside it.`,
      '',
    );
  }
  lines.push(...surface.directives, '', `COPY BUDGET: ${surface.copyBudget}`);
  if (context && Object.keys(context).length) {
    lines.push(
      '',
      'ESTABLISHED CONTEXT (the board did not supply this; the person did, so honor it):',
      ...Object.entries(context)
        .filter(([, v]) => isAnswered(v))
        .map(([k, v]) => `- ${k}: ${v}`),
    );
  }
  return lines;
}
