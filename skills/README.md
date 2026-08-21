# LLM Gateway — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use LLM Gateway for you.

> Tip: start with the **llm-gateway** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway-web-fetch/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, …):

```
Read this skill and use it: https://raw.githubusercontent.com/finhay/llm-gateway/refs/heads/master/skills/llm-gateway/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, etc.

## Configure your shell once

```bash
export LLM_GATEWAY_URL="http://localhost:20128"   # local default, or your VPS / tunnel URL
export LLM_GATEWAY_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl $LLM_GATEWAY_URL/api/health` → `{"ok":true}`.

## Links

- Source: https://github.com/finhay/llm-gateway
- Dashboard: https://llm-gateway.com
