"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CLI_TOOLS } from "@/shared/constants/cliTools";

const COWORK_PROFILE_ID = "00000000-0000-4000-8000-000000000001";

const ensureV1 = (value) => {
  const url = (value || "").replace(/\/+$/, "");
  return url.endsWith("/v1") ? url : `${url}/v1`;
};

const json = (value) => JSON.stringify(value, null, 2);

function defaultModelFor(tool) {
  return tool.defaultModels?.[0]?.defaultValue || tool.defaultModels?.[0]?.id || "";
}

function buildFiles(toolId, endpoint, apiKey, model) {
  const safeModel = model || "provider/model-id";
  switch (toolId) {
    case "claude":
      return [{
        posix: ".claude/settings.json",
        windows: ".claude\\settings.json",
        content: json({
          hasCompletedOnboarding: true,
          env: {
            ANTHROPIC_BASE_URL: endpoint,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_MODEL: safeModel,
          },
        }),
      }];
    case "codex":
      return [
        {
          posix: ".codex/config.toml",
          windows: ".codex\\config.toml",
          content: `model = ${JSON.stringify(safeModel)}\nmodel_provider = "llm-gateway"\n\n[model_providers.llm-gateway]\nname = "LLM Gateway"\nbase_url = ${JSON.stringify(endpoint)}\nwire_api = "responses"\n`,
        },
        {
          posix: ".codex/auth.json",
          windows: ".codex\\auth.json",
          content: json({ auth_mode: "apikey", OPENAI_API_KEY: apiKey }),
        },
      ];
    case "opencode":
      return [{
        posix: ".config/opencode/opencode.json",
        windows: ".config\\opencode\\opencode.json",
        content: json({
          provider: {
            "llm-gateway": {
              npm: "@ai-sdk/openai-compatible",
              options: { baseURL: endpoint, apiKey },
              models: { [safeModel]: { name: safeModel } },
            },
          },
          model: `llm-gateway/${safeModel}`,
        }),
      }];
    case "cowork": {
      const content = json({
        inferenceProvider: "gateway",
        inferenceGatewayBaseUrl: endpoint,
        inferenceGatewayApiKey: apiKey,
        inferenceModels: [{ name: safeModel }],
      });
      return [
        {
          posix: `Library/Application Support/Claude-3p/configLibrary/${COWORK_PROFILE_ID}.json`,
          linux: `.config/Claude-3p/configLibrary/${COWORK_PROFILE_ID}.json`,
          windows: `AppData\\Local\\Claude-3p\\configLibrary\\${COWORK_PROFILE_ID}.json`,
          content,
        },
        {
          posix: "Library/Application Support/Claude-3p/configLibrary/_meta.json",
          linux: ".config/Claude-3p/configLibrary/_meta.json",
          windows: "AppData\\Local\\Claude-3p\\configLibrary\\_meta.json",
          content: json({ appliedId: COWORK_PROFILE_ID, entries: [{ id: COWORK_PROFILE_ID, name: "Organization Gateway" }] }),
        },
      ];
    }
    case "qwen":
      return [{
        posix: ".qwen/settings.json",
        windows: ".qwen\\settings.json",
        content: json({ security: { auth: { selectedType: "openai", apiKey, baseUrl: endpoint } }, model: { name: safeModel } }),
      }];
    case "deepseek-tui":
      return [{
        posix: ".deepseek/config.toml",
        windows: ".deepseek\\config.toml",
        content: `[provider]\ntype = "openai"\nbase_url = ${JSON.stringify(endpoint)}\napi_key = ${JSON.stringify(apiKey)}\nmodel = ${JSON.stringify(safeModel)}\n`,
      }];
    default:
      return [];
  }
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary);
}

function unixInstaller(tool, files, platform) {
  const writes = files.map((file) => {
    const encoded = toBase64(file.content);
    const relativePath = platform === "linux" ? (file.linux || file.posix) : file.posix;
    return `target="$HOME/${relativePath}"\nmkdir -p "$(dirname "$target")"\nif [ -f "$target" ]; then cp "$target" "$target.llm-gateway.bak"; fi\nprintf '%s' '${encoded}' | base64 --decode > "$target" 2>/dev/null || printf '%s' '${encoded}' | base64 -D > "$target"\nprintf 'Configured %s\\n' "$target"`;
  }).join("\n\n");
  return `#!/bin/sh\nset -eu\n\n# Generated locally by the LLM Gateway setup page.\n${writes}\n\nprintf '\\n${tool.name} is configured. Restart the tool before using it.\\n'\n`;
}

