# Magnum v4 72B — Free API Key Portal

Issues **your own** free API keys (`mk-...`) for **your own gateway**.
Model slug: `anthracite-org/magnum-v4-72b`.

This does NOT create real OpenRouter / Anthropic / OpenAI keys.
For live model calls, bring your own upstream key from a free tier:

- OpenRouter: https://openrouter.ai/anthracite-org/magnum-v4-72b → dashboard → create `sk-or-...` key
- Hugging Face: https://huggingface.co/anthracite-org/magnum-v4-72b → Inference API with HF token
- Puter.js: https://developer.puter.com/ai/anthracite-org/magnum-v4-72b/ → user-pays, free for devs

## Run (free demo, no upstream needed)

```bash
PORT=3002 node server.js
# open http://localhost:3002
```

## Run (live via OpenRouter)

```bash
OPENROUTER_API_KEY=sk-or-... PORT=3002 node server.js
```

## API

```bash
# create free key
curl -X POST http://localhost:3002/api/keys -H 'Content-Type: application/json' -d '{"name":"my-app"}'

# chat (OpenAI-compatible)
curl http://localhost:3002/v1/chat/completions \
 -H 'Content-Type: application/json' \
 -H 'Authorization: Bearer mk-...' \
 -d '{"model":"anthracite-org/magnum-v4-72b","messages":[{"role":"user","content":"Hello"}]}'
```

Keys have a demo quota (50k tokens) tracked in `data/keys.json`.
