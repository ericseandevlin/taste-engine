// image-agent.mjs: the one place that makes images.
// Every generated image in the engine comes from this module and from one model,
// Gemini 3.1 Flash Image ("Nano Banana 2"), so the image side has a single owner:
// one model, one request shape, one output shape. Text and vision stages never
// make images; this agent never reads or judges them.
//
// It reaches the model through Google directly (GEMINI_API_KEY) or through
// OpenRouter (OPENROUTER_API_KEY), whichever key the user has.
//
//   const draw = makeImageAgent(process.env);
//   const { data, mimeType, note } = await draw({ prompt, aspect: '3:4' });
//
// `images` (optional) are reference images sent with the prompt, each
// { data: base64, mimeType }, so the model sees the board instead of only
// reading a description of it.

import { MODELS } from './config.mjs';
import { routeModel } from './models.mjs';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Pure: pull the first image and any text note out of a Gemini response.
export function imageOfGemini(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  const note = parts.filter((p) => p.text).map((p) => p.text).join('').trim();
  return img ? { data: img.inlineData.data, mimeType: img.inlineData.mimeType || 'image/png', note } : null;
}

// Pure: pull the first image out of an OpenRouter chat response (a data URL).
export function imageOfOpenRouter(json) {
  const msg = json?.choices?.[0]?.message || {};
  const url = msg.images?.[0]?.image_url?.url || '';
  const m = /^data:([^;]+);base64,(.+)$/s.exec(url);
  const note = typeof msg.content === 'string' ? msg.content.trim() : '';
  return m ? { data: m[2], mimeType: m[1], note } : null;
}

// Pure: the user message content for OpenRouter. Text alone stays a string;
// with references it becomes text plus image_url data parts.
export function openRouterContent(prompt, images = []) {
  if (!images.length) return prompt;
  return [{ type: 'text', text: prompt }, ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mimeType};base64,${im.data}` } }))];
}

// Pure: the request parts for the Google API: text, then inlineData per reference.
export function geminiParts(prompt, images = []) {
  return [{ text: prompt }, ...images.map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.data } }))];
}

export function makeImageAgent(env, model = MODELS.image) {
  const routed = routeModel(model, env);
  const viaOpenRouter = routed.includes('/');
  return async function draw({ prompt, aspect = '3:4', images = [] }) {
    let out;
    if (viaOpenRouter) {
      const res = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/ericseandevlin/taste-engine',
          'X-Title': 'taste-engine',
        },
        body: JSON.stringify({
          model: routed,
          modalities: ['image', 'text'],
          image_config: { aspect_ratio: aspect },
          messages: [{ role: 'user', content: openRouterContent(prompt, images) }],
        }),
      });
      if (!res.ok) throw new Error(`image agent (openrouter) ${res.status}: ${(await res.text()).slice(0, 400)}`);
      out = imageOfOpenRouter(await res.json());
    } else {
      const res = await fetch(`${GEMINI_ENDPOINT}/${routed}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: geminiParts(prompt, images) }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: aspect } },
        }),
      });
      if (!res.ok) throw new Error(`image agent (gemini) ${res.status}: ${(await res.text()).slice(0, 400)}`);
      out = imageOfGemini(await res.json());
    }
    if (!out) throw new Error('image agent: the model returned no image');
    return { ...out, model: routed };
  };
}
