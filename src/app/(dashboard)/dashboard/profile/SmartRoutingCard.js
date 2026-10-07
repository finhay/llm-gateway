"use client";

import { useState, useEffect } from "react";
import { Card, Button, Toggle, Input } from "@/shared/components";

const DEFAULTS = {
  enabled: false,
  virtualModel: "auto/jev",
  provider: "typesafe",
  fallbackTarget: "",
  minConfidence: 0.6,
  timeoutMs: 800,
  weights: { quality: 0.5, latency: 0.25, cost: 0.25 },
  include: [],
  exclude: [],
  overrides: {},
};

const SOURCE_LABEL = { env: "environment variable", settings: "saved in admin", request: "typed key" };
const TIER_STYLE = { low: "bg-green-500/10 text-green-600", medium: "bg-yellow-500/10 text-yellow-600", high: "bg-red-500/10 text-red-600" };

const toLines = (list) => (list || []).join("\n");
const fromLines = (text) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

function Status({ status }) {
  if (!status?.message) return null;
  const color = status.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  return <p className={`text-xs mt-1 ${color}`}>{status.message}</p>;
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function Tier({ value, title }) {
  return <span title={title} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TIER_STYLE[value] || ""}`}>{value}</span>;
}

export default function SmartRoutingCard() {
  const [form, setForm] = useState(DEFAULTS);
  const [includeText, setIncludeText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [overridesText, setOverridesText] = useState("{}");
  const [keyStatus, setKeyStatus] = useState({});
  const [apiKey, setApiKey] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [toggleStatus, setToggleStatus] = useState({ type: "", message: "" });
  const [testStatus, setTestStatus] = useState({ type: "", message: "" });

  const loadCandidates = async (refresh = false) => {
    try {
      const res = await fetch(`/api/smart-routing/candidates${refresh ? "?refresh=1" : ""}`);
      setCandidates(res.ok ? await res.json() : { count: 0, candidates: [], error: (await res.json()).error });
    } catch (error) {
      setCandidates({ count: 0, candidates: [], error: error.message });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const sr = { ...DEFAULTS, ...(data.smartRouting || {}), weights: { ...DEFAULTS.weights, ...(data.smartRouting?.weights || {}) } };
        setForm(sr);
        setIncludeText(toLines(sr.include));
        setExcludeText(toLines(sr.exclude));
        setOverridesText(JSON.stringify(sr.overrides || {}, null, 2));
        setKeyStatus(data.decisionKeyStatus || {});
      } catch (error) {
        console.log("Error loading smart routing settings:", error);
      } finally {
        setLoading(false);
      }
      loadCandidates();
    })();
  }, []);

  const providerKey = keyStatus[form.provider];
  const providerLabel = providerKey?.label || form.provider;
  const setWeight = (name, value) => setForm({ ...form, weights: { ...form.weights, [name]: value } });

  // `overrides` lets the toggle save a flipped `enabled` without waiting for a state update
  const save = async (overrides = {}, report = setStatus) => {
    const values = { ...form, ...overrides };
    let modelOverrides;
    try {
      modelOverrides = JSON.parse(overridesText || "{}");
    } catch {
      report({ type: "error", message: "Model overrides must be valid JSON" });
      return;
    }
    const weights = Object.fromEntries(Object.entries(values.weights).map(([k, v]) => [k, Number(v)]));

    const payload = {
      smartRouting: {
        enabled: values.enabled,
        virtualModel: values.virtualModel.trim() || "auto/jev",
        provider: values.provider,
        fallbackTarget: values.fallbackTarget.trim(),
        minConfidence: Number(values.minConfidence),
        timeoutMs: Number(values.timeoutMs),
        weights,
        include: fromLines(includeText),
        exclude: fromLines(excludeText),
        overrides: modelOverrides,
      },
    };
    // An empty field keeps the stored key; only a typed value replaces it
    if (apiKey.trim()) payload.decisionApiKeys = { [values.provider]: apiKey.trim() };

    setSaving(true);
    report({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        report({ type: "error", message: data.error || "Failed to save" });
        return;
      }
      setApiKey("");
      setForm((prev) => ({ ...prev, ...overrides }));
      setKeyStatus(data.decisionKeyStatus || {});
      report({ type: "success", message: "Saved" });
      loadCandidates();
    } catch (error) {
      report({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    setToggleStatus({ type: "", message: "" });
    const enabled = !form.enabled;
    if (enabled && !form.fallbackTarget.trim()) {
      setToggleStatus({ type: "error", message: "Not enabled: fill in the Fallback target below first, then switch on." });
      return;
    }
    // Saves immediately, like the other switches on this page
    await save({ enabled }, setToggleStatus);
  };

  const removeKey = async () => {
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisionApiKeys: { [form.provider]: null } }) });
    const data = await res.json();
    if (res.ok) {
      setKeyStatus(data.decisionKeyStatus || {});
      setStatus({ type: "success", message: "Saved key removed" });
    }
  };

  const test = async () => {
    setTesting(true);
    setTestStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/smart-routing/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: form.provider, apiKey: apiKey.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus({ type: "success", message: `${providerLabel} accepted the key (${SOURCE_LABEL[data.keySource] || data.keySource}): sample decision "${data.choice}"${data.effort ? `, effort ${data.effort}` : ""} in ${data.ms} ms` });
      } else {
        setTestStatus({ type: "error", message: data.error || "Test failed" });
      }
    } catch (error) {
      setTestStatus({ type: "error", message: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <div className="p-2 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Smart router (shadow mode)</h3>
            <p className="text-sm text-text-muted">
              Requests sent with model <code>{form.virtualModel || "auto/jev"}</code> are served by the fallback target. The router looks at
              the models that are connected right now, and records which model and reasoning effort it would have chosen. It never changes what runs.
            </p>
          </div>
          <Toggle checked={form.enabled} onChange={toggleEnabled} disabled={loading || saving} />
        </div>
        <Status status={toggleStatus} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fallback target" hint="Combo or provider/model that serves every request, and is used whenever the router cannot decide.">
            <Input value={form.fallbackTarget} onChange={(e) => setForm({ ...form, fallbackTarget: e.target.value })} placeholder="always-on or cc/claude-sonnet-4-6" />
          </Field>
          <Field label="Virtual model name">
            <Input value={form.virtualModel} onChange={(e) => setForm({ ...form, virtualModel: e.target.value })} placeholder="auto/jev" />
          </Field>
        </div>

        <div>
          <Field label="Decision provider">
            <select
              value={form.provider}
              onChange={(e) => { setForm({ ...form, provider: e.target.value }); setApiKey(""); setTestStatus({ type: "", message: "" }); }}
              className="w-full px-3 py-2 bg-surface border border-border rounded text-sm"
            >
              {Object.entries(keyStatus).map(([id, info]) => (
                <option key={id} value={id}>{info.label}</option>
              ))}
              {!keyStatus[form.provider] && <option value={form.provider}>{form.provider}</option>}
            </select>
          </Field>
          <div className="mt-3">
            <Field
              label={`${providerLabel} API key`}
              hint={`${providerKey?.configured ? `Using the key from the ${SOURCE_LABEL[providerKey.source]}.` : `No key yet. Enter one here or set ${providerKey?.envKey || "the provider env variable"}.`}${providerKey?.source === "env" ? ` ${providerKey.envKey} takes priority over a key saved here.` : ""} The key is write-only and never shown again.`}
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={providerKey?.configured ? "Configured, leave empty to keep it" : "Paste the API key"}
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button variant="secondary" size="sm" icon="bolt" onClick={test} loading={testing}>Test key</Button>
            {providerKey?.source === "settings" && (
              <Button variant="ghost" size="sm" icon="delete" onClick={removeKey}>Remove saved key</Button>
            )}
          </div>
          <Status status={testStatus} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {["quality", "latency", "cost"].map((name) => (
            <Field key={name} label={`Weight: ${name}`}>
              <Input type="number" step="0.05" min="0" value={form.weights[name]} onChange={(e) => setWeight(name, e.target.value)} />
            </Field>
          ))}
          <Field label="Min confidence">
            <Input type="number" step="0.05" min="0" max="1" value={form.minConfidence} onChange={(e) => setForm({ ...form, minConfidence: e.target.value })} />
          </Field>
          <Field label="Timeout (ms)">
            <Input type="number" step="100" min="100" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} />
          </Field>
        </div>

        <div className="border border-border rounded p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-medium">Models the router can choose from {candidates ? `(${candidates.count})` : ""}</p>
              <p className="text-xs text-text-muted">
                Detected automatically from your connected providers (disabled models left out), with quality, latency and cost inferred from the model name and price.
                Per request, models the API key, data policy or provider availability do not allow are removed.
              </p>
            </div>
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => loadCandidates(true)}>Refresh</Button>
          </div>
          {candidates?.error && <Status status={{ type: "error", message: candidates.error }} />}
          {candidates && candidates.count === 0 && !candidates.error && (
            <p className="text-xs text-text-muted">No models found. Connect a provider first, or relax include/exclude below.</p>
          )}
          {candidates?.count > 0 && (
            <div className="max-h-[240px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-text-muted text-left sticky top-0 bg-surface">
                  <tr><th className="py-1 pr-2 font-medium">Model</th><th className="pr-2 font-medium">Quality</th><th className="pr-2 font-medium">Latency</th><th className="pr-2 font-medium">Cost</th><th className="font-medium">Vision / effort</th></tr>
                </thead>
                <tbody>
                  {candidates.candidates.map((c) => (
                    <tr key={c.id} className="border-t border-border/50">
                      <td className="py-1 pr-2 font-mono">{c.id}</td>
                      <td className="pr-2"><Tier value={c.qualityTier} title="higher is better" /></td>
                      <td className="pr-2"><Tier value={c.latencyTier} title="lower is faster" /></td>
                      <td className="pr-2"><Tier value={c.costTier} title="lower is cheaper" /></td>
                      <td className="text-text-muted">{c.capabilities?.vision ? "vision" : "text"}{c.reasoningEfforts?.length ? ` · effort ${c.reasoningEfforts.join("/")}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Only these models (optional)" hint='One pattern per line, e.g. "cc/*". Empty means every detected model.'>
            <textarea value={includeText} onChange={(e) => setIncludeText(e.target.value)} rows={3} spellCheck={false} className="w-full px-3 py-2 bg-surface border border-border rounded text-xs font-mono" />
          </Field>
          <Field label="Leave out" hint='One pattern per line, e.g. "gh/*" or "*/gpt-3.5*".'>
            <textarea value={excludeText} onChange={(e) => setExcludeText(e.target.value)} rows={3} spellCheck={false} className="w-full px-3 py-2 bg-surface border border-border rounded text-xs font-mono" />
          </Field>
        </div>

        <Field label="Correct a model's profile (JSON, optional)" hint="Only needed when the automatic guess is wrong. Tiers are low, medium or high; effort names must be in the profile's effort list.">
          <textarea
            value={overridesText}
            onChange={(e) => setOverridesText(e.target.value)}
            rows={5}
            spellCheck={false}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-xs font-mono"
            placeholder={'{\n  "cc/claude-opus-4-7": { "qualityTier": "high", "costTier": "high", "capabilities": { "vision": true } }\n}'}
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => save()} loading={saving} disabled={loading}>Save</Button>
          <Status status={status} />
        </div>
      </div>
    </Card>
  );
}
