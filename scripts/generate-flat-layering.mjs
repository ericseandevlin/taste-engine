#!/usr/bin/env node
// generate-flat-layering.mjs — generate posters conditioned on the flat-layering
// reference images, using Gemini Flash Image's native vision-to-image pipeline.
//
// This bypasses the taste engine's Anthropic-dependent extraction pipeline and
// goes straight to image-conditioned generation: the model sees the references,
// understands the flat-layering taste, and generates posters in that style.
//
// Usage:
//   node scripts/generate-flat-layering.mjs [--count 4]

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../src/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARD_DIR = join(__dirname, '../boards/flat-layering');
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models';

const POSTER_JOBS = [
  {
    subject: 'A poster for an exhibition titled "Surface Tension" — a show about overlapping color planes and flat dimensionality in contemporary design. Dark ground, overlapping opaque color fields. April 12 — May 3, 2026. Galleria Moderna.',
    style: 'Overlapping opaque color planes, flat dimensionality, high-chroma accents on neutral ground, generous margins, asymmetric tension.',
    tag: 'exhibition',
  },
  {
    subject: 'A poster for a workshop: "Color Fields & Planes" — a three-day intensive on working with flat color and layered compositions. May 15-17, 2026. Studio 214. Led by Erin Chen.',
    style: 'Layered color planes, flat-dimension aesthetic, duotone feeling, cool-warm contrast, type integrated into the composition as a graphic element.',
    tag: 'workshop',
  },
  {
    subject: 'A poster for a talk: "The New Flatness" — how contemporary graphic design uses overlapping and transparency to create depth without perspective. June 2, 2026. Cooper Union, Great Hall. 7 PM.',
    style: 'Asymmetric composition, type as image, wordmark as art, generous negative space, spot color on neutral ground, dense-collage elements allowed.',
    tag: 'talk',
  },
  {
    subject: 'A poster for "Flat Layering" — a monograph launch and exhibition of collected works exploring flat dimensionality in graphic design, 2016-2026. Published by Unit Editions. Launch event September 8, 2026. Printed Matter, NY.',
    style: 'One grotesk voice, hierarchy by scale, ink-first palette, tabular index layout, exposed construction, hairline structure.',
    tag: 'monograph',
  },
];

function parseArgs(argv) {
  const args = { count: 4, model: 'gemini-3.1-flash-image', start: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') args.count = Number(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--start') args.start = Number(argv[++i]);
  }
  return args;
}

function loadRefImages(boardDir) {
  const files = readdirSync(boardDir).filter(f =>
    /\.(webp|png|jpg|jpeg)$/i.test(f) &&
    !f.startsWith('.')
  );
  return files.slice(0, 6).map(f => {
    const buf = readFileSync(join(boardDir, f));
    const ext = extname(f).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { file: f, data: buf.toString('base64'), mimeType: mime };
  });
}

function pad(n) {
  return String(n).padStart(3, '0');
}

async function generatePoster(refImages, job, apiKey, modelName, outDir) {
  const parts = [];

  // Add reference images as visual context
  for (const ref of refImages.slice(0, 4)) {
    parts.push({
      inlineData: { mimeType: ref.mimeType, data: ref.data }
    });
  }

  // Build the prompt
  const prompt = `These are reference images showing the "flat-layering" design taste — overlapping opaque color planes, flat dimensionality, type as image, and asymmetric composition.

Generate a poster as an image inspired by this flat-layering aesthetic.

POSTER CONTENT:
${job.subject}

STYLE DIRECTIVES:
${job.style}

OUTPUT: A professional poster image. Typography should be clean and well-set. The poster should feel like it belongs in this flat-layering taste family — overlapping color planes, flat dimensionality, considered composition. Include the exact copy provided.`;

  parts.push({ text: prompt });

  const url = `${GEMINI_ENDPOINT}/${modelName}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts }],
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  // Use all jobs or subset
  const jobs = POSTER_JOBS.slice(0, args.count);

  // Load reference images
  const refImages = loadRefImages(BOARD_DIR);
  console.log(`[flat-layering] Loaded ${refImages.length} reference images`);

  const outDir = join(BOARD_DIR, 'generated-posters');
  mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`[flat-layering] Poster ${i + 1}/${jobs.length}: ${job.tag}...`);
    console.log(`[flat-layering]  Subject: ${job.subject.substring(0, 80)}...`);

    try {
      const data = await generatePoster(refImages, job, apiKey, args.model, outDir);
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter(p => p.text).map(p => p.text).join('');
      const img = (data.candidates?.[0]?.content?.parts || [])
        .find(p => p.inlineData);

      if (text) {
        console.log(`[flat-layering]  Model note: ${text.substring(0, 150)}`);
      }

      if (img) {
        const ext = img.inlineData.mimeType?.includes('png') ? 'png' :
                     img.inlineData.mimeType?.includes('jpeg') ? 'jpg' : 'png';
        const idx = args.start ? args.start + i : i + 1;
        const slug = `poster-flat-${pad(idx)}-${job.tag}`;
        const buf = Buffer.from(img.inlineData.data, 'base64');
        writeFileSync(join(outDir, `${slug}.${ext}`), buf);
        writeFileSync(join(outDir, `${slug}.meta.json`), JSON.stringify({
          tag: job.tag,
          subject: job.subject,
          style: job.style,
                      model: args.model,
          generated: new Date().toISOString(),
          size: buf.length,
        }, null, 2) + '\n');
        console.log(`[flat-layering]  -> ${slug}.${ext} (${buf.length} bytes)`);
      } else {
        console.log(`[flat-layering]  No image in response`);
        if (text) console.log(`[flat-layering]  Full text: ${text}`);
      }
    } catch (err) {
      console.error(`[flat-layering]  FAILED: ${err.message}`);
    }
  }

  console.log(`[flat-layering] Done. Output in ${outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();