# free-api

Your own gateway that issues **free API keys** and exposes a **website-ready OpenAI-compatible URL** for `anthracite-org/magnum-v4-72b`.

## What this is / isn't

- ✅ You get: free keys YOU create (`sk-free-...`), unlimited calls to YOUR gateway, one URL (`http://localhost:8787/v1`) usable from any website with `fetch`.
- ❌ No one hosts magnum-v4-72b (72B params) free+unlimited. Hosted inference costs money (e.g. OpenRouter ~$2.50 in / $5 out per 1M tokens). Anyone claiming otherwise is reselling someone's paid key.
- ✅ Two honest paths to "free":
  1. **Mock mode (default, no key needed):** test keys + website code free, unlimited. Replies are labeled `[MOCK]`, not the real model.
  2. **Local Ollama (truly free + unlimited + private):** run a magnum quant on your machine, point `UPSTREAM_BASE_URL=http://localhost:11434/v1`. 72B needs serious RAM/VRAM — use a smaller quant if needed.
- ✅ Hosted path: add YOUR OpenRouter/HF key as `UPSTREAM_API_KEY`. You pay the provider, gateway adds $0.

## Quick start

```bash
cd free-api
cp .env.example .env   # then edit ADMIN_TOKEN
node server.js          # needs Node 18+
# open http://localhost:8787
```

Create a key:

```bash
curl -X POST http://localhost:8787/v1/keys \
  -H "x-admin-token: change-me-admin-token" \
  -H "content-type: application/json" \
  -d '{"name":"my-website"}'
# -> { "key": "sk-free-...", ... }
```

Use from any website (JS):

```js
const BASE = "http://localhost:8787/v1";
const KEY = "sk-free-PASTE-YOURS";
const r = await fetch(BASE + "/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
  body: JSON.stringify({
    model: "anthracite-org/magnum-v4-72b",
    messages: [{ role: "user", content: "Hello!" }]
  })
});
console.log((await r.json()).choices[0].message.content);
```

Python:

```python
import urllib.request, json
BASE="http://localhost:8787/v1"; KEY="sk-free-PASTE-YOURS"
req=urllib.request.Request(BASE+"/chat/completions",
  data=json.dumps({"model":"anthracite-org/magnum-v4-72b",
    "messages":[{"role":"user","content":"Hello!"}]}).encode(),
  headers={"content-type":"application/json","authorization":"Bearer "+KEY})
print(json.load(urllib.request.urlopen(req))["choices"][0]["message"]["content"])
```

## Endpoints

- `GET /` — web UI (create keys, test, copy snippet)
- `GET /health` — config check
- `POST /v1/keys` (header `x-admin-token`) — create `sk-free-...` key
- `GET /v1/keys` (admin) — list keys + usage
- `DELETE /v1/keys/:id` (admin) — revoke
- `GET /v1/models` (gateway key) — OpenAI-compatible
- `POST /v1/chat/completions` (gateway key) — OpenAI-compatible incl. `stream:true`

Deploy: run `node server.js` anywhere (VPS, Render, Fly, etc.), set `PORT` + `ADMIN_TOKEN` + upstream vars, then your website uses `https://your-host/v1` + your `sk-free-...` key. Put the gateway key in your backend, not public JS, if you want to prevent abuse.
