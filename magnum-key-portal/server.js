#!/usr/bin/env node
/**
 * Magnum v4 72B — Free API Key Portal (legitimate demo gateway)
 *
 * What this is:
 * - Issues YOUR OWN free API keys (mk-...) for YOUR OWN gateway.
 * - OpenAI-compatible: POST /v1/chat/completions with model "anthracite-org/magnum-v4-72b"
 * - If OPENROUTER_API_KEY is set, it proxies to OpenRouter. Otherwise it runs in MOCK mode
 *   (free demo responses) so you can develop without spending money.
 *
 * What this is NOT:
 * - It does not generate / steal keys for OpenAI, Anthropic, OpenRouter, etc.
 *   To call the real magnum-v4-72b you must bring your own upstream key from a free tier:
 *     1. OpenRouter (https://openrouter.ai) — create key, some models/routes have free tier / credits
 *     2. Hugging Face Inference (https://huggingface.co/anthracite-org/magnum-v4-72b) — free Serverless Inference with HF token
 *     3. Puter.js (https://developer.puter.com) — user-pays, free for developers
 *
 * Run:
 *   PORT=3002 node server.js
 *   OPENROUTER_API_KEY=sk-or-... PORT=3002 node server.js   # live mode
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3002;
const MODEL_ID = 'anthracite-org/magnum-v4-72b';
const DB_PATH = path.join(__dirname, 'data', 'keys.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_QUOTA = 50000; // free tokens per key (demo quota)

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { keys: [] };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function newKey() {
  return 'mk-' + crypto.randomBytes(24).toString('base64url');
}
function redact(k) {
  if (!k || k.length < 12) return '***';
  return k.slice(0, 6) + '...' + k.slice(-4);
}
function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function getBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}
function findKey(req, db) {
  const auth = req.headers['authorization'] || '';
  const xkey = req.headers['x-api-key'] || '';
  let token = '';
  if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
  else if (xkey) token = String(xkey).trim();
  // also allow ?key= for quick browser tests
  if (!token) {
    try {
      const u = new URL(req.url, 'http://x');
      token = u.searchParams.get('key') || '';
    } catch {}
  }
  if (!token) return null;
  return db.keys.find((k) => k.key === token && !k.revoked) || null;
}
function mockReply(messages) {
  const last = [...(messages || [])].reverse().find((m) => m.role === 'user');
  const q = (last && last.content) || 'Hello';
  const excerpt = String(typeof q === 'string' ? q : JSON.stringify(q)).slice(0, 300);
  return `**[MOCK free demo — set OPENROUTER_API_KEY for live ${MODEL_ID}]**\n\nYou asked: "${excerpt}"\n\nTo go live:\n1. Get an upstream key (OpenRouter / Hugging Face / Puter).\n2. Restart: OPENROUTER_API_KEY=sk-or-... node server.js\n3. Keep using the same mk-... key — this gateway will proxy to the real model.\n\nYour mk-... keys are free keys *for this gateway* (quota-tracked). They are not OpenRouter/Anthropic keys.`;
}
function proxyToOpenRouter(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ ...body, model: MODEL_ID });
    const req = https.request(
      {
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'magnum-key-portal',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => resolve({ status: r.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
function contentType(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'text/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.json')) return 'application/json';
  return 'text/plain';
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    });
    return res.end();
  }
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // --- static ---
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    const f = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(f));
  }
  if (req.method === 'GET' && p.startsWith('/app.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(fs.readFileSync(path.join(PUBLIC_DIR, 'app.js')));
  }

  // --- info ---
  if (req.method === 'GET' && p === '/api/info') {
    return sendJSON(res, 200, {
      model: MODEL_ID,
      mode: process.env.OPENROUTER_API_KEY ? 'live-openrouter' : 'mock-free-demo',
      quotaPerKey: DEFAULT_QUOTA,
      endpoints: ['POST /v1/chat/completions', 'GET /v1/models', 'POST /api/keys', 'GET /api/keys'],
      freeUpstream: [
        'OpenRouter dashboard -> create key (free models/credits vary)',
        'HuggingFace Inference API with HF token',
        'Puter.js user-pays (free for devs)',
      ],
    });
  }

  // --- create key ---
  if (req.method === 'POST' && p === '/api/keys') {
    const body = await getBody(req);
    const db = loadDB();
    const record = {
      id: crypto.randomUUID(),
      name: String(body.name || 'my-key').slice(0, 60),
      key: newKey(),
      createdAt: new Date().toISOString(),
      quota: DEFAULT_QUOTA,
      used: 0,
      revoked: false,
    };
    db.keys.push(record);
    saveDB(db);
    return sendJSON(res, 201, { ...record, redacted: redact(record.key), note: 'Copy the full key now — it will be redacted on list.' });
  }

  // --- list keys (redacted) ---
  if (req.method === 'GET' && p === '/api/keys') {
    const db = loadDB();
    return sendJSON(res, 200, {
      keys: db.keys.map((k) => ({ ...k, key: undefined, display: redact(k.key) })),
    });
  }

  // --- revoke ---
  if (req.method === 'DELETE' && p.startsWith('/api/keys/')) {
    const id = p.split('/').pop();
    const db = loadDB();
    const k = db.keys.find((x) => x.id === id);
    if (!k) return sendJSON(res, 404, { error: 'not found' });
    k.revoked = true;
    saveDB(db);
    return sendJSON(res, 200, { ok: true });
  }

  // --- models ---
  if (req.method === 'GET' && p === '/v1/models') {
    return sendJSON(res, 200, { object: 'list', data: [{ id: MODEL_ID, object: 'model', owned_by: 'anthracite-org' }] });
  }

  // --- chat completions (OpenAI-compatible) ---
  if (req.method === 'POST' && (p === '/v1/chat/completions' || p === '/api/chat')) {
    const body = await getBody(req);
    const db = loadDB();
    const record = findKey(req, db);
    if (!record) {
      return sendJSON(res, 401, { error: { message: 'Missing/invalid API key. Create one via POST /api/keys and send as Authorization: Bearer mk-...', type: 'auth' } });
    }
    const messages = body.messages || [];
    const promptTokens = messages.reduce((n, m) => n + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
    if (record.used + promptTokens > record.quota) {
      return sendJSON(res, 429, { error: { message: 'Free quota exceeded for this key. Create a new key or raise quota.', type: 'quota' } });
    }

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const upstream = await proxyToOpenRouter({ messages, max_tokens: body.max_tokens || 512, temperature: body.temperature ?? 0.7, stream: false });
        record.used += promptTokens + 500;
        saveDB(db);
        res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(upstream.body);
      } catch (e) {
        return sendJSON(res, 502, { error: { message: 'Upstream OpenRouter error: ' + e.message } });
      }
    }

    // mock free demo
    const reply = mockReply(messages);
    record.used += promptTokens + estimateTokens(reply);
    saveDB(db);
    return sendJSON(res, 200, {
      id: 'chatcmpl-mock-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: MODEL_ID,
      choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: promptTokens, completion_tokens: estimateTokens(reply), total_tokens: promptTokens + estimateTokens(reply), quota_used: record.used, quota: record.quota },
    });
  }

  return sendJSON(res, 404, { error: 'not found. Try GET /api/info' });
});

server.listen(PORT, () => console.log(`Magnum key portal on http://localhost:${PORT} model=${MODEL_ID} mode=${process.env.OPENROUTER_API_KEY ? 'live' : 'mock'}`));
