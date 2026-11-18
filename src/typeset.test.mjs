import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { pickFont, calmRun, inkFor, layoutType, panelColor, typeset } from './typeset.mjs';

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

test('layoutType keeps the smaller lines below the title inside the band, even in a short band', () => {
  for (const [top, height] of [[0, 200], [40, 205], [0, 384], [900, 300]]) {
    const L = layoutType(top, height, 896, true);
    assert.ok(L.restTop >= L.titleTop + L.titleH, 'rest starts below the title box');
    assert.ok(L.restTop + L.restH <= top + height, 'rest ends inside the band');
    assert.ok(L.titleTop >= top, 'title starts inside the band');
  }
  const solo = layoutType(0, 300, 896, false);
  assert.equal(solo.restH, 0);
});

test('typeset never lets the date line overlap the title (short band)', async () => {
  const art = await sharp({ create: { width: 896, height: 1200, channels: 3, background: '#d8c9b0' } })
    .composite([{ input: await sharp({ create: { width: 896, height: 995, channels: 3, background: '#000000' } }).png().toBuffer(), left: 0, top: 205 }])
    .png().toBuffer();
  const out = await typeset(art, ['Open Studio', '20 Nov 2026', 'Doors 7pm'], {});
  const [title, rest] = out.boxes;
  assert.ok(rest.top >= title.top + title.height, `date line at ${rest.top} starts below title bottom ${title.top + title.height}`);
  assert.ok(rest.top + rest.height <= out.bandBox.top + out.bandBox.height + 1, 'date line stays inside the calm band');
});

test('panelColor uses the palette lightest color, else white', () => {
  assert.equal(panelColor(['#000000', '#ffcccc', '#cccc99']), '#ffcccc');
  assert.equal(panelColor(['#000000', '#333333']), '#ffffff');
  assert.equal(panelColor([]), '#ffffff');
  assert.equal(panelColor(['bad', 'eeeeee']), '#eeeeee');
});