function windowsInstaller(tool, files) {
  const writes = files.map((file) => {
    const encoded = toBase64(file.content);
    return `$target = Join-Path $HOME '${file.windows.replaceAll("'", "''")}'\nNew-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null\nif (Test-Path $target) { Copy-Item $target "$target.llm-gateway.bak" -Force }\n[IO.File]::WriteAllBytes($target, [Convert]::FromBase64String('${encoded}'))\nWrite-Host "Configured $target"`;
  }).join("\n\n");
  return `# Generated locally by the LLM Gateway setup page.\n$ErrorActionPreference = 'Stop'\n\n${writes}\n\nWrite-Host '\n${tool.name} is configured. Restart the tool before using it.'\n`;
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function filePathForPlatform(file, platform) {
  if (platform === "windows") return file.windows;
  const relativePath = platform === "linux" ? (file.linux || file.posix) : file.posix;
  return `~/${relativePath}`;
}

function fileNameFromPath(filePath) {
  return filePath.split(/[\\/]/).pop() || "llm-gateway-config.txt";
}

function manualConfig(tool, endpoint, apiKey, model) {
  if (tool.codeBlock?.code) {
    return tool.codeBlock.code
      .replaceAll("{{baseUrl}}", endpoint)
      .replaceAll("{{apiKey}}", apiKey)
      .replaceAll("{{model}}", model || "provider/model-id");
  }
  return `Base URL: ${endpoint}\nAPI key: ${apiKey}\nModel: ${model || "provider/model-id"}`;
}

export default function OrganizationToolSetup({ toolId, gatewayOrigin }) {
  const tool = CLI_TOOLS[toolId];
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(() => defaultModelFor(tool));
  const [models, setModels] = useState([]);
  const [platform, setPlatform] = useState("mac");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedItem, setCopiedItem] = useState("");
  const endpoint = ensureV1(gatewayOrigin);

  const files = useMemo(() => buildFiles(toolId, endpoint, apiKey, model), [toolId, endpoint, apiKey, model]);
  const preview = files.length ? files.map((file) => {
    const path = filePathForPlatform(file, platform);
    return `# ${path}\n${file.content}`;
  }).join("\n\n") : manualConfig(tool, endpoint, apiKey, model);
  const visiblePreview = !showKey && apiKey ? preview.replaceAll(apiKey, "••••••••") : preview;

  const verifyKey = async () => {
    if (!apiKey.trim()) {
      setResult({ type: "error", text: "Enter the API key provided by your organization." });
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const response = await fetch("/v1/models", { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || data.error || "The API key was not accepted.");
      const available = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
      setModels(available);
      if (!model && available.length) setModel(available[0]);
      setResult({ type: "success", text: available.length ? `API key verified. ${available.length} models available.` : "API key verified." });
    } catch (error) {
      setModels([]);
      setResult({ type: "error", text: error.message || "Could not verify the API key." });
    } finally {
      setChecking(false);
    }
  };

  const downloadInstaller = () => {
    if (!apiKey.trim()) {
      setResult({ type: "error", text: "Enter and verify your API key first." });
      return;
    }
    if (!files.length) return;
    const windows = platform === "windows";
    downloadText(`setup-${toolId}.${windows ? "ps1" : "sh"}`, windows ? windowsInstaller(tool, files) : unixInstaller(tool, files, platform));
  };

  const copyText = async (value, item) => {
    await navigator.clipboard.writeText(value);
    setCopiedItem(item);
    window.setTimeout(() => setCopiedItem(""), 1600);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link href="/cli-tools" className="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to CLI Tools
      </Link>

      <div className="flex items-center gap-3">
        {tool.image && <Image src={tool.image} alt="" width={40} height={40} className="size-10 rounded-lg object-contain" />}
        <div>
          <h1 className="text-xl font-semibold text-text-main sm:text-2xl">Set up {tool.name}</h1>
          <p className="text-sm text-text-muted">{tool.description}</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">1</span>
          <h2 className="font-medium text-text-main">Verify your access</h2>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-text-main">Organization API key</span>
            <div className="flex gap-2">
              <input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setResult(null); }} autoComplete="off" spellCheck={false} placeholder="Paste the key issued to you" className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-primary" />
              <button type="button" onClick={() => setShowKey((value) => !value)} className="rounded-lg border border-border px-3 text-sm text-text-muted hover:text-text-main">{showKey ? "Hide" : "Show"}</button>
            </div>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-text-main">Gateway endpoint</span>
            <input value={endpoint} readOnly className="rounded-lg border border-border bg-bg/60 px-3 py-2 font-mono text-sm text-text-muted" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={verifyKey} disabled={checking || !apiKey.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{checking ? "Verifying…" : "Verify API key"}</button>
            <span className="text-xs text-text-muted">The key stays in this browser, except when sent to this gateway for verification.</span>
          </div>
          {result && <div className={`rounded-lg px-3 py-2 text-sm ${result.type === "success" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>{result.text}</div>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">2</span>
          <h2 className="font-medium text-text-main">Choose a model</h2>
        </div>
        {models.length ? (
          <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary">
            {!models.includes(model) && model && <option value={model}>{model}</option>}
            {models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        ) : (
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="provider/model-id" className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-primary" />
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">3</span>
          <h2 className="font-medium text-text-main">Apply on your computer</h2>
        </div>
        <div className="mb-3 flex gap-2">
          {[{ id: "mac", label: "macOS" }, { id: "linux", label: "Linux" }, { id: "windows", label: "Windows" }].map((item) => (
            <button key={item.id} type="button" onClick={() => setPlatform(item.id)} className={`rounded-lg border px-3 py-1.5 text-sm ${platform === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"}`}>{item.label}</button>
          ))}
        </div>

        {files.length ? (
          <>
            <p className="mb-3 text-sm text-text-muted">The installer is generated entirely in your browser. It backs up an existing file with a <code>.llm-gateway.bak</code> suffix before writing the new configuration.</p>
            <button type="button" onClick={downloadInstaller} disabled={!apiKey.trim() || !model.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
              Download setup installer
            </button>
            <p className="mt-2 text-xs text-text-muted">
              {platform === "windows" ? `Run setup-${toolId}.ps1 with PowerShell, then restart ${tool.name}.` : `Run sh ~/Downloads/setup-${toolId}.sh, then restart ${tool.name}.`}
            </p>
            {toolId === "cowork" && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">In Claude Desktop, enable Developer mode and third-party inference once before running the installer.</p>}
          </>
        ) : (
          <p className="mb-3 text-sm text-text-muted">This tool manages its settings inside its own UI. Copy the values below into its OpenAI-compatible provider settings.</p>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-text-main">Manual configuration</h3>
            <p className="mt-1 text-xs text-text-muted">
              {files.length
                ? "Create each file at the path shown below, paste its contents, then restart the tool."
                : "Copy these values into the tool's OpenAI-compatible provider settings."}
            </p>
          </div>

          {files.length ? (
            <div className="grid gap-3">
              {files.map((file, index) => {
                const targetPath = filePathForPlatform(file, platform);
                const itemId = `file-${index}`;
                const visibleContent = !showKey && apiKey ? file.content.replaceAll(apiKey, "••••••••") : file.content;
                return (
                  <div key={targetPath} className="overflow-hidden rounded-lg border border-border bg-bg">
                    <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <code className="break-all text-xs text-text-main">{targetPath}</code>
                      <div className="flex shrink-0 items-center gap-3">
                        <button type="button" onClick={() => copyText(file.content, itemId)} disabled={!apiKey.trim() || !model.trim()} className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50">
                          {copiedItem === itemId ? "Copied" : "Copy contents"}
                        </button>
                        <button type="button" onClick={() => downloadText(fileNameFromPath(targetPath), file.content)} disabled={!apiKey.trim() || !model.trim()} className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50">
                          Download file
                        </button>
                      </div>
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-3 text-xs text-text-main">{visibleContent}</pre>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-bg">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium text-text-muted">Provider settings</span>
                <button type="button" onClick={() => copyText(preview, "manual")} disabled={!apiKey.trim()} className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50">{copiedItem === "manual" ? "Copied" : "Copy"}</button>
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all p-3 text-xs text-text-main">{visiblePreview}</pre>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
