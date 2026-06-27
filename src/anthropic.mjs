#!/usr/bin/env node
// anthropic.mjs — minimal Anthropic Messages API callers (text + vision).
// Node global fetch, no SDK dependency. Used by the synthesis/generate stages.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

function headers(apiKey) {
  return {
    'x-api-key': apiKey,
    'anthropic-version': VERSION,
    'content-type': 'application/json',
  };
}

function textOf(json) {
  return (json.content || []).map((c) => c.text || '').join('');
}

// Returns ({ system?, prompt, maxTokens? }) => Promise<string>.
export function makeTextCaller(model, apiKey) {
  return async ({ system, prompt, maxTokens = 2000 }) => {
    const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
    if (system) body.system = system;
    const res = await fetch(ENDPOINT, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    return textOf(await res.json());
  };
}

// Returns ({ image, mediaType, prompt, maxTokens? }) => Promise<string>.
export function makeVisionCaller(model, apiKey) {
  return async ({ image, mediaType, prompt, maxTokens = 600 }) => {
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    };
    const res = await fetch(ENDPOINT, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    return textOf(await res.json());
  };
}
