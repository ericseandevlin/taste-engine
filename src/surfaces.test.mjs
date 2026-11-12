// surfaces.test.mjs — run: node --test src/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SURFACES,
  TIERS,
  CONTEXT_KEYS,
  getSurface,
  gateSurface,
  requiredContextFor,
  isAnswered,
  surfaceDirectives,
  simpleSurfaceIds,
  DEFAULT_SURFACE,
} from './surfaces.mjs';

test('every surface declares a known tier, an opening, and a copy budget', () => {
  for (const [id, s] of Object.entries(SURFACES)) {
    assert.equal(s.id, id, `${id} id mismatch`);
    assert.ok(TIERS.includes(s.tier), `${id} has unknown tier ${s.tier}`);
    assert.ok(s.opening && s.opening.length > 20, `${id} missing opening`);
    assert.ok(s.copyBudget, `${id} missing copy budget`);
    assert.ok(Array.isArray(s.directives) && s.directives.length, `${id} missing directives`);
  }
});

test('simple surfaces are fixed-canvas; interactive surfaces are not', () => {
  for (const s of Object.values(SURFACES)) {
    if (s.tier === 'simple') {
      assert.ok(s.canvas && s.canvas.w > 0 && s.canvas.h > 0, `${s.id} should have a fixed canvas`);
    }
    if (s.tier === 'interactive') {
      assert.equal(s.canvas, null, `${s.id} should be responsive, not fixed`);
    }
  }
});

test('a simple surface passes the gate with no context at all', () => {
  const g = gateSurface('poster');
  assert.equal(g.allowed, true);
  assert.equal(g.tier, 'simple');
  assert.deepEqual(g.missing, []);
});

test('a website is blocked with no context, and the message asks rather than refuses', () => {
  const g = gateSurface('homepage');
  assert.equal(g.allowed, false);
  assert.equal(g.tier, 'interactive');
  assert.deepEqual(g.missing, requiredContextFor('interactive'));
  // It names the real problem instead of just erroring.
  assert.match(g.message, /moodboard covers taste/i);
  assert.match(g.message, /last 10%/);
  // It offers the escape hatch and the easier path.
  assert.match(g.message, /--skip-gate/);
  assert.match(g.message, /--kind poster/);
  // Every missing key's question is actually shown.
  for (const k of g.missing) assert.ok(g.message.includes(CONTEXT_KEYS[k]), `missing question for ${k}`);
});

test('a composed surface is blocked, but asks for less than an interactive one', () => {
  const composed = gateSurface('graphic-set');
  const interactive = gateSurface('homepage');
  assert.equal(composed.allowed, false);
  assert.ok(composed.missing.length < interactive.missing.length);
  assert.match(composed.message, /sequence or the message/i);
});

test('full context opens the gate on a website', () => {
  const context = {
    audience: 'Hiring managers at design-led product companies.',
    content: 'Four case studies that already exist, plus a short bio.',
    surfaces: 'One page, five sections, no separate detail pages yet.',
    job: 'Get a callback for a senior design engineering role.',
    neighbors: 'Sits next to the frozen work.ericdevlin.co case study.',
  };
  const g = gateSurface('homepage', context);
  assert.equal(g.allowed, true);
  assert.deepEqual(g.missing, []);
});

test('partial context reports only what is still missing', () => {
  const g = gateSurface('homepage', {
    audience: 'Hiring managers at design-led product companies.',
    job: 'Get a callback for a senior design engineering role.',
  });
  assert.equal(g.allowed, false);
  assert.deepEqual(g.missing.sort(), ['content', 'neighbors', 'surfaces']);
});

test('placeholder answers do not open the gate', () => {
  for (const dodge of ['TBD', 'todo', 'n/a', '???', '---', 'placeholder', 'unknown', '  ']) {
    assert.equal(isAnswered(dodge), false, `"${dodge}" should not count as answered`);
  }
  const g = gateSurface('homepage', {
    audience: 'TBD',
    content: 'TBD',
    surfaces: 'TBD',
    job: 'TBD',
    neighbors: 'TBD',
  });
  assert.equal(g.allowed, false, 'a file full of TBD must not pass');
  assert.equal(g.missing.length, 5);
});

test('real answers count as answered', () => {
  assert.equal(isAnswered('Hiring managers at product companies.'), true);
  assert.equal(isAnswered(''), false);
  assert.equal(isAnswered(null), false);
  assert.equal(isAnswered(42), false);
});

test('unknown surfaces fail loudly and list the known ones', () => {
  assert.throws(() => getSurface('billboard'), /Unknown surface/);
  assert.throws(() => getSurface('billboard'), /poster/);
});

test('surfaceDirectives pins the exact canvas for a fixed surface', () => {
  const text = surfaceDirectives(SURFACES.poster).join('\n');
  assert.match(text, /1414px by 2000px/);
  assert.match(text, /POSTER/);
  assert.match(text, /no navigation/i);
  assert.match(text, /COPY BUDGET/);
});

test('surfaceDirectives omits canvas language for a responsive surface', () => {
  const text = surfaceDirectives(SURFACES.homepage).join('\n');
  assert.doesNotMatch(text, /CANVAS:/);
  assert.match(text, /responsive/i);
});

test('supplied context is passed through to the prompt, placeholders dropped', () => {
  const text = surfaceDirectives(SURFACES.homepage, {
    audience: 'Hiring managers at design-led product companies.',
    job: 'TBD',
  }).join('\n');
  assert.match(text, /ESTABLISHED CONTEXT/);
  assert.match(text, /Hiring managers/);
  assert.doesNotMatch(text, /TBD/);
});

test('the default surface is the one that needs the gate most', () => {
  // Backwards compatibility: `generate` with no --kind still means a homepage,
  // which is exactly the request the gate was built to interrupt.
  assert.equal(DEFAULT_SURFACE, 'homepage');
  assert.equal(gateSurface(DEFAULT_SURFACE).allowed, false);
});

test('there is always at least one simple surface to redirect someone toward', () => {
  assert.ok(simpleSurfaceIds().length >= 3);
  assert.ok(simpleSurfaceIds().includes('poster'));
});
