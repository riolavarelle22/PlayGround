// free-api — self-hosted OpenAI-compatible gateway.
// Zero dependencies (Node 18+ built-ins only).
// Gives you: free API keys YOU issue + one URL usable from any website,
// proxying to anthracite-org/magnum-v4-72b via your chosen upstream.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- tiny .env loader (no dotenv dep) ----
function loadEnv() {
  for (const f of [".env", ".env.example"]) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (process.env[k] === undefined) process.env[k] = v;
    }
    if (f === ".env") break;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-admin-token";
const UPSTREAM_BASE_URL = (process.env.UPSTREAM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || "";
const UPSTREAM_MODEL = process.env.UPSTREAM_MODEL || "anthracite-org/magnum-v4-72b";
const MOCK_WHEN_NO_KEY = (process.env.MOCK_WHEN_NO_KEY || "true").toLowerCase() === "true";
const DB_PATH = path.join(__dirname, "data", "keys.json");

function loadDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify({ keys: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { keys: [] };
  }
}
function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function newGatewayKey() {
  return "sk-free-" + crypto.randomBytes(18).toString("hex");
}
function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    ...extraHeaders,
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5_000_000) req.destroy(); });
    req.on("end", () => resolve(data));
  });
}
function bearerKey(req) {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
function findKey(db, k) {
  if (!k) return null;
  if (k === ADMIN_TOKEN) return { id: "admin", name: "admin-token", unlimited: true };
  return db.keys.find((x) => x.key === k && !x.revoked) || null;
}
function mockReply(model, messages) {
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user")?.content ?? "Hello";
  const text =
    `[MOCK — set UPSTREAM_API_KEY for real ${model}]\n` +
    `You said: ${typeof lastUser === "string" ? lastUser.slice(0, 500) : JSON.stringify(lastUser).slice(0, 500)}\n\n` +
    `To get REAL magnum-v4-72b: 1) run Ollama locally (free/unlimited) and set UPSTREAM_BASE_URL=http://localhost:11434/v1, or ` +
    `2) add your OpenRouter/HF key as UPSTREAM_API_KEY. Your gateway keys + URL stay the same.`;
  return {
    id: "chatcmpl-mock-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-admin-token",
      "access-control-max-age": "86400",
    });
    return res.end();
  }
  const cors = { "access-control-allow-origin": "*" };

  // ---- static UI ----
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const p = path.join(__dirname, "public", "index.html");
    if (fs.existsSync(p)) {
      const html = fs.readFileSync(p, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...cors });
      return res.end(html);
    }
    return sendJson(res, 200, { ok: true, name: "free-api" }, cors);
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      model: UPSTREAM_MODEL,
      upstream: UPSTREAM_BASE_URL,
      mockMode: !UPSTREAM_API_KEY && MOCK_WHEN_NO_KEY,
    }, cors);
  }

  // ---- key management (admin only) ----
  if (url.pathname === "/v1/keys" && req.method === "POST") {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
      return sendJson(res, 401, { error: "bad admin token (x-admin-token header)" }, cors);
    }
    let name = "website-key";
    try { name = JSON.parse((await readBody(req)) || "{}").name || name; } catch {}
    const db = loadDb();
    const entry = {
      id: crypto.randomUUID(),
      name: String(name).slice(0, 80),
      key: newGatewayKey(),
      createdAt: new Date().toISOString(),
      requests: 0,
      revoked: false,
    };
    db.keys.push(entry);
    saveDb(db);
    return sendJson(res, 200, entry, cors);
  }

  if (url.pathname === "/v1/keys" && req.method === "GET") {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
      return sendJson(res, 401, { error: "bad admin token" }, cors);
    }
    return sendJson(res, 200, { keys: loadDb().keys }, cors);
  }

  if (url.pathname.startsWith("/v1/keys/") && req.method === "DELETE") {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
      return sendJson(res, 401, { error: "bad admin token" }, cors);
    }
    const id = url.pathname.split("/").pop();
    const db = loadDb();
    const k = db.keys.find((x) => x.id === id);
    if (!k) return sendJson(res, 404, { error: "not found" }, cors);
    k.revoked = true;
    saveDb(db);
    return sendJson(res, 200, { ok: true, revoked: id }, cors);
  }

  // ---- OpenAI-compatible: models ----
  if (url.pathname === "/v1/models" && req.method === "GET") {
    const gk = bearerKey(req);
    const db = loadDb();
    if (!findKey(db, gk)) return sendJson(res, 401, { error: "invalid gateway key. Create one: POST /v1/keys with x-admin-token." }, cors);
    return sendJson(res, 200, {
      object: "list",
      data: [{ id: UPSTREAM_MODEL, object: "model", owned_by: "anthracite-org" }],
    }, cors);
  }

  // ---- OpenAI-compatible: chat completions (proxied) ----
  if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
    const gk = bearerKey(req);
    const db = loadDb();
    const keyEntry = findKey(db, gk);
    if (!keyEntry) return sendJson(res, 401, { error: "invalid gateway key (use Authorization: Bearer sk-free-...)" }, cors);

    let body;
    try { body = JSON.parse((await readBody(req)) || "{}"); }
    catch { return sendJson(res, 400, { error: "invalid JSON body" }, cors); }

    const model = body.model || UPSTREAM_MODEL;
    const stream = body.stream === true;

    // Mock mode: free unlimited testing without upstream billing
    if (!UPSTREAM_API_KEY && MOCK_WHEN_NO_KEY) {
      keyEntry.requests = (keyEntry.requests || 0) + 1;
      if (keyEntry.id !== "admin") saveDb(db);
      if (stream) {
        const reply = mockReply(model, body.messages).choices[0].message.content;
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
          ...cors,
        });
        const id = "chatcmpl-mock-" + Date.now();
        for (const chunk of reply.match(/[\s\S]{1,40}/g) || []) {
          res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      return sendJson(res, 200, mockReply(model, body.messages), cors);
    }

    if (!UPSTREAM_API_KEY) {
      return sendJson(res, 500, { error: "server has no UPSTREAM_API_KEY and MOCK_WHEN_NO_KEY=false. Set UPSTREAM_API_KEY or enable mock mode." }, cors);
    }

    // Forward to upstream (OpenAI-compatible)
    const upstreamBody = JSON.stringify({ ...body, model });
    try {
      const headers = {
        "content-type": "application/json",
        authorization: `Bearer ${UPSTREAM_API_KEY}`,
        "content-length": Buffer.byteLength(upstreamBody),
      };
      if (process.env.UPSTREAM_REFERER) headers["HTTP-Referer"] = process.env.UPSTREAM_REFERER;
      if (process.env.UPSTREAM_TITLE) headers["X-Title"] = process.env.UPSTREAM_TITLE;

      const upstreamRes = await fetch(`${UPSTREAM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers,
        body: upstreamBody,
      });

      keyEntry.requests = (keyEntry.requests || 0) + 1;
      if (keyEntry.id !== "admin") saveDb(db);

      res.writeHead(upstreamRes.status, {
        "content-type": upstreamRes.headers.get("content-type") || "application/json",
        ...cors,
      });
      if (stream || (upstreamRes.headers.get("content-type") || "").includes("event-stream")) {
        const reader = upstreamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      }
      const text = await upstreamRes.text();
      return res.end(text);
    } catch (e) {
      return sendJson(res, 502, { error: "upstream fetch failed: " + String(e?.message || e) }, cors);
    }
  }

  return sendJson(res, 404, {
    error: "not found",
    hint: "GET /health, GET /v1/models, POST /v1/chat/completions, POST /v1/keys",
  }, cors);
});

server.listen(PORT, () => {
  console.log(`\n  free-api running on http://localhost:${PORT}`);
  console.log(`  Website base URL: http://localhost:${PORT}/v1`);
  console.log(`  Model: ${UPSTREAM_MODEL} via ${UPSTREAM_BASE_URL}`);
  console.log(`  Mock mode (no upstream key): ${!UPSTREAM_API_KEY && MOCK_WHEN_NO_KEY}`);
  console.log(`  Create a key: curl -X POST http://localhost:${PORT}/v1/keys -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"name":"my-website"}'\n`);
});
