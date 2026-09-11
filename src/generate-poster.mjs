#!/usr/bin/env node
// generate-poster.mjs — generate poster images via Gemini Flash Image.
//
// Posters are the second kind (see config.mjs §poster). Unlike websites which
// generate HTML+CSS, posters route to an image model because poster taste is
// image-forward (duotone photography, hand lettering, rendered chrome type,
// collage, flat layering) — HTML+CSS cannot express it.
//
// Reads the board's taste data (channels, directions, thesis) and a poster job
// description, then calls Gemini Flash Image to generate a poster image.
//
// Usage:
//   node generate-poster.mjs --board flat-layering --subject "title/event/etc"
//   node generate-poster.mjs --board swiss-focus --subject "Exhibition: Neue Typographie" --count 2
//   node generate-poster.mjs --prompt "A poster for..."                    # pure text prompt, no board
//   node generate-poster.mjs --board flat-layering --survey survey.json    # load from survey output
//
// Options:
//   --board <name>     Board to use for taste data (channels.json, directions.json)
//   --prompt <text>    Direct text prompt (skips board data, use alone or with --subject)
//   --subject <text>   Poster subject/copy (e.g. "Exhibition title, date, venue")
//   --survey <file>    Load poster survey JSON (the web survey output format)
//   --count <n>        Number of poster variants to generate (default 1)
//   --model <name>     Gemini model to use (default: gemini-3.1-flash-image)
//   --out <dir>        Output directory (default: boards/<board>/generated-posters or ./posters)
//   --tag <tag>        Saved output tag name (e.g. "round-1", "type-led")

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getBoard, REPO_ROOT, loadEnv } from './config.mjs';
import { readManifest } from './manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Google Gemini API ---
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models';

function textOf(json) {
  return (json.candidates?.[0]?.content?.parts || [])
    .filter(p => p.text)
    .map(p => p.text)
    .join('');
}

function imageOf(json) {
  const parts = json.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return { data: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' };
    }
  }
  return null;
}

async function geminiGenerate(prompt, apiKey, model = 'gemini-3.1-flash-image') {
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  return res.json();
}

// --- Prompt building ---

function loadBoardTaste(boardName) {
  const board = getBoard(boardName);
  const channels = readManifest(join(board.absDir, 'channels.json'));
  const directions = readManifest(join(board.absDir, 'directions.json'));
  const thesis = readManifest(join(board.absDir, 'thesis.md'));
  const fingerprint = null; // fingerprints are per-image, too detailed for a generation prompt

  // Read the brief if it exists
  let brief = null;
  const briefPath = join(board.absDir, 'brief', 'brief.md');
  if (existsSync(briefPath)) {
    brief = readFileSync(briefPath, 'utf8');
  }

  return { board, channels, directions, thesis, brief };
}

function buildPosterPrompt({ taste, subject, survey, style }) {
  const lines = [];
  lines.push('Generate a poster as an image. The poster should be a print-ready design.');
  lines.push('');

  // Subject / copy
  if (subject) {
    lines.push('POSTER CONTENT:');
    lines.push(subject);
    lines.push('');
  }

  // Survey context
  if (survey) {
    lines.push('SURVEY CONTEXT:');
    if (survey.what) lines.push(`What: ${Array.isArray(survey.what) ? survey.what.join(', ') : survey.what}`);
    if (survey.who) lines.push(`Audience: ${survey.who}`);
    if (survey.where) lines.push(`Location: ${Array.isArray(survey.where) ? survey.where.join(', ') : survey.where}`);
    if (survey.onething) lines.push(`One thing to accomplish: ${survey.onething}`);
    if (survey.first) lines.push(`First feeling: ${survey.first}`);
    if (survey.register) lines.push(`Register: ${Array.isArray(survey.register) ? survey.register.join(', ') : survey.register}`);
    if (survey.lineage) lines.push(`Lineage: ${Array.isArray(survey.lineage) ? survey.lineage.join(', ') : survey.lineage}`);
    if (survey.hier) lines.push(`Read order: ${survey.hier}`);
    if (survey.imgrole) lines.push(`Image/type: ${Array.isArray(survey.imgrole) ? survey.imgrole.join(', ') : survey.imgrole}`);
    if (survey.type) lines.push(`Typography: ${Array.isArray(survey.type) ? survey.type.join(', ') : survey.type}`);
    if (survey.color) lines.push(`Colour: ${Array.isArray(survey.color) ? survey.color.join(', ') : survey.color}`);
    if (survey.comp) lines.push(`Composition: ${Array.isArray(survey.comp) ? survey.comp.join(', ') : survey.comp}`);
    if (survey.avoid) lines.push(`Forbidden: ${survey.avoid}`);
    if (survey.size) lines.push(`Format: ${Array.isArray(survey.size) ? survey.size.join(', ') : survey.size}`);
    if (survey.medium) lines.push(`Medium: ${Array.isArray(survey.medium) ? survey.medium.join(', ') : survey.medium}`);
    lines.push('');
  }

  // Taste data from the board
  if (taste) {
    if (taste.brief) {
      lines.push('DESIGN BRIEF (from taste extraction):');
      lines.push(taste.brief.substring(0, 3000));
      lines.push('');
    }

    if (taste.channels?.channels) {
      lines.push('TASTE CHANNELS (blend these design languages):');
      for (const ch of taste.channels.channels) {
        lines.push(`\n--- ${ch.name} ---`);
        if (ch.recipe) {
          for (const [k, v] of Object.entries(ch.recipe)) {
            lines.push(`  ${k}: ${v}`);
          }
        }
        if (ch.forbidden?.length) {
          lines.push('  FORBIDDEN:');
          for (const f of ch.forbidden) lines.push(`  - ${f}`);
        }
      }
      lines.push('');
    }

    if (taste.directions?.directions) {
      lines.push('DESIGN DIRECTIONS (pick the most relevant):');
      for (const [id, dir] of Object.entries(taste.directions.directions)) {
        lines.push(`- ${dir.name || id}: ${dir.brief || ''}`);
      }
      lines.push('');
    }

    if (taste.thesis) {
      lines.push('THESIS:');
      lines.push(taste.thesis.substring(0, 1500));
      lines.push('');
    }
  }

  // Style override
  if (style) {
    lines.push('STYLE DIRECTIVES:');
    lines.push(style);
    lines.push('');
  }

  // Output instruction
  lines.push('OUTPUT: A poster image. The poster should be well-composed, with clear typography and hierarchy. If copy is provided, include it exactly. Make it a professional, print-ready design.');
  lines.push('Return the image directly. Do not describe it — generate it.');

  return lines.join('\n');
}

