---
name: llm-gateway
description: Entry point for LLM Gateway — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, embeddings, web search, web fetch. Use when the user mentions LLM Gateway, LLM_GATEWAY_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# LLM Gateway

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export LLM_GATEWAY_URL="http://localhost:20128"      # or VPS / tunnel URL
export LLM_GATEWAY_KEY="sk-..."                      # from Dashboard → Keys (only if requireApiKey=true)
```

All requests: `${LLM_GATEWAY_URL}/v1/...` with header `Authorization: Bearer ${LLM_GATEWAY_KEY}` (omit if auth disabled).

Verify: `curl $LLM_GATEWAY_URL/api/health` → `{"ok":true}`

## Discover models

```bash
curl $LLM_GATEWAY_URL/v1/models                  # chat/LLM (default)
curl $LLM_GATEWAY_URL/v1/models/image            # image-gen
curl $LLM_GATEWAY_URL/v1/models/tts              # text-to-speech
curl $LLM_GATEWAY_URL/v1/models/embedding        # embeddings
curl $LLM_GATEWAY_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $LLM_GATEWAY_URL/v1/models/stt              # speech-to-text
curl $LLM_GATEWAY_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

## Capability skills

When the user needs a specific capability, fetch that skill's `SKILL.md` from its raw URL:

| Capability | Raw URL |
|---|---|
| Chat / code-gen | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway-web-fetch/SKILL.md |

## Errors

- 401 → set/refresh `LLM_GATEWAY_KEY` (Dashboard → Keys)
- 400 `Invalid model format` → check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` → wait `retry-after` or add another provider account
