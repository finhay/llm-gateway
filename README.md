<div align="center">

# LLM Gateway

**A self-hosted AI routing gateway with smart fallback, token savings, and a management dashboard.**

**Connect all AI coding tools (Claude Code, Cursor, Codex, Copilot, Cline, OpenCode...) to 40+ providers and 100+ models through a single OpenAI-compatible endpoint.**

</div>

---

## Why LLM Gateway?

**Stop wasting money, tokens, and hitting limits:**

- Subscription quota expires unused every month
- Rate limits stop you mid-coding
- Tool outputs (`git diff`, `grep`, `ls`...) burn tokens fast
- Expensive APIs ($20–50/month per provider)
- Manual switching between providers

**LLM Gateway solves this:**

- **RTK Token Saver** — Auto-compress tool_result content, save 20–40% tokens per request
- **Smart 3-tier fallback** — Subscription → Cheap → Free, zero downtime
- **Multi-account** — Round-robin between accounts per provider
- **Universal** — Works with Claude Code, Codex, Cursor, Cline, any CLI tool
- **Internal team gateway** — Scoped API keys, audit trails, budgets, and policy controls

---

## How It Works

```
┌─────────────┐
│  Your CLI   │  (Claude Code, Codex, Cursor, Cline...)
│   Tool      │
└──────┬──────┘
       │ http://localhost:20128/v1
       ↓
┌─────────────────────────────────────────────┐
│           LLM Gateway (Smart Router)        │
│  • RTK Token Saver (cut tool_result tokens) │
│  • Format translation (OpenAI ↔ Claude)     │
│  • Quota tracking                           │
│  • Auto token refresh                       │
└──────┬──────────────────────────────────────┘
       │
       ├─→ [Tier 1: SUBSCRIPTION] Claude Code, Codex, GitHub Copilot
       │   ↓ quota exhausted
       ├─→ [Tier 2: CHEAP] GLM ($0.6/1M), MiniMax ($0.2/1M)
       │   ↓ budget limit
       └─→ [Tier 3: FREE] Kiro, OpenCode Free, Vertex ($300 credits)

Result: Never stop coding, minimal cost + 20-40% token savings via RTK
```

---

## Quick Start

Run from source:

```bash
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Production mode:

```bash
npm run build
PORT=20128 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run start
```

Default URLs:
- Dashboard: `http://localhost:20128/dashboard`
- OpenAI-compatible API: `http://localhost:20128/v1`

---

## Supported CLI Tools

LLM Gateway works seamlessly with all major AI coding tools:

<div align="center">
  <table>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/claude.png" width="60" alt="Claude Code"/><br/>
        <b>Claude Code</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/codex.png" width="60" alt="Codex"/><br/>
        <b>Codex</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/opencode.png" width="60" alt="OpenCode"/><br/>
        <b>OpenCode</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/cursor.png" width="60" alt="Cursor"/><br/>
        <b>Cursor</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/antigravity.png" width="60" alt="Antigravity"/><br/>
        <b>Antigravity</b>
      </td>
    </tr>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/cline.png" width="60" alt="Cline"/><br/>
        <b>Cline</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/continue.png" width="60" alt="Continue"/><br/>
        <b>Continue</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/droid.png" width="60" alt="Droid"/><br/>
        <b>Droid</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/roo.png" width="60" alt="Roo"/><br/>
        <b>Roo</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/copilot.png" width="60" alt="Copilot"/><br/>
        <b>Copilot</b>
      </td>
    </tr>
  </table>
</div>

---

## Supported Providers

### OAuth Providers

<div align="center">
  <table>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/claude.png" width="60" alt="Claude Code"/><br/>
        <b>Claude Code</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/antigravity.png" width="60" alt="Antigravity"/><br/>
        <b>Antigravity</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/codex.png" width="60" alt="Codex"/><br/>
        <b>Codex</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/github.png" width="60" alt="GitHub"/><br/>
        <b>GitHub</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/cursor.png" width="60" alt="Cursor"/><br/>
        <b>Cursor</b>
      </td>
    </tr>
  </table>
</div>

### Free Providers

