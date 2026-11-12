#!/usr/bin/env node
// fit.mjs — does the output actually fit the surface it was designed for?
//
// WHY THIS EXISTS
// The first fixed-canvas run produced four posters. Two of them overflowed: a
// display word clipped to "GROTE" mid-letter, and a schedule whose last row was
// cut off by the canvas edge. Both were obvious to the eye and invisible to the
// pipeline, which happily reported success.
//
// This is the one kind of measurement the engine should be doing. It is NOT
// scoring taste, which is the thing that failed twice and got retired. It is
// catching a mechanical failure with a right answer: content either fits inside
// the canvas or it does not. Evidence, never a score.
//
// Deliberate distinction: an element crossing the canvas edge is not always a
// mistake. Full-bleed imagery and type intentionally running off the edge are
// real moves, and this brief explicitly allows full bleed. Clipped READING
// COPY is the failure. So overflow carrying text is an error, overflow without
// text is a warning, and the caller decides.

export const PROBE_ID = '__taste_fit__';

// Injected before </body>. Records viewport, scroll extent, and every element
// whose box escapes the viewport, then parks it in a hidden div for --dump-dom.
export function probeScript(probeId = PROBE_ID) {
  return `<script>(function(){try{
var d=document.documentElement,b=document.body;
var vw=window.innerWidth,vh=window.innerHeight;
var out={vw:vw,vh:vh,sw:Math.max(d.scrollWidth,b?b.scrollWidth:0),sh:Math.max(d.scrollHeight,b?b.scrollHeight:0),over:[],clip:[]};
var all=document.querySelectorAll('*');
for(var i=0;i<all.length;i++){var el=all[i];
if(el.id==='${probeId}')continue;
var r=el.getBoundingClientRect();
if(r.width===0||r.height===0)continue;
var own='';for(var j=0;j<el.childNodes.length;j++){if(el.childNodes[j].nodeType===3)own+=el.childNodes[j].nodeValue;}
own=own.trim();
// Case 1: the element's own box escapes the canvas.
if(r.right>vw+1||r.bottom>vh+1||r.left<-1||r.top<-1){
out.over.push({tag:el.tagName.toLowerCase(),text:own.slice(0,60),
left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom)});}
// Case 2: the box fits but its own TEXT is clipped inside it (white-space:nowrap
// under overflow:hidden is the usual culprit). Invisible to rect checks, and the
// most common way a generated layout silently loses a word.
//
// Horizontal only, and only when something actually CLIPS.
//
// Vertical is deliberately NOT checked here. Display type with tight
// line-height (0.78 is a normal Swiss setting) always reports
// scrollHeight > clientHeight because glyphs exceed the line box, and nothing
// is lost. That produced a false positive on a poster that was visibly fine.
// Real vertical loss is already caught by the rect check above and by document
// scrollHeight, so this check earns its keep on the horizontal axis alone,
// where white-space:nowrap genuinely cuts words in half.
if(own){var n=el,cut=false,dep=0;
while(n&&n!==d&&dep<8){var cs=window.getComputedStyle(n);
if(/hidden|clip|scroll|auto/.test(cs.overflow+' '+cs.overflowX+' '+cs.overflowY)){cut=true;break;}
n=n.parentElement;dep++;}
if(cut&&el.scrollWidth>el.clientWidth+2){
out.clip.push({tag:el.tagName.toLowerCase(),text:own.slice(0,60),
sw:el.scrollWidth,cw:el.clientWidth,sh:el.scrollHeight,ch:el.clientHeight});}}}
out.over=out.over.slice(0,25);out.clip=out.clip.slice(0,25);
var p=document.createElement('div');p.id='${probeId}';p.setAttribute('style','display:none');
p.textContent=JSON.stringify(out);(b||d).appendChild(p);
}catch(e){var p2=document.createElement('div');p2.id='${probeId}';p2.textContent=JSON.stringify({error:String(e)});(document.body||document.documentElement).appendChild(p2);}})();</script>`;
}

