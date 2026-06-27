// critique.test.mjs — run: node --test  (from scripts/taste/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCritiqueResponse, appendRules, buildCritiquePrompt } from './critique.mjs';

const resolved = {
  name: 'Stark Swiss Brutalist',
  recipes: [{ id: 'swiss-index', name: 'Swiss Index', recipe: { ground: 'white' } }],
  forbidden: ['gradients'],
};

test('parseCritiqueResponse keeps concrete rules', () => {
  const raw = JSON.stringify({
    rules: [
      'The contact headline ERIC@DEVLIN.WORK overflows the viewport on desktop; cap it to 100% width with clamp() sizing',
      'Mobile work-index year column wraps; move year below the title under 600px',
    ],
  });
  const rules = parseCritiqueResponse(raw);
  assert.equal(rules.length, 2);
});

test('parseCritiqueResponse drops vague findings', () => {
  const raw = JSON.stringify({
    rules: [
      'make it cooler and more modern',
      'cleaner please',
      'The hero wordmark baseline misaligns with the grid by ~8px; snap it to the 12-col baseline',
    ],
  });
  const rules = parseCritiqueResponse(raw);
  assert.equal(rules.length, 1);
  assert.ok(/baseline/.test(rules[0]));
});

test('parseCritiqueResponse throws when all rules are vague', () => {
  const raw = JSON.stringify({ rules: ['make it pop', 'nicer', 'sleek'] });
  assert.throws(() => parseCritiqueResponse(raw), /no concrete rules/);
});

test('parseCritiqueResponse throws on non-JSON', () => {
  assert.throws(() => parseCritiqueResponse('I think it looks fine'), /no JSON object/);
});

test('appendRules dedupes and reports added count', () => {
  let { doc, added } = appendRules({}, 'house', ['rule one is specific enough', 'rule two is specific enough']);
  assert.equal(added, 2);
  assert.equal(doc.house.length, 2);
  ({ doc, added } = appendRules(doc, 'house', ['rule one is specific enough', 'rule three is specific enough']));
  assert.equal(added, 1); // only the new one
  assert.equal(doc.house.length, 3);
});

test('buildCritiquePrompt names the direction, recipe, forbidden, and bans vague language', () => {
  const p = buildCritiquePrompt(resolved);
  assert.ok(p.includes('Stark Swiss Brutalist'));
  assert.ok(p.includes('Swiss Index'));
  assert.ok(p.includes('gradients'));
  assert.ok(/make it "?cooler/i.test(p));
  assert.ok(p.includes('JSON'));
});
