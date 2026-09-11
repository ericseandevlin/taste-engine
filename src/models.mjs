#!/usr/bin/env node
// models.mjs — provider-agnostic model callers for the synthesis stages.
// Routes by model name so the pipeline runs on any provider, not just
// Anthropic (ROADMAP v0.2: "OpenRouter-compatible model path"). Node global
// fetch, no SDK dependency.
//
//   claude-*      -> Anthropic Messages API (legacy path, unchanged behavior)
//   gemini-*      -> Google Gemini generateContent (the poster path pattern)
//   anything else -> OpenRouter chat completions (vendor/model)
//
// The text caller signature mirrors the old anthropic.mjs makeTextCaller so
// stages switch providers by changing the model string, not their code.
//
// === Vision callers ===
// Single-image: ({ image, mediaType, prompt, maxTokens }) => Promise<string>
//   Used by tag.mjs (tagImage) and score.mjs (re-tag pass).
//
// Multi-image: ({ images: [{ data, mediaType }], prompt, maxTokens }) => Promise<string>
//   Used by critique.mjs (two shots: desktop + mobile in one call).

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function textOfAnthropic(json) {
  return (json.content || []).map((c) => c.text || '').join('');
}

function textOfGemini(json) {
  return (json.candidates?.[0]?.content?.parts || [])
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('');
}

function textOfOpenRouter(json) {
  return json.choices?.[0]?.message?.content || '';
}

// Make an Anthropic Messages API text caller (same shape as the old anthropic.mjs).
export function makeAnthropicTextCaller(model, apiKey) {
  return async ({ system, prompt, maxTokens = 2000 }) => {
    const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
    if (system) body.system = system;
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    return textOfAnthropic(await res.json());
  };
}

// Make a Gemini generateContent text caller. Text-only callers; the image
// caller used by the poster path lives in generate-poster.mjs.
export function makeGeminiTextCaller(model, apiKey) {
  return async ({ system, prompt, maxTokens = 2000 }) => {
    const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`gemini ${res.status}: ${err}`);
    }
    return textOfGemini(await res.json());
  };
}

// Make an OpenRouter chat completions caller. Model names are "vendor/model",
// e.g. "deepseek/deepseek-chat" or "google/gemini-2.0-flash".
export function makeOpenRouterTextCaller(model, apiKey) {
  return async ({ system, prompt, maxTokens = 2000 }) => {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/ericseandevlin/taste-engine',
        'X-Title': 'taste-engine',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });
    if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text()}`);
    return textOfOpenRouter(await res.json());
  };
}

// ---------------------------------------------------------------
// Vision callers
// ---------------------------------------------------------------

// Make a Gemini vision caller. Handles single-image input.
// Returns ({ image, mediaType, prompt, maxTokens }) => Promise<string>.
export function makeGeminiVisionCaller(model, apiKey) {
  return async ({ image, mediaType, prompt, maxTokens = 600 }) => {
    const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType: mediaType, data: image } },
          { text: prompt },
        ],
      }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`gemini ${res.status}: ${err}`);
    }
    return textOfGemini(await res.json());
  };
}

// Make a Gemini multi-image vision caller (critique sends desktop + mobile).
// Returns ({ images: [{ data, mediaType }], prompt, maxTokens }) => Promise<string>.
export function makeGeminiMultiImageCaller(model, apiKey) {
  return async ({ images, prompt, maxTokens = 1500 }) => {
    const parts = images.map((img) => ({
      inlineData: { mimeType: img.mediaType, data: img.data },
    }));
    parts.push({ text: prompt });
    const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`gemini ${res.status}: ${err}`);
    }
    return textOfGemini(await res.json());
  };
}

// Make an Anthropic vision caller (backward compat).
// Returns ({ image, mediaType, prompt, maxTokens }) => Promise<string>.
export function makeAnthropicVisionCaller(model, apiKey) {
  return async ({ image, mediaType, prompt, maxTokens = 600 }) => {
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: prompt },
        ],
      }],
    };
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    return textOfAnthropic(await res.json());
  };
}

// Make an Anthropic multi-image vision caller (backward compat for critique).
// Returns ({ images: [{ data, mediaType }], prompt, maxTokens }) => Promise<string>.
export function makeAnthropicMultiImageCaller(model, apiKey) {
  return async ({ images, prompt, maxTokens = 1500 }) => {
    const content = images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    }));
    content.push({ type: 'text', text: prompt });
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    return textOfAnthropic(await res.json());
  };
}

// Resolve a single-image vision caller for a model name.
// Returns { caller, provider } — same pattern as resolveTextCaller.
export function resolveVisionCaller(model, env) {
  if (model.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        `Vision model "${model}" needs ANTHROPIC_API_KEY (.env). None set — use a gemini-* model instead.`,
      );
    }
    return { caller: makeAnthropicVisionCaller(model, env.ANTHROPIC_API_KEY), provider: 'anthropic' };
  }
  if (model.startsWith('gemini-')) {
    if (!env.GEMINI_API_KEY) {
      throw new Error(`Vision model "${model}" needs GEMINI_API_KEY (.env).`);
    }
    return { caller: makeGeminiVisionCaller(model, env.GEMINI_API_KEY), provider: 'gemini' };
  }
  throw new Error(
    `Vision model "${model}" not supported. Use a gemini-* (Google) or claude-* (Anthropic) model.`,
  );
}

// Resolve a multi-image vision caller. Same pattern, broader interface.
export function resolveMultiImageCaller(model, env) {
  if (model.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        `Multi-image model "${model}" needs ANTHROPIC_API_KEY (.env). None set — use a gemini-* model instead.`,
      );
    }
    return { caller: makeAnthropicMultiImageCaller(model, env.ANTHROPIC_API_KEY), provider: 'anthropic' };
  }
  if (model.startsWith('gemini-')) {
    if (!env.GEMINI_API_KEY) {
      throw new Error(`Multi-image model "${model}" needs GEMINI_API_KEY (.env).`);
    }
    return { caller: makeGeminiMultiImageCaller(model, env.GEMINI_API_KEY), provider: 'gemini' };
  }
  throw new Error(
    `Multi-image model "${model}" not supported. Use a gemini-* (Google) or claude-* (Anthropic) model.`,
  );
}

// Pick a text caller for a model name + env. Throws with a helpful message
// when no provider is configured for the model. Exported pure for tests.
export function resolveTextCaller(model, env) {
  if (model.startsWith('claude-')) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        `Model "${model}" needs ANTHROPIC_API_KEY (.env). None set — use a gemini-* or openrouter vendor/model instead (see src/models.mjs).`,
      );
    }
    return { caller: makeAnthropicTextCaller(model, env.ANTHROPIC_API_KEY), provider: 'anthropic' };
  }
  if (model.startsWith('gemini-')) {
    if (!env.GEMINI_API_KEY) {
      throw new Error(`Model "${model}" needs GEMINI_API_KEY (.env).`);
    }
    return { caller: makeGeminiTextCaller(model, env.GEMINI_API_KEY), provider: 'gemini' };
  }
  if (model.includes('/')) {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error(`OpenRouter model "${model}" needs OPENROUTER_API_KEY (.env).`);
    }
    return { caller: makeOpenRouterTextCaller(model, env.OPENROUTER_API_KEY), provider: 'openrouter' };
  }
  throw new Error(
    `Unknown model "${model}". Use a claude-* (Anthropic), gemini-* (Google), or vendor/model (OpenRouter) name.`,
  );
}
