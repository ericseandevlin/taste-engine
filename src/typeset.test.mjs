import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { pickFont, calmRun, inkFor, typeset } from './typeset.mjs';

test('pickFont: sans by default, serif only when the type rules ask for serif and no sans', () => {
  assert.match(pickFont([]), /sans-serif$/);
  assert.match(pickFont([{ aspect: 'type', rule: 'Compact grotesque' }]), /sans-serif$/);
  assert.match(pickFont([{ aspect: 'type', rule: 'Sharp classical serif' }]), /^Georgia/);
  assert.match(pickFont([{ aspect: 'type', rule: 'Sharp serif' }, { aspect: 'type', rule: 'Grotesque display' }]), /sans-serif$/);
  assert.match(pickFont([{ aspect: 'type', rule: 'A sans-serif family' }]), /sans-serif$/);
  assert.match(pickFont([{ aspect: 'color', rule: 'serif' }]), /sans-serif$/);
});

test('calmRun counts calm rows from an edge and skips a thin frame line', () => {
  assert.deepEqual(calmRun([5, 5, 5, 40, 40]), { skip: 0, rows: 3 });
  assert.deepEqual(calmRun([40, 5, 5, 5, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40]), { skip: 1, rows: 3 });
  assert.deepEqual(calmRun([40, 40, 5, 5]), { skip: 0, rows: 0 });
  assert.deepEqual(calmRun([40, 40, 5, 5], true), { skip: 0, rows: 2 });
});

test('inkFor reads black on light and white on dark', () => {
  assert.equal(inkFor([240, 240, 230]), '#000000');
  assert.equal(inkFor([20, 20, 30]), '#ffffff');
});

test('typeset sets the copy on a calm band without a panel', async () => {
  const art = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#111111' } }).png().toBuffer();
  const out = await typeset(art, ['Open Studio', '20 Nov 2026'], {});
  assert.equal(out.band, 'top');
  assert.equal(out.panel, false);
  const meta = await sharp(out.data).metadata();
  assert.deepEqual([meta.width, meta.height], [600, 800]);
  const top = await sharp(out.data).extract({ left: 0, top: 0, width: 600, height: 250 }).stats();
  assert.ok(top.channels[0].max > 200, 'white type was drawn in the top band');
});