// Put the probe just before </body> (or at the end if there is no body tag).
export function injectProbe(html, probeId = PROBE_ID) {
  const script = probeScript(probeId);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${script}</html>`);
  return html + script;
}

// Pull the probe payload back out of a dumped DOM.
export function parseProbe(dom, probeId = PROBE_ID) {
  const re = new RegExp(`id="${probeId}"[^>]*>([\\s\\S]*?)</div>`, 'i');
  const m = re.exec(String(dom));
  if (!m) return null;
  const text = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

const TOLERANCE = 2; // subpixel rounding, not a design failure

// Pure verdict. Separated from anything that touches a browser so the rules are
// testable without one.
export function analyzeFit(metrics, canvas, { tolerance = TOLERANCE } = {}) {
  if (!metrics || metrics.error) {
    return { ok: false, measured: false, reason: metrics?.error || 'no probe data', errors: [], warnings: [] };
  }
  const overflowX = Math.max(0, metrics.sw - canvas.w);
  const overflowY = Math.max(0, metrics.sh - canvas.h);
  const errors = [];
  const warnings = [];

  for (const el of metrics.over || []) {
    const escapes = [];
    if (el.right > metrics.vw + tolerance) escapes.push(`right +${Math.round(el.right - metrics.vw)}px`);
    if (el.bottom > metrics.vh + tolerance) escapes.push(`bottom +${Math.round(el.bottom - metrics.vh)}px`);
    if (el.left < -tolerance) escapes.push(`left ${Math.round(el.left)}px`);
    if (el.top < -tolerance) escapes.push(`top ${Math.round(el.top)}px`);
    if (!escapes.length) continue;
    const entry = { tag: el.tag, text: el.text, escapes };
    // Text that runs off the canvas cannot be read. That is a hard failure.
    // A box with no text of its own may be a deliberate bleed.
    if (el.text) errors.push(entry);
    else warnings.push(entry);
  }

  // Text clipped inside its own box. Always an error: nobody chooses to cut a
  // word in half with overflow:hidden.
  for (const el of metrics.clip || []) {
    if (el.sw > el.cw + tolerance) {
      errors.push({
        tag: el.tag,
        text: el.text,
        escapes: [`text is ${el.sw - el.cw}px wider than its box`],
        clipped: true,
      });
    }
  }

  if (overflowY > tolerance && !errors.length) {
    errors.push({ tag: 'document', text: '', escapes: [`scrollHeight +${overflowY}px past the canvas`] });
  }
  if (overflowX > tolerance && !errors.length) {
    errors.push({ tag: 'document', text: '', escapes: [`scrollWidth +${overflowX}px past the canvas`] });
  }

  return {
    ok: errors.length === 0,
    measured: true,
    canvas: { w: canvas.w, h: canvas.h },
    viewport: { w: metrics.vw, h: metrics.vh },
    overflowX,
    overflowY,
    errors,
    warnings,
    reason: errors.length ? summarize(errors) : 'content fits the canvas',
  };
}

function summarize(errors) {
  const first = errors[0];
  const label = first.text ? `"${first.text}"` : `<${first.tag}>`;
  const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';
  return `${label} escapes the canvas: ${first.escapes.join(', ')}${more}`;
}

// One line the human actually reads.
export function formatFit(fit, name = 'output') {
  if (!fit.measured) return `[fit] ${name}: NOT MEASURED (${fit.reason})`;
  if (fit.ok) {
    const warn = fit.warnings.length ? `, ${fit.warnings.length} intentional-looking bleed(s)` : '';
    return `[fit] ${name}: fits ${fit.canvas.w}x${fit.canvas.h}${warn}`;
  }
  const lines = [`[fit] ${name}: DOES NOT FIT ${fit.canvas.w}x${fit.canvas.h}`];
  for (const e of fit.errors) {
    lines.push(`       ${e.text ? `"${e.text}"` : `<${e.tag}>`} - ${e.escapes.join(', ')}`);
  }
  return lines.join('\n');
}

// Measure a real document. The browser is injected rather than imported so this
// module stays dependency-free and testable: `render(html, canvas) -> domString`.
export async function measureFit(html, canvas, { render }) {
  const dom = await render(injectProbe(html), canvas);
  return analyzeFit(parseProbe(dom), canvas);
}

// The prompt-side half: tell the generator the constraint before it violates it.
export function fitDirectives(canvas) {
  return [
    `HARD CONSTRAINT, the canvas is exactly ${canvas.w}x${canvas.h}px and nothing may escape it:`,
    '- Every glyph of every word must be fully inside the canvas. A display word clipped mid-letter is a failure, not a style.',
    '- Size display type so the LONGEST line fits the width at the chosen size. Reduce the size rather than letting it run off.',
    '- The document must not scroll in either direction. If content does not fit, cut content or reduce scale.',
    '- Type may bleed off the edge ONLY if it is decorative and unreadable by intent, never for a word the viewer needs to read.',
  ];
}