<div align="center">
  <table>
    <tr>
      <td align="center" width="150">
        <img src="./public/providers/kiro.png" width="70" alt="Kiro"/><br/>
        <b>Kiro AI</b><br/>
        <sub>Claude 4.5 + GLM-5 + MiniMax<br/>Unlimited FREE</sub>
      </td>
      <td align="center" width="150">
        <img src="./public/providers/opencode.png" width="70" alt="OpenCode Free"/><br/>
        <b>OpenCode Free</b><br/>
        <sub>No auth • Auto-fetch models<br/>Unlimited FREE</sub>
      </td>
      <td align="center" width="150">
        <img src="./public/providers/gemini.png" width="70" alt="Vertex AI"/><br/>
        <b>Vertex AI</b><br/>
        <sub>Gemini 3 Pro + GLM-5 + DeepSeek<br/>$300 credits free</sub>
      </td>
    </tr>
  </table>
</div>

> **Note:** iFlow, Qwen and Gemini CLI free tiers were discontinued in 2026. Use Kiro / OpenCode Free / Vertex instead.

### API Key Providers (40+)

<div align="center">
  <table>
    <tr>
      <td align="center" width="100">
        <img src="./public/providers/openrouter.png" width="50" alt="OpenRouter"/><br/>
        <sub>OpenRouter</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/glm.png" width="50" alt="GLM"/><br/>
        <sub>GLM</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/kimi.png" width="50" alt="Kimi"/><br/>
        <sub>Kimi</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/minimax.png" width="50" alt="MiniMax"/><br/>
        <sub>MiniMax</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/openai.png" width="50" alt="OpenAI"/><br/>
        <sub>OpenAI</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/anthropic.png" width="50" alt="Anthropic"/><br/>
        <sub>Anthropic</sub>
      </td>
    </tr>
    <tr>
      <td align="center" width="100">
        <img src="./public/providers/gemini.png" width="50" alt="Gemini"/><br/>
        <sub>Gemini</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/deepseek.png" width="50" alt="DeepSeek"/><br/>
        <sub>DeepSeek</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/groq.png" width="50" alt="Groq"/><br/>
        <sub>Groq</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/xai.png" width="50" alt="xAI"/><br/>
        <sub>xAI</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/mistral.png" width="50" alt="Mistral"/><br/>
        <sub>Mistral</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/perplexity.png" width="50" alt="Perplexity"/><br/>
        <sub>Perplexity</sub>
      </td>
    </tr>
    <tr>
      <td align="center" width="100">
        <img src="./public/providers/together.png" width="50" alt="Together"/><br/>
        <sub>Together AI</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/fireworks.png" width="50" alt="Fireworks"/><br/>
        <sub>Fireworks</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/cerebras.png" width="50" alt="Cerebras"/><br/>
        <sub>Cerebras</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/cohere.png" width="50" alt="Cohere"/><br/>
        <sub>Cohere</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/nvidia.png" width="50" alt="NVIDIA"/><br/>
        <sub>NVIDIA</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/siliconflow.png" width="50" alt="SiliconFlow"/><br/>
        <sub>SiliconFlow</sub>
      </td>
    </tr>
  </table>
  <p><i>...and 20+ more providers including Nebius, Chutes, Hyperbolic, and custom OpenAI/Anthropic compatible endpoints</i></p>
</div>

---

