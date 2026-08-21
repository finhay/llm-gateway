---
name: llm-gateway-chat
description: Chat / code generation via LLM Gateway using OpenAI /v1/chat/completions or Anthropic /v1/messages format with streaming + auto-fallback combos. Use when the user wants to ask an LLM, generate code, summarize text, or run prompts through LLM Gateway.
---

# LLM Gateway — Chat

Requires `LLM_GATEWAY_URL` (and `LLM_GATEWAY_KEY` if auth enabled). See https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway/SKILL.md for setup.

## Endpoints

- `POST $LLM_GATEWAY_URL/v1/chat/completions` — OpenAI format
- `POST $LLM_GATEWAY_URL/v1/messages` — Anthropic format

## Discover

```bash
curl $LLM_GATEWAY_URL/v1/models | jq '.data[].id'
# Per-model metadata (contextWindow, params)
curl "$LLM_GATEWAY_URL/v1/models/info?id=openai/gpt-4o"
```

Combos (e.g. `vip`, `mycodex`) auto-fallback through multiple providers.

## OpenAI format

```bash
curl -X POST $LLM_GATEWAY_URL/v1/chat/completions \
  -H "Authorization: Bearer $LLM_GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-5","messages":[{"role":"user","content":"Hi"}],"stream":false}'
```

JS (OpenAI SDK):

```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: `${process.env.LLM_GATEWAY_URL}/v1`, apiKey: process.env.LLM_GATEWAY_KEY });
const res = await client.chat.completions.create({
  model: "openai/gpt-5",
  messages: [{ role: "user", content: "Hi" }],
  stream: true,
});
for await (const chunk of res) process.stdout.write(chunk.choices[0]?.delta?.content || "");
```

## Anthropic format

```bash
curl -X POST $LLM_GATEWAY_URL/v1/messages \
  -H "Authorization: Bearer $LLM_GATEWAY_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"cc/claude-opus-4-7","max_tokens":1024,"messages":[{"role":"user","content":"Hi"}]}'
```

## Response shape

OpenAI (`/v1/chat/completions`):
```json
{ "id": "chatcmpl-...", "object": "chat.completion", "model": "openai/gpt-5",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Hello!" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 8, "completion_tokens": 2, "total_tokens": 10 } }
```

Streaming (`stream:true`) emits SSE: `data: {choices:[{delta:{content:"..."}}]}\n\n` ... `data: [DONE]\n\n`.

Anthropic (`/v1/messages`):
```json
{ "id": "msg_...", "type": "message", "role": "assistant", "model": "cc/claude-opus-4-7",
  "content": [{ "type": "text", "text": "Hello!" }],
  "stop_reason": "end_turn", "usage": { "input_tokens": 8, "output_tokens": 2 } }
```