// --- Output ---

function pad(n) {
  return String(n).padStart(3, '0');
}

function nextIndex(outDir, tag) {
  let max = 0;
  if (existsSync(outDir)) {
    const re = new RegExp(`^poster-${tag || 'gen'}-(\\d+)\\.`);
    for (const d of readdirSync(outDir)) {
      const m = re.exec(d);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

function extForMime(mime) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

// --- CLI ---

function parseArgs(argv) {
  const args = {
    board: null,
    prompt: null,
    subject: null,
    survey: null,
    count: 1,
    model: 'gemini-3.1-flash-image',
    out: null,
    tag: null,
    style: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--board') args.board = argv[++i];
    else if (argv[i] === '--prompt') args.prompt = argv[++i];
    else if (argv[i] === '--subject') args.subject = argv[++i];
    else if (argv[i] === '--survey') args.survey = argv[++i];
    else if (argv[i] === '--count') args.count = Number(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--tag') args.tag = argv[++i];
    else if (argv[i] === '--style') args.style = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env');

  // Resolve board taste data
  let taste = null;
  if (args.board) {
    taste = loadBoardTaste(args.board);
    console.log(`[generate-poster] Board: ${args.board} (${taste.board.kind})`);
    if (taste.channels) console.log(`[generate-poster]  ${taste.channels.channels?.length || 0} channels loaded`);
    if (taste.directions) console.log(`[generate-poster]  ${Object.keys(taste.directions.directions || {}).length} directions loaded`);
  }

  // Load survey if provided
  let survey = null;
  if (args.survey) {
    survey = JSON.parse(readFileSync(args.survey, 'utf8'));
    console.log(`[generate-poster] Survey loaded from ${args.survey}`);
  }

  // Determine output directory
  let outDir = args.out;
  if (!outDir && args.board) {
    const board = getBoard(args.board);
    outDir = join(board.absDir, 'generated-posters');
  } else if (!outDir) {
    outDir = join(process.cwd(), 'posters');
  }
  mkdirSync(outDir, { recursive: true });

  // Build the prompt
  let prompt = args.prompt;
  if (!prompt) {
    prompt = buildPosterPrompt({ taste, subject: args.subject, survey, style: args.style });
  }

  if (args.prompt && args.subject) {
    prompt = `${args.subject}\n\n${args.prompt}`;
  }

  console.log(`[generate-poster] Prompt length: ${prompt.length} chars`);
  if (prompt.length > 500) {
    console.log(`[generate-poster] Prompt preview: ${prompt.substring(0, 200)}...`);
  }

  const tag = args.tag || 'gen';
  let start = nextIndex(outDir, tag);

  for (let v = 0; v < args.count; v++) {
    console.log(`[generate-poster] Generating variant ${v + 1}/${args.count}...`);
    const data = await geminiGenerate(prompt, apiKey, args.model);
    const text = textOf(data);
    const img = imageOf(data);

    if (text) {
      console.log(`[generate-poster]  Model note: ${text.substring(0, 200)}`);
    }

    if (img) {
      const ext = extForMime(img.mimeType);
      const idx = start + v;
      const slug = `poster-${tag}-${pad(idx)}`;
      const imgPath = join(outDir, `${slug}.${ext}`);
      const buf = Buffer.from(img.data, 'base64');
      writeFileSync(imgPath, buf);

      // Write meta
      const meta = {
        board: args.board,
        model: args.model,
        subject: args.subject,
        survey: args.survey || null,
        generated: new Date().toISOString(),
        mimeType: img.mimeType,
        size: buf.length,
        promptLength: prompt.length,
        modelNote: text?.substring(0, 500) || null,
      };
      writeFileSync(join(outDir, `${slug}.meta.json`), JSON.stringify(meta, null, 2) + '\n');

      console.log(`[generate-poster]  -> ${imgPath} (${buf.length} bytes)`);
    } else {
      console.log(`[generate-poster]  No image in response`);
      if (text) console.log(`[generate-poster]  Full text: ${text}`);
    }
  }

  console.log(`[generate-poster] Done. ${args.count} poster(s) in ${outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();