---
name: llm-gateway-web-fetch
description: Fetch URL → markdown / text / HTML via LLM Gateway /v1/web/fetch using Firecrawl / Jina Reader / Tavily Extract / Exa Contents. Use when the user wants to scrape a webpage, extract URL content, read article, or convert a URL to markdown.
---

# LLM Gateway — Web Fetch

Requires `LLM_GATEWAY_URL` (and `LLM_GATEWAY_KEY` if auth enabled). See https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/llm-gateway/SKILL.md for setup.

## Discover

```bash
curl $LLM_GATEWAY_URL/v1/models/web | jq '.data[] | select(.kind=="webFetch") | .id'
# Per-provider params
curl "$LLM_GATEWAY_URL/v1/models/info?id=firecrawl/fetch"
```

IDs end in `/fetch` (e.g. `firecrawl/fetch`, `jina/fetch`). `fetch-combo` chains providers with auto-fallback.

## Endpoint

`POST $LLM_GATEWAY_URL/v1/web/fetch`

| Field | Required | Notes |
|---|---|---|
| `model` (or `provider`) | yes | from `/v1/models/web` (`firecrawl/fetch` or `firecrawl`) |
| `url` | yes | URL to extract |
| `format` | no | `markdown` (default) / `text` / `html` |
| `max_characters` | no | truncate output |

## Examples

```bash
curl -X POST $LLM_GATEWAY_URL/v1/web/fetch \
  -H "Authorization: Bearer $LLM_GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"jina/fetch","url":"https://llm-gateway.com","format":"markdown"}'
```

JS:

```js
const r = await fetch(`${process.env.LLM_GATEWAY_URL}/v1/web/fetch`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.LLM_GATEWAY_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "fetch-combo", url: "https://example.com", format: "markdown", max_characters: 5000 }),
});
const { data } = await r.json();
console.log(data.title, data.content.length);
```

## Response shape

```json
{
  "provider": "jina-reader",
  "url": "...",
  "title": "...",
  "content": { "format": "markdown", "text": "...", "length": 1234 },
  "metadata": { "author": null, "published_at": null, "language": null },
  "usage": { "fetch_cost_usd": 0 },
  "metrics": { "response_time_ms": 850, "upstream_latency_ms": 700 }
}
```

## Provider quirks

| Provider | Auth | Best for |
|---|---|---|
| `firecrawl` | Bearer | JS-rendered pages, `format=markdown/html` |
| `jina-reader` | Bearer (optional) | Free tier (~1M chars/mo); fastest plain markdown |
| `tavily` | Bearer | Bulk extract; returns `raw_content` |
| `exa` | `x-api-key` | Pre-indexed pages; fast text extraction |
