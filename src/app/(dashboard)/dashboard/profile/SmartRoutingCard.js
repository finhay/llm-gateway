"use client";

import { useState, useEffect } from "react";
import { Card, Button, Toggle, Input } from "@/shared/components";

const DEFAULTS = {
  enabled: false,
  virtualModel: "auto",
  provider: "typesafe",
  defaultTarget: "",
  minConfidence: 0.6,
  routes: {},
};

const SOURCE_LABEL = { env: "environment variable", settings: "saved in admin", request: "typed key" };

function Status({ status }) {
  if (!status?.message) return null;
  const color = status.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  return <p className={`text-xs mt-1 ${color}`}>{status.message}</p>;
}

export default function SmartRoutingCard() {
  const [form, setForm] = useState(DEFAULTS);
  const [routesText, setRoutesText] = useState("{}");
  const [keyStatus, setKeyStatus] = useState({});
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [toggleStatus, setToggleStatus] = useState({ type: "", message: "" });
  const [testStatus, setTestStatus] = useState({ type: "", message: "" });

  const load = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      const sr = { ...DEFAULTS, ...(data.smartRouting || {}) };
      setForm(sr);
      setRoutesText(JSON.stringify(sr.routes || {}, null, 2));
      setKeyStatus(data.decisionKeyStatus || {});
    } catch (error) {
      console.log("Error loading smart routing settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const providerKey = keyStatus[form.provider];
  const providerLabel = providerKey?.label || form.provider;

  // `overrides` lets the toggle save a flipped `enabled` without waiting for a state update
  const save = async (overrides = {}, report = setStatus) => {
    const values = { ...form, ...overrides };
    let routes;
    try {
      routes = JSON.parse(routesText || "{}");
      if (!routes || typeof routes !== "object" || Array.isArray(routes)) throw new Error("not an object");
    } catch {
      report({ type: "error", message: 'Routes must be a JSON object, e.g. {"code": "code-cheap"}' });
      return;
    }
    const minConfidence = Number(values.minConfidence);
    if (!(minConfidence >= 0 && minConfidence <= 1)) {
      report({ type: "error", message: "Minimum confidence must be between 0 and 1" });
      return;
    }
    if (values.enabled && !values.defaultTarget.trim()) {
      report({ type: "error", message: "Set a default target before enabling: it is used whenever classification fails" });
      return;
    }

    const payload = {
      smartRouting: {
        enabled: values.enabled,
        virtualModel: values.virtualModel.trim() || "auto",
        provider: values.provider,
        defaultTarget: values.defaultTarget.trim(),
        minConfidence,
        routes,
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
    } catch (error) {
      report({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
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
        setTestStatus({ type: "success", message: `${providerLabel} accepted the key (${SOURCE_LABEL[data.keySource] || data.keySource}): sample classified as "${data.tag}" in ${data.ms} ms` });
      } else {
        setTestStatus({ type: "error", message: data.error || "Test failed" });
      }
    } catch (error) {
      setTestStatus({ type: "error", message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async () => {
    setToggleStatus({ type: "", message: "" });
    const enabled = !form.enabled;
    if (enabled && !form.defaultTarget.trim()) {
      setToggleStatus({ type: "error", message: "Not enabled: fill in the Default target below first, then switch on." });
      return;
    }
    // Saves immediately, like the other switches on this page
    await save({ enabled }, setToggleStatus);
  };

  return (
    <Card>
      <div className="p-2 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Smart routing</h3>
            <p className="text-sm text-text-muted">
              Requests sent with model <code>{form.virtualModel || "auto"}</code> are classified and routed to a combo or model by task type.
            </p>
          </div>
          <Toggle checked={form.enabled} onChange={toggleEnabled} disabled={loading || saving} />
        </div>

        <Status status={toggleStatus} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Decision provider</label>
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
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Virtual model name</label>
            <Input value={form.virtualModel} onChange={(e) => setForm({ ...form, virtualModel: e.target.value })} placeholder="auto" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{providerLabel} API key</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={providerKey?.configured ? "Configured, leave empty to keep it" : "Paste the API key"}
            autoComplete="off"
          />
          <p className="text-xs text-text-muted mt-1">
            {providerKey?.configured
              ? `Using the key from the ${SOURCE_LABEL[providerKey.source]}.`
              : `No key yet. Enter one here or set ${providerKey?.envKey || "the provider env variable"}.`}
            {providerKey?.source === "env" && ` ${providerKey.envKey} takes priority over a key saved here.`}
            {" "}The key is write-only and never shown again.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button variant="secondary" size="sm" icon="bolt" onClick={test} loading={testing}>Test key</Button>
            {providerKey?.source === "settings" && (
              <Button variant="ghost" size="sm" icon="delete" onClick={removeKey}>Remove saved key</Button>
            )}
          </div>
          <Status status={testStatus} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Default target</label>
            <Input value={form.defaultTarget} onChange={(e) => setForm({ ...form, defaultTarget: e.target.value })} placeholder="always-on (combo or provider/model)" />
            <p className="text-xs text-text-muted mt-1">Used when classification fails or is not confident.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Minimum confidence (0 to 1)</label>
            <Input type="number" step="0.05" min="0" max="1" value={form.minConfidence} onChange={(e) => setForm({ ...form, minConfidence: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Routes (JSON)</label>
          <textarea
            value={routesText}
            onChange={(e) => setRoutesText(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full px-3 py-2 bg-surface border border-border rounded text-xs font-mono"
            placeholder={'{\n  "code:high": "code-premium",\n  "code": "code-cheap",\n  "agent": "code-premium"\n}'}
          />
          <p className="text-xs text-text-muted mt-1">
            Keys are a tag, or tag:complexity. Tags: code, reasoning, chat, summarize_translate, creative, other, plus agent, vision and long_context (decided without the provider). Complexity: low, medium, high.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => save()} loading={saving} disabled={loading}>Save</Button>
          <Status status={status} />
        </div>
      </div>
    </Card>
  );
}