## Key Features

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **RTK Token Saver** ([RTK](https://github.com/rtk-ai/rtk)) | Compress tool outputs (`git diff`, `grep`, `ls`, `tree`...) before sending to LLM | Save **20-40% input tokens** per request |
| **Caveman Mode** ([Caveman](https://github.com/JuliusBrussee/caveman)) | Inject caveman-speak prompt → LLM replies terse, technical substance preserved | Save **up to 65% output tokens** |
| **Smart 3-Tier Fallback** | Auto-route: Subscription → Cheap → Free | Never stop coding, zero downtime |
| **Real-Time Quota Tracking** | Live token count + reset countdown | Maximize subscription value |
| **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex | Works with any CLI tool |
| **Multi-Account Support** | Multiple accounts per provider | Load balancing + redundancy |
| **Auto Token Refresh** | OAuth tokens refresh automatically | No manual re-login needed |
| **Custom Combos** | Create unlimited model combinations | Tailor fallback to your needs |
| **Request Logging** | Debug mode with full request/response logs | Troubleshoot issues easily |
| **Cloud Sync** | Sync config across devices | Same setup everywhere |
| **Usage Analytics** | Track tokens, cost, trends over time | Optimize spending |
| **Deploy Anywhere** | Localhost, VPS, Docker | Flexible deployment options |
| **Scoped API Keys** | Per-key scopes, rate limits, budgets, provider allow lists | Internal team gateway control |
| **Audit Trails** | API key usage and admin event history | Compliance and observability |

<details>
<summary><b>Feature Details</b></summary>

### RTK Token Saver

Tool outputs (`git diff`, `grep`, `find`, `ls`, `tree`, log dumps...) often eat 30-50% of your prompt budget. RTK detects them and applies smart, lossless compression **before** the request hits the LLM:

- **Filters:** `git-diff`, `git-status`, `grep`, `find`, `ls`, `tree`, `dedup-log`, `smart-truncate`, `read-numbered`, `search-list`
- **Auto-detect:** No config needed — RTK peeks the first 1KB of each `tool_result` and picks the right filter.
- **Safe by design:** If a filter fails, throws, or makes output bigger, RTK silently keeps the original text. Errors never break your request.
- **Universal:** Works across all formats (OpenAI, Claude, Gemini, Cursor, Kiro, OpenAI Responses) because it runs **before** any format translation.
- **Default ON:** Toggle anytime in Dashboard → Endpoint settings.

```
Without RTK: 47K tokens sent to LLM
With RTK:    28K tokens sent to LLM   (40% saved · same context · same answer)
```

### Smart 3-Tier Fallback

Create combos with automatic fallback:

```
Combo: "my-coding-stack"
  1. cc/claude-opus-4-6        (your subscription)
  2. glm/glm-4.7               (cheap backup, $0.6/1M)
  3. kr/claude-sonnet-4.5      (free fallback)

→ Auto switches when quota runs out or errors occur
```

### Real-Time Quota Tracking

- Token consumption per provider
- Reset countdown (5-hour, daily, weekly)
- Cost estimation for paid tiers
- Monthly spending reports

### Format Translation

Seamless translation between formats:
- **OpenAI** ↔ **Claude** ↔ **Gemini** ↔ **Cursor** ↔ **Kiro** ↔ **Vertex** ↔ **Antigravity** ↔ **Ollama** ↔ **OpenAI Responses**
- Your CLI tool sends OpenAI format → Gateway translates → Provider receives native format
- Works with any tool that supports custom OpenAI endpoints

### Multi-Account Support

- Add multiple accounts per provider
- Auto round-robin or priority-based routing
- Fallback to next account when one hits quota

### Auto Token Refresh

- OAuth tokens automatically refresh before expiration
- No manual re-authentication needed
- Seamless experience across all providers

### Custom Combos

- Create unlimited model combinations
- Mix subscription, cheap, and free tiers
- Name your combos for easy access
- Share combos across devices with Cloud Sync

### Request Logging

- Enable debug mode for full request/response logs
- Track API calls, headers, and payloads
- Troubleshoot integration issues
- Export logs for analysis

### Cloud Sync

- Sync providers, combos, and settings across devices
- Automatic background sync
- Secure encrypted storage
- Access your setup from anywhere

#### Cloud Runtime Notes

- Prefer server-side cloud variables in production:
  - `BASE_URL` (internal callback URL used by sync scheduler)
  - `CLOUD_URL` (cloud sync endpoint base)
- `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_CLOUD_URL` are still supported for compatibility/UI, but server runtime now prioritizes `BASE_URL`/`CLOUD_URL`.
- Cloud sync requests now use timeout + fail-fast behavior to avoid UI hanging when cloud DNS/network is unavailable.

### Usage Analytics

- Track token usage per provider and model
- Cost estimation and spending trends
- Monthly reports and insights
- Optimize your AI spending

> **Important — Understanding Dashboard Costs:**
>
> The "cost" displayed in Usage Analytics is **for tracking and comparison purposes only**.
> The gateway itself **never charges** you anything. You only pay providers directly (if using paid services).
>
> Think of it as a "savings tracker" showing how much you're saving by using free models or
> routing through the gateway.

### Deploy Anywhere

- **Localhost** — Default, works offline
- **VPS/Cloud** — Share across devices
- **Docker** — One-command deployment

### Scoped API Keys and Internal Gateway

When deployed for a team, the gateway separates into two planes:

- **Data plane:** OpenAI/Anthropic-compatible API routes used by Claude Code, Cursor, Codex, CI jobs, and internal bots. Runtime identity comes from scoped gateway API keys.
- **Control plane:** Admin-only dashboard used by IT/Platform/Security to configure providers, issue/revoke keys, assign ownership metadata, enforce policies, manage budgets, and review audit/usage data.

Gateway API keys support: owner metadata, team/project/environment fields, scopes (`chat:write`, `models:read`, etc.), provider allow lists, per-key rate limits (RPM/RPD), budget limits and periods, expiry, and revocation. Keys are one-time reveal credentials stored as HMAC hashes — copy the raw value immediately at creation or rotation.

</details>

---

## Pricing at a Glance

| Tier | Provider | Cost | Quota Reset | Best For |
|------|----------|------|-------------|----------|
| **TOKEN SAVER** | **RTK (built-in)** | **FREE** | Always on | **Save 20-40% tokens on EVERY request** |
| **SUBSCRIPTION** | Claude Code (Pro/Max) | $20-200/mo | 5h + weekly | Already subscribed |
| | Codex (Plus/Pro) | $20-200/mo | 5h + weekly | OpenAI users |
| | GitHub Copilot | $10-19/mo | Monthly | GitHub users |
| | Cursor IDE | $20/mo | Monthly | Cursor users |
| **CHEAP** | GLM-5.1 / GLM-4.7 | $0.6/1M | Daily 10AM | Budget backup |
| | MiniMax M2.7 | $0.2/1M | 5-hour rolling | Cheapest option |
| | Kimi K2.5 | $9/mo flat | 10M tokens/mo | Predictable cost |
| **FREE** | Kiro AI | $0 | Unlimited | Claude 4.5 + GLM-5 + MiniMax free |
| | OpenCode Free | $0 | Unlimited | No auth, auto-fetch models |
| | Vertex AI | $300 credits | New GCP accounts | Gemini 3 Pro + DeepSeek + GLM-5 |

---

## Use Cases

### Case 1: "I have Claude Pro subscription"

**Problem:** Quota expires unused, rate limits during heavy coding

**Solution:**
```
Combo: "maximize-claude"
  1. cc/claude-opus-4-7        (use subscription fully)
  2. glm/glm-5.1               (cheap backup when quota out)
  3. kr/claude-sonnet-4.5      (free emergency fallback)

Monthly cost: $20 (subscription) + ~$5 (backup) = $25 total
vs. $20 + hitting limits = frustration
```

### Case 2: "I want zero cost"

**Problem:** Can't afford subscriptions, need reliable AI coding

**Solution:**
```
Combo: "free-forever"
  1. kr/claude-sonnet-4.5      (Claude 4.5 free unlimited)
  2. kr/glm-5                  (GLM-5 free via Kiro)
  3. oc/<auto>                 (OpenCode Free, no auth)

Monthly cost: $0
Quality: Production-ready models + RTK saves 20-40% tokens
```

### Case 3: "I need 24/7 coding, no interruptions"

**Problem:** Deadlines, can't afford downtime

**Solution:**
```
Combo: "always-on"
  1. cc/claude-opus-4-7        (best quality)
  2. cx/gpt-5.5                (second subscription)
  3. glm/glm-5.1               (cheap, resets daily)
  4. minimax/MiniMax-M2.7      (cheapest, 5h reset)
  5. kr/claude-sonnet-4.5      (free unlimited)

Result: 5 layers of fallback = zero downtime
```

### Case 4: "Internal team gateway"

**Problem:** Need to centrally manage AI access for a team with budgets, audit, and key rotation

**Solution:**
```
Deploy on VPS/Docker → Admin creates scoped gateway API keys per team/project
→ Developers use their key with Claude Code/Cursor/etc.
→ Dashboard shows usage, costs, and audit events per key
→ Admin revokes or rotates keys without touching developer configs
```

---

## Frequently Asked Questions

<details>
<summary><b>Why does my dashboard show high costs?</b></summary>

The dashboard tracks your token usage and displays **estimated costs** as if you were using paid APIs directly. This is **not actual billing** — it's a reference to show how much you're saving by using free models or existing subscriptions.

The cost display is a "savings tracker" to help you understand your usage patterns and optimization opportunities.

</details>

<details>
<summary><b>Will I be charged by the gateway?</b></summary>

**No.** This gateway is open-source software that runs on your own infrastructure. It never charges you anything.

**You only pay:**
- **Subscription providers** (Claude Code $20/mo, Codex $20-200/mo) → Pay them directly on their websites
- **Cheap providers** (GLM, MiniMax) → Pay them directly, the gateway just routes your requests
- **The gateway itself** → **Never charges anything, ever**

</details>

<details>
<summary><b>Are FREE providers really unlimited?</b></summary>

**Yes!** The current FREE providers (Kiro, OpenCode Free, Vertex) are genuinely free with **no hidden charges**.

- **Kiro AI**: Free unlimited Claude 4.5 + GLM-5 + MiniMax via AWS Builder ID / Google / GitHub OAuth
- **OpenCode Free**: No-auth passthrough proxy, models auto-fetched from `opencode.ai/zen/v1/models`
- **Vertex AI**: $300 free credits for new Google Cloud accounts (90 days)

**Discontinued free tiers (no longer recommended):**
- **iFlow**: Was free unlimited, now changed to paid (2026)
- **Qwen Code**: Free OAuth tier discontinued by Alibaba on 2026-04-15
- **Gemini CLI**: Still works, but using it with non-CLI tools may result in account bans — only use if you stick to Gemini CLI itself

</details>

<details>
<summary><b>What if my usage suddenly spikes?</b></summary>

The gateway's smart fallback prevents surprise charges:

**Without the gateway:**
- Hit rate limit → Work stops → Frustration
- Or: Accidentally rack up huge API bills

**With the gateway:**
- Subscription hits limit → Auto-fallback to cheap tier
- Cheap tier gets expensive → Auto-fallback to free tier
- Never stop coding → Predictable costs

**You're in control:** Set spending limits per provider in dashboard, and the gateway respects them.

</details>

---

## Setup Guide

<details>
<summary><b>Subscription Providers (Maximize Value)</b></summary>

### Claude Code (Pro/Max)

```bash
Dashboard → Providers → Connect Claude Code
→ OAuth login → Auto token refresh
→ 5-hour + weekly quota tracking

Models:
  cc/claude-opus-4-7
  cc/claude-opus-4-6
  cc/claude-sonnet-4-6
  cc/claude-haiku-4-5-20251001
```

### OpenAI Codex (Plus/Pro)

```bash
Dashboard → Providers → Connect Codex
→ OAuth login (port 1455)
→ 5-hour + weekly reset

Models:
  cx/gpt-5.5
  cx/gpt-5.4
  cx/gpt-5.3-codex
  cx/gpt-5.2-codex
```

### GitHub Copilot

```bash
Dashboard → Providers → Connect GitHub
→ OAuth via GitHub
→ Monthly reset (1st of month)

Models:
  gh/gpt-5.4
  gh/claude-opus-4.7
  gh/claude-sonnet-4.6
  gh/gemini-3.1-pro-preview
  gh/grok-code-fast-1
```

### Cursor IDE

```bash
Dashboard → Providers → Connect Cursor
→ OAuth login
→ Monthly subscription

Models:
  cu/claude-4.6-opus-max
  cu/claude-4.5-sonnet-thinking
  cu/gpt-5.3-codex
```

</details>

<details>
<summary><b>Cheap Providers (Backup)</b></summary>

### GLM-5.1 / GLM-4.7 (Daily reset, $0.6/1M)

1. Sign up: [Zhipu AI](https://open.bigmodel.cn/)
2. Get API key from Coding Plan
3. Dashboard → Add API Key:
   - Provider: `glm`
   - API Key: `your-key`

**Use:** `glm/glm-5.1`, `glm/glm-5`, `glm/glm-4.7`

**Pro Tip:** Coding Plan offers 3× quota at 1/7 cost! Reset daily 10:00 AM.

### MiniMax M2.7 (5h reset, $0.20/1M)

1. Sign up: [MiniMax](https://www.minimax.io/)
2. Get API key
3. Dashboard → Add API Key

**Use:** `minimax/MiniMax-M2.7`, `minimax/MiniMax-M2.5`

### Kimi K2.5 ($9/month flat)

1. Subscribe: [Moonshot AI](https://platform.moonshot.ai/)
2. Get API key
3. Dashboard → Add API Key

**Use:** `kimi/kimi-k2.5`, `kimi/kimi-k2.5-thinking`

</details>

<details>
<summary><b>FREE Providers (Recommended)</b></summary>

### Kiro AI (Claude 4.5 + GLM-5 + MiniMax FREE)

```bash
Dashboard → Connect Kiro
→ AWS Builder ID, AWS IAM Identity Center, Google, or GitHub
→ Unlimited usage

Models:
  kr/claude-sonnet-4.5
  kr/claude-haiku-4.5
  kr/glm-5
  kr/MiniMax-M2.5
  kr/qwen3-coder-next
  kr/deepseek-3.2
```

### OpenCode Free (No auth, auto-fetch models)

```bash
Dashboard → Connect OpenCode Free
→ No login required (passthrough proxy)
→ Models auto-fetched from opencode.ai/zen/v1/models
```

### Vertex AI ($300 free credits for new GCP accounts)

```bash
Dashboard → Connect Vertex AI
→ Upload Google Cloud Service Account JSON
→ Enable Vertex AI API in your GCP project

Models:
  vertex/gemini-3.1-pro-preview
  vertex/gemini-3-flash-preview
  vertex/gemini-2.5-flash

Vertex Partner (Anthropic / DeepSeek / GLM / Qwen via Vertex):
  vertex-partner/glm-5-maas
  vertex-partner/deepseek-v3.2-maas
  vertex-partner/qwen3-next-80b-a3b-thinking-maas
```

</details>

<details>
<summary><b>Create Combos</b></summary>

### Example 1: Maximize Subscription → Cheap Backup

```
Dashboard → Combos → Create New

Name: premium-coding
Models:
  1. cc/claude-opus-4-7 (Subscription primary)
  2. glm/glm-5.1 (Cheap backup, $0.6/1M)
  3. minimax/MiniMax-M2.7 (Cheapest fallback, $0.20/1M)

Use in CLI: premium-coding
```

### Example 2: Free-Only (Zero Cost)

```
Name: free-combo
Models:
  1. kr/claude-sonnet-4.5 (Claude 4.5 free unlimited)
  2. kr/glm-5 (GLM-5 free via Kiro)
  3. vertex/gemini-3.1-pro-preview ($300 free credits)

Cost: $0 forever (+ 20-40% token savings via RTK)
```

</details>

<details>
<summary><b>CLI Integration</b></summary>

### Gateway API Keys

Create or rotate keys from `Dashboard → Endpoint → API Keys`. Keys are shown once when created or rotated; copy the raw value immediately. Existing keys can be revoked, scoped, rate-limited, and budgeted, but their raw secret cannot be recovered later.

### Claude Code

Edit `~/.claude/config.json`:

```json
{
  "anthropic_api_base": "http://localhost:20128/v1",
  "anthropic_api_key": "your-gateway-api-key"
}
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:20128"
export OPENAI_API_KEY="your-gateway-api-key"

codex "your prompt"
```

### Cursor IDE

```
Settings → Models → Advanced:
  OpenAI API Base URL: http://localhost:20128/v1
  OpenAI API Key: [from dashboard]
  Model: cc/claude-opus-4-7
```

### Cline / Continue / RooCode

```
Provider: OpenAI Compatible
Base URL: http://localhost:20128/v1
API Key: [from dashboard]
Model: cc/claude-opus-4-7
```

</details>

<details>
<summary><b>Deployment</b></summary>

### VPS Deployment

```bash
# Clone and install
git clone <this-repo>
cd llm-gateway
npm install
npm run build

# Configure
export JWT_SECRET="your-secure-secret-change-this"
export INITIAL_PASSWORD="your-password"
export DATA_DIR="/var/lib/llm-gateway"
export PORT="20128"
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"
export NEXT_PUBLIC_BASE_URL="http://localhost:20128"
export API_KEY_SECRET="endpoint-proxy-api-key-secret"
export MACHINE_ID_SALT="endpoint-proxy-salt"

# Start
npm run start

# Or use PM2
npm install -g pm2
pm2 start npm --name llm-gateway -- start
pm2 save
pm2 startup
```

### Docker

See [DOCKER.md](./DOCKER.md) for full Docker instructions.

```bash
docker build -t llm-gateway .
docker run -d \
  --name llm-gateway \
  -p 20128:20128 \
  -v "$HOME/.llm-gateway:/app/data" \
  -e DATA_DIR=/app/data \
  llm-gateway
```

→ Open http://localhost:20128

**Container defaults:**
- `PORT=20128`
- `HOSTNAME=0.0.0.0`

**Useful commands:**

```bash
docker logs -f llm-gateway
docker restart llm-gateway
docker stop llm-gateway && docker rm llm-gateway
```

**Data persistence:** `$HOME/.llm-gateway/db/data.sqlite` on host ↔ `/app/data/db/data.sqlite` in container.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated | JWT signing secret for dashboard auth cookie |
| `INITIAL_PASSWORD` | `123456` | First login password when no saved hash exists |
| `DATA_DIR` | `~/.llm-gateway` | Main app data location (SQLite at `$DATA_DIR/db/data.sqlite`) |
| `PORT` | framework default | Service port (`20128` in examples) |
| `HOSTNAME` | framework default | Bind host (Docker defaults to `0.0.0.0`) |
| `NODE_ENV` | runtime default | Set `production` for deploy |
| `BASE_URL` | `http://localhost:20128` | Server-side internal base URL used by cloud sync jobs |
| `CLOUD_URL` | cloud sync endpoint | Server-side cloud sync endpoint base URL |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | Backward-compatible/public base URL |
| `NEXT_PUBLIC_CLOUD_URL` | cloud sync endpoint | Backward-compatible/public cloud URL |
| `API_KEY_SECRET` | `endpoint-proxy-api-key-secret` | HMAC secret for generated API key format |
| `API_KEY_HASH_SECRET` | falls back to `API_KEY_SECRET` | Optional separate HMAC secret for API key lookup hashes |
| `MACHINE_ID_SALT` | `endpoint-proxy-salt` | Salt for stable machine ID hashing |
| `ENABLE_REQUEST_LOGS` | `false` | Enables request/response logs under `logs/` |
| `REQUEST_LOG_DIR` | `<working directory>/logs` | Directory for detailed request/response logs |
| `REQUEST_LOG_MAX_TOTAL_MB` | `256` | Hard limit for all detailed request logs |
| `REQUEST_LOG_MAX_SESSION_MB` | `20` | Hard limit for one request's complete log session |
| `REQUEST_LOG_MAX_FILE_MB` | `5` | Hard limit for each detailed request-log file |
| `REQUEST_LOG_RETENTION_DAYS` | `7` | Delete detailed request logs older than this (`0` deletes all on prune) |
| `AUTH_COOKIE_SECURE` | `false` | Force `Secure` auth cookie (set `true` behind HTTPS) |
| `REQUIRE_API_KEY` | `false` | Enforce Bearer API key on `/v1/*` routes |
| `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` | empty | Optional outbound proxy for upstream provider calls |

Notes:
- Gateway API keys are one-time reveal credentials. Copy the key when creating or rotating it; later APIs show only a safe prefix.
- API keys are stored as keyed hashes in SQLite and can carry scopes, owner metadata, expiry, revocation state, allowed provider restrictions, per-key rate limits, and budget fields.
- When `REQUIRE_API_KEY=true`, `/v1/*`, `/v1beta/*`, model listing, token counting, and cloud sync routes require a valid gateway key.
- Common scopes include `chat:write`, `embeddings:write`, `models:read`, `tokens:count`, `cloud:sync`, `keys:read`, `keys:write`, `admin:*`, and `*`.
- Lowercase proxy variables are also supported: `http_proxy`, `https_proxy`, `all_proxy`, `no_proxy`.

### Runtime Files and Storage

- Main app state: `${DATA_DIR}/db/data.sqlite` (SQLite — providers, combos, aliases, keys, settings, usage history)
- Auto backups: `${DATA_DIR}/db/backups/`
- Optional request/translator logs: `<repo>/logs/...` when `ENABLE_REQUEST_LOGS=true`; credentials are redacted and the directory is bounded by the `REQUEST_LOG_*` retention and size limits.

</details>

---

## Available Models

<details>
<summary><b>View all available models</b></summary>

**Claude Code (`cc/`)** - Pro/Max:
- `cc/claude-opus-4-7`
- `cc/claude-opus-4-6`
- `cc/claude-sonnet-4-6`
- `cc/claude-sonnet-4-5-20250929`
- `cc/claude-haiku-4-5-20251001`

**Codex (`cx/`)** - Plus/Pro:
- `cx/gpt-5.5`
- `cx/gpt-5.4`
- `cx/gpt-5.3-codex`
- `cx/gpt-5.2-codex`
- `cx/gpt-5.1-codex-max`

**GitHub Copilot (`gh/`)**:
- `gh/gpt-5.4`
- `gh/claude-opus-4.7`
- `gh/claude-sonnet-4.6`
- `gh/gemini-3.1-pro-preview`
- `gh/grok-code-fast-1`

**Cursor (`cu/`)** - Subscription:
- `cu/claude-4.6-opus-max`
- `cu/claude-4.5-sonnet-thinking`
- `cu/gpt-5.3-codex`
- `cu/kimi-k2.5`

**GLM (`glm/`)** - $0.6/1M:
- `glm/glm-5.1`
- `glm/glm-5`
- `glm/glm-4.7`

**MiniMax (`minimax/`)** - $0.2/1M:
- `minimax/MiniMax-M2.7`
- `minimax/MiniMax-M2.5`

**Kimi (`kimi/`)** - $9/mo flat:
- `kimi/kimi-k2.5`
- `kimi/kimi-k2.5-thinking`

**Kiro (`kr/`)** - FREE unlimited:
- `kr/claude-sonnet-4.5`
- `kr/claude-haiku-4.5`
- `kr/glm-5`
- `kr/MiniMax-M2.5`
- `kr/qwen3-coder-next`
- `kr/deepseek-3.2`

**OpenCode Free (`oc/`)** - FREE no-auth:
- Auto-fetched from `opencode.ai/zen/v1/models`

**Vertex AI (`vertex/`)** - $300 free credits:
- `vertex/gemini-3.1-pro-preview`
- `vertex/gemini-3-flash-preview`
- `vertex/gemini-2.5-flash`
- `vertex-partner/glm-5-maas`
- `vertex-partner/deepseek-v3.2-maas`

</details>

---

## Troubleshooting

**"Language model did not provide messages"**
- Provider quota exhausted → Check dashboard quota tracker
- Solution: Use combo fallback or switch to cheaper tier

**Rate limiting**
- Subscription quota out → Fallback to GLM/MiniMax
- Add combo: `cc/claude-opus-4-7 → glm/glm-5.1 → kr/claude-sonnet-4.5`

**OAuth token expired**
- Auto-refreshed by the gateway
- If issues persist: Dashboard → Provider → Reconnect

**High costs**
- Enable RTK in Dashboard → Endpoint settings (default ON, saves 20-40% tokens)
- Switch primary model to GLM/MiniMax
- Use free tier (Kiro, OpenCode Free, Vertex) for non-critical tasks

**Dashboard opens on wrong port**
- Set `PORT=20128` and `NEXT_PUBLIC_BASE_URL=http://localhost:20128`

**First login not working**
- Check `INITIAL_PASSWORD` in `.env`
- If unset, fallback password is `123456`

**No request logs under `logs/`**
- Set `ENABLE_REQUEST_LOGS=true`

---

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16
- **UI**: React 19 + Tailwind CSS 4
- **Database**: SQLite (better-sqlite3 / node:sqlite / sql.js fallback)
- **Streaming**: Server-Sent Events (SSE)
- **Auth**: OAuth 2.0 (PKCE) + JWT + API Keys

---

## API Reference

### Chat Completions

```bash
POST http://localhost:20128/v1/chat/completions
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "model": "cc/claude-opus-4-6",
  "messages": [
    {"role": "user", "content": "Write a function to..."}
  ],
  "stream": true
}
```

### List Models

```bash
GET http://localhost:20128/v1/models
Authorization: Bearer your-api-key

→ Returns all models + combos in OpenAI format
```

---

## Acknowledgments

Built on the shoulders of giants:

- **[9Router](https://github.com/decolua/9router)** — This project is forked from 9Router, the original AI routing gateway that inspired this work. Credit and gratitude to the 9Router team and contributors.
- **[RTK](https://github.com/rtk-ai/rtk)** ![Stars](https://img.shields.io/github/stars/rtk-ai/rtk?style=flat&color=yellow) — Rust token-saver. Ports its compression pipeline to JS → **−20-40% input tokens** on every request.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** ![Stars](https://img.shields.io/github/stars/JuliusBrussee/caveman?style=flat&color=yellow) by **[@JuliusBrussee](https://github.com/JuliusBrussee)** — *"why use many token when few token do trick"*. Adapts its prompt → **−65% output tokens**.
- **CLIProxyAPI** — original Go implementation that inspired the JavaScript port.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built for developers who code 24/7</sub>
</div>
