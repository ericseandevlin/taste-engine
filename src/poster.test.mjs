import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asClaim, parseCopy, buildPosterPrompt, pickReferences, buildCheckPrompt, parseVerdicts, bestRound, DEFAULT_COPY, buildArtCheckPrompt, ART_RULE } from './poster.mjs';
import { imageOfGemini, imageOfOpenRouter, openRouterContent, geminiParts } from './image-agent.mjs';
import { routeModel, resolveVisionCaller, NO_KEY_MESSAGE } from './models.mjs';

const mode = { id: 'm', name: 'Strict', summary: 'A grid.', palette: ['#000', '#fff'], lanes: ['grid'] };
const base = { mode, dos: [{ rule: 'One grotesk family' }], donts: [{ rule: 'Drop shadows' }], palette: [{ hex: '#111111' }], copy: ['A', 'B'] };

test('parseCopy splits on pipes and falls back to the default copy', () => {
  assert.deepEqual(parseCopy(' Title |  12 Nov | '), ['Title', '12 Nov']);
  assert.deepEqual(parseCopy(''), DEFAULT_COPY);
});

test('buildPosterPrompt carries the copy, the mode palette and both rule lists', () => {
  const p = buildPosterPrompt(base);
  assert.match(p, /  A\n  B/);
  assert.match(p, /#000, #fff/);
  assert.match(p, /DO:\n- One grotesk family/);
  assert.match(p, /- Drop shadows/);
  assert.ok(!/LAST ATTEMPT/.test(p));
});

test('buildPosterPrompt uses the measured palette when the mode has none', () => {
  assert.match(buildPosterPrompt({ ...base, mode: { ...mode, palette: [] } }), /#111111/);
});

test('a repair round names each broken rule and what was seen', () => {
  const p = buildPosterPrompt({ ...base, broken: [{ rule: 'Drop shadows', reason: 'title has a shadow' }] });
  assert.match(p, /LAST ATTEMPT BROKE THESE RULES/);
  assert.match(p, /- Drop shadows \(seen: title has a shadow\)/);
});

test('parseVerdicts reads PASS and FAIL and refuses a wrong count', () => {
  const raw = 'ok {"verdicts":[{"verdict":"PASS","reason":"a"},{"verdict":"FAIL","reason":"b"}]}';
  assert.deepEqual(parseVerdicts(raw, 2), [{ pass: true, reason: 'a' }, { pass: false, reason: 'b' }]);
  assert.throws(() => parseVerdicts(raw, 3), /expected 3/);
  assert.throws(() => parseVerdicts('nothing', 1), /no JSON/);
  assert.match(buildCheckPrompt(['r1', 'r2'], ['A']), /exactly 2 entries/);
});

test('bestRound takes the most passes and the later round on a tie', () => {
  assert.equal(bestRound([{ round: 1, passed: 3 }, { round: 2, passed: 5 }, { round: 3, passed: 4 }]).round, 2);
  assert.equal(bestRound([{ round: 1, passed: 3 }, { round: 2, passed: 3 }]).round, 2);
});

test('the image agent reads an image from both provider response shapes', () => {
  const g = { candidates: [{ content: { parts: [{ text: 'note' }, { inlineData: { data: 'QUJD', mimeType: 'image/png' } }] } }] };
  assert.deepEqual(imageOfGemini(g), { data: 'QUJD', mimeType: 'image/png', note: 'note' });
  assert.equal(imageOfGemini({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }), null);
  const o = { choices: [{ message: { content: 'hi', images: [{ image_url: { url: 'data:image/jpeg;base64,QUJD' } }] } }] };
  assert.deepEqual(imageOfOpenRouter(o), { data: 'QUJD', mimeType: 'image/jpeg', note: 'hi' });
  assert.equal(imageOfOpenRouter({ choices: [{ message: { content: 'x' } }] }), null);
});

test('routeModel sends a gemini name to whichever key exists', () => {
  assert.equal(routeModel('gemini-3.5-flash', { GEMINI_API_KEY: 'k', OPENROUTER_API_KEY: 'k' }), 'gemini-3.5-flash');
  assert.equal(routeModel('gemini-3.5-flash', { OPENROUTER_API_KEY: 'k' }), 'google/gemini-3.5-flash');
  assert.equal(routeModel('claude-cli:sonnet', {}), 'claude-cli:sonnet');
  assert.throws(() => routeModel('gemini-3.5-flash', {}), new RegExp(NO_KEY_MESSAGE.slice(0, 18)));
  assert.equal(resolveVisionCaller('gemini-3.5-flash', { OPENROUTER_API_KEY: 'k' }).provider, 'openrouter');
});

test('asClaim turns a forbidden move into a statement that is true when obeyed', () => {
  assert.equal(asClaim('Gradient backgrounds'), 'The poster does not use this: Gradient backgrounds.');
  assert.equal(asClaim('Drop shadows.'), 'The poster does not use this: Drop shadows.');
});

test('the prompt forbids printed color codes and a framed sheet', () => {
  const p = buildPosterPrompt(base);
  assert.match(p, /Never print a color code/);
  assert.match(p, /runs to all four edges/);
  assert.match(p, /only text on the poster/);
});

test('buildPosterPrompt in set mode asks for no text and leaves out the copy', () => {
  const p = buildPosterPrompt({ ...base, copy: ['Open Studio'], type: 'set' });
  assert.match(p, /NO TEXT/);
  assert.match(p, /top third calm/);
  assert.doesNotMatch(p, /Open Studio/);
});

test('buildPosterPrompt with references asks for their subject and treatment, not a copy', () => {
  const p = buildPosterPrompt({ ...base, type: 'set', refs: 3 });
  assert.match(p, /The 3 attached images are from the board/);
  assert.match(p, /SUBJECT: if the references share a subject/);
  assert.match(p, /Do not copy any reference/);
  assert.match(p, /Render the photograph in them/);
  assert.match(p, /NO TEXT/);
  const plain = buildPosterPrompt(base);
  assert.doesNotMatch(plain, /REFERENCES|SUBJECT|photograph/);
});

test('pickReferences ranks the ids cited most across the mode lanes', () => {
  const brief = {
    rules: [
      { lane: 'grid', evidence: { refs: ['w1', 'w2', 'w3'] } },
      { lane: 'grid', evidence: { refs: ['w1', 'w2', 'w3'] } },
      { lane: 'pattern', evidence: { refs: ['w3', 'w4'] } },
      { lane: 'other', evidence: { refs: ['w5', 'w5'] } },
    ],
  };
  const manifest = { items: ['w1', 'w2', 'w3', 'w4', 'w5'].map((id) => ({ id, file: `${id}.webp` })) };
  const m = { ...mode, lanes: ['grid', 'pattern'] };
  assert.deepEqual(pickReferences(brief, m, manifest, 2).map((i) => i.id), ['w3', 'w1']);
  assert.deepEqual(pickReferences(brief, m, manifest, 0), []);
  assert.deepEqual(pickReferences({ rules: [] }, m, manifest, 2).map((i) => i.id), ['w1', 'w2']);
  assert.deepEqual(pickReferences(brief, m, null, 2), []);
});

test('reference images ride along as image parts in both request shapes', () => {
  const im = [{ data: 'QUJD', mimeType: 'image/jpeg' }];
  assert.equal(openRouterContent('hi'), 'hi');
  assert.deepEqual(openRouterContent('hi', im), [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }]);
  assert.deepEqual(geminiParts('hi'), [{ text: 'hi' }]);
  assert.deepEqual(geminiParts('hi', im), [{ text: 'hi' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }]);
});

test('pickReferences prefers the mode\'s own refs', () => {
  const manifest = { items: [{ id: 'w1', file: '1' }, { id: 'w2', file: '2' }, { id: 'w3', file: '3' }] };
  const brief = { rules: [{ lane: 'grid', evidence: { refs: ['w1', 'w2'] } }] };
  assert.deepEqual(pickReferences(brief, { lanes: ['grid'], refs: ['w3', 'w2'] }, manifest, 3).map((i) => i.id), ['w3', 'w2']);
  assert.deepEqual(pickReferences(brief, { lanes: ['grid'] }, manifest, 3).map((i) => i.id), ['w1', 'w2']);
});

test('buildPosterPrompt uses the mode\'s own subject, composition and lineage instead of the generic treatment list', () => {
  const m = { ...mode, lineage: { tradition: 'Film posters', era: '1970s', place: 'unclear', confidence: 'low' } };
  const dos = [{ rule: 'Face painted by hand', mode: 'm', aspect: 'subject' }, { rule: 'Subject low, field above', mode: 'm', aspect: 'composition' }, { rule: 'One grotesk family' }];
  const p = buildPosterPrompt({ ...base, mode: m, dos, refs: 2, type: 'set' });
  assert.match(p, /SUBJECT TREATMENT: Face painted by hand/);
  assert.match(p, /COMPOSITION: Subject low, field above/);
  assert.match(p, /LINEAGE \(an interpretation of the references, low confidence, not a fact\): Film posters, 1970s\./);
  assert.match(p, /top or the bottom edge/);
  assert.ok(!/halftoned, collaged/.test(p));
  assert.ok(!/DO:\n- Face painted/.test(p)); // said once, not twice
  assert.match(buildPosterPrompt({ ...base, refs: 2 }), /halftoned, collaged/); // no own rules: generic text stays
});

test('buildArtCheckPrompt asks about the bare artwork and wants one verdict per rule', () => {
  const p = buildArtCheckPrompt([ART_RULE]);
  assert.match(p, /before any type is added/);
  assert.match(p, /exactly 1 entries/);
  assert.match(p, /no letters, words, numbers/);
});

test('poster prompt with references forbids copying their lettering and credits', () => {
  const p = buildPosterPrompt({ ...base, type: 'set', refs: 3 });
  assert.match(p, /Never copy any of it/);
  assert.match(p, /no names, credits, captions/);
});

test('poster prompt with references casts a character with expression, not a stock face', () => {
  const p = buildPosterPrompt({ ...base, type: 'set', refs: 3 });
  assert.match(p, /CASTING/);
  assert.match(p, /Never a stock-photo face/);
});
