// fit.test.mjs — run: node --test src/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROBE_ID,
  probeScript,
  injectProbe,
  parseProbe,
  analyzeFit,
  formatFit,
  fitDirectives,
} from './fit.mjs';

const CANVAS = { w: 1414, h: 2000 };
const fits = { vw: 1414, vh: 2000, sw: 1414, sh: 2000, over: [] };

test('injectProbe places the probe inside body when there is one', () => {
  const html = '<!doctype html><html><body><h1>x</h1></body></html>';
  const out = injectProbe(html);
  assert.ok(out.includes('</body></html>'));
  assert.ok(out.indexOf(PROBE_ID) < out.indexOf('</body>'));
  assert.ok(out.startsWith('<!doctype html>'));
});

test('injectProbe still works on malformed documents', () => {
  assert.ok(injectProbe('<html><h1>x</h1></html>').includes(PROBE_ID));
  assert.ok(injectProbe('<h1>x</h1>').includes(PROBE_ID));
});

test('probeScript skips its own node so the probe never reports itself', () => {
  assert.match(probeScript(), new RegExp(`el\\.id==='${PROBE_ID}'`));
});

test('parseProbe round-trips a payload out of a dumped DOM', () => {
  const payload = { vw: 1414, vh: 2000, sw: 1414, sh: 2100, over: [] };
  const dom = `<html><body><div id="${PROBE_ID}" style="display:none">${JSON.stringify(payload)}</div></body></html>`;
  assert.deepEqual(parseProbe(dom), payload);
});

test('parseProbe decodes entities Chrome escapes in the dump', () => {
  const dom = `<div id="${PROBE_ID}">{&quot;vw&quot;:10,&quot;over&quot;:[{&quot;text&quot;:&quot;A &amp; B&quot;}]}</div>`;
  assert.equal(parseProbe(dom).over[0].text, 'A & B');
});

test('parseProbe returns null rather than throwing on junk', () => {
  assert.equal(parseProbe('<html>no probe here</html>'), null);
  assert.equal(parseProbe(`<div id="${PROBE_ID}">not json</div>`), null);
});

test('a page that fits is ok', () => {
  const fit = analyzeFit(fits, CANVAS);
  assert.equal(fit.ok, true);
  assert.equal(fit.overflowX, 0);
  assert.equal(fit.overflowY, 0);
  assert.match(fit.reason, /fits the canvas/);
});

test('clipped text is an error, and the message names the actual word', () => {
  // This is the real poster-type-specimen failure: GROTESK cut to GROTE.
  const fit = analyzeFit(
    { ...fits, sw: 1900, over: [{ tag: 'h1', text: 'GROTESK', left: 96, top: 1400, right: 1900, bottom: 1700 }] },
    CANVAS,
  );
  assert.equal(fit.ok, false);
  assert.equal(fit.errors.length, 1);
  assert.match(fit.reason, /GROTESK/);
  assert.match(fit.reason, /right \+486px/);
});

test('overflowing text at the bottom is an error too', () => {
  // The real poster-schedule-warm failure: last table row past the edge.
  const fit = analyzeFit(
    { ...fits, sh: 2140, over: [{ tag: 'td', text: 'Closing notes', left: 96, top: 1980, right: 800, bottom: 2140 }] },
    CANVAS,
  );
  assert.equal(fit.ok, false);
  assert.match(fit.reason, /Closing notes/);
  assert.match(fit.reason, /bottom \+140px/);
});

test('text clipped inside its own box is caught, even though the box fits', () => {
  // The actual poster-type-specimen mechanism: white-space:nowrap under
  // overflow:hidden. The div's rect is in bounds; the word is cut in half.
  const fit = analyzeFit(
    { ...fits, clip: [{ tag: 'div', text: 'GROTESK', sw: 2209, cw: 1222, sh: 430, ch: 430 }] },
    CANVAS,
  );
  assert.equal(fit.ok, false);
  assert.equal(fit.errors[0].clipped, true);
  assert.match(fit.reason, /GROTESK/);
  assert.match(fit.reason, /987px wider than its box/);
});

test('normal text that fits its box is not flagged as clipped', () => {
  const fit = analyzeFit(
    { ...fits, clip: [] , over: [] },
    CANVAS,
  );
  assert.equal(fit.ok, true);
});

test('a textless box crossing the edge is a warning, not an error: full bleed is allowed', () => {
  const fit = analyzeFit(
    { ...fits, over: [{ tag: 'div', text: '', left: -40, top: 0, right: 1454, bottom: 900 }] },
    CANVAS,
  );
  assert.equal(fit.ok, true, 'a deliberate bleed must not fail the run');
  assert.equal(fit.warnings.length, 1);
  assert.equal(fit.errors.length, 0);
});

test('document overflow is caught even when no single element is flagged', () => {
  const fit = analyzeFit({ ...fits, sh: 2400, over: [] }, CANVAS);
  assert.equal(fit.ok, false);
  assert.equal(fit.overflowY, 400);
  assert.match(fit.reason, /scrollHeight \+400px/);
});

test('subpixel rounding does not fail a page', () => {
  const fit = analyzeFit({ ...fits, sw: 1415, sh: 2001 }, CANVAS);
  assert.equal(fit.ok, true);
});

test('a failed probe reports not-measured rather than a false pass', () => {
  assert.equal(analyzeFit(null, CANVAS).measured, false);
  assert.equal(analyzeFit(null, CANVAS).ok, false, 'unmeasured must never read as ok');
  assert.equal(analyzeFit({ error: 'boom' }, CANVAS).ok, false);
});

test('formatFit prints something a human can act on', () => {
  const bad = analyzeFit(
    { ...fits, over: [{ tag: 'h1', text: 'GROTESK', left: 96, top: 1400, right: 1900, bottom: 1700 }] },
    CANVAS,
  );
  const text = formatFit(bad, 'poster-type-specimen');
  assert.match(text, /DOES NOT FIT 1414x2000/);
  assert.match(text, /GROTESK/);
  assert.match(formatFit(analyzeFit(fits, CANVAS), 'ok-one'), /fits 1414x2000/);
  assert.match(formatFit({ measured: false, reason: 'no probe data' }, 'x'), /NOT MEASURED/);
});

test('fitDirectives states the constraint in a way a generator can obey', () => {
  const text = fitDirectives(CANVAS).join('\n');
  assert.match(text, /1414x2000/);
  assert.match(text, /clipped mid-letter/);
  assert.match(text, /must not scroll/);
});
