"use client";

import { useEffect, useState } from "react";
import { Card, Button, SegmentedControl, Toggle } from "@/shared/components";

const DEFAULT_SETTINGS = {
  secretsEnabled: true,
  secretsMode: "enforce",
  dlpEnabled: true,
  dlpMode: "enforce",
  customDlpPatterns: [],
  providerRiskOverrides: {},
  detectorOverrides: {},
};

const SECRET_DETECTORS = [
  { id: "pem_private_key", label: "PEM private key", noisy: false },
  { id: "ssh_private_key", label: "SSH private key", noisy: false },
  { id: "database_url", label: "Database URL", noisy: false },
  { id: "aws_secret", label: "AWS secret", noisy: false },
  { id: "github_token", label: "GitHub token", noisy: false },
  { id: "gitlab_token", label: "GitLab token", noisy: false },
  { id: "openai_key", label: "OpenAI key", noisy: false },
  { id: "anthropic_key", label: "Anthropic key", noisy: false },
  { id: "google_api_key", label: "Google API key", noisy: false },
  { id: "slack_token", label: "Slack token", noisy: false },
  { id: "jwt", label: "JWT", noisy: false },
  { id: "high_entropy_token", label: "High entropy token", noisy: true },
];

const DLP_DETECTORS = [
  { id: "credit_card", label: "Credit card", noisy: false },
  { id: "national_id", label: "National ID / SSN", noisy: true },
  { id: "bank_account", label: "Bank account", noisy: true },
  { id: "email", label: "Email", noisy: false },
  { id: "phone_number", label: "Phone number", noisy: true },
];

const TEST_SAMPLES = [
  "Email: customer@example.com\nSSN: 123-45-6789\nCard: 4111 1111 1111 1111",
  "GitHub token: ghp_1234567890abcdefghij1234567890abcdef",
  "Private key:\n-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
];

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState("detections");
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [eventsRes, statsRes, settingsRes] = await Promise.all([
        fetch("/api/security/events?limit=100"),
        fetch("/api/security/stats"),
        fetch("/api/security/settings"),
      ]);
      const [eventsJson, statsJson, settingsJson] = await Promise.all([
        eventsRes.json(),
        statsRes.json(),
        settingsRes.json(),
      ]);
      setEvents(eventsJson.events || []);
      setStats(statsJson || null);
      setSettings({ ...DEFAULT_SETTINGS, ...(settingsJson.securityScan || {}) });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(nextSettings) {
    setSettings(nextSettings);
    const res = await fetch("/api/security/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ securityScan: nextSettings }),
    });
    const json = await res.json();
    setSettings({ ...DEFAULT_SETTINGS, ...(json.securityScan || {}) });
  }

  async function runTest() {
    const res = await fetch("/api/security/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: testText }),
    });
    setTestResult(await res.json());
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">Security</h1>
          <p className="text-sm text-text-muted">Secrets, PII redaction, and provider risk policy.</p>
        </div>
        <SegmentedControl
          options={[
            { value: "detections", label: "Detections" },
            { value: "settings", label: "Settings" },
            { value: "tester", label: "Tester" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          className="w-full sm:w-auto"
        />
      </div>

      {activeTab === "detections" && (
        <DetectionsTab events={events} stats={stats} loading={loading} onRefresh={loadData} />
      )}
      {activeTab === "settings" && (
        <SettingsTab settings={settings} onChange={saveSettings} />
      )}
      {activeTab === "tester" && (
        <TesterTab text={testText} setText={setTestText} result={testResult} onRun={runTest} />
      )}
    </div>
  );
}

function DetectionsTab({ events, stats, loading, onRefresh }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total" value={stats?.total || 0} />
        <StatCard label="Secrets" value={stats?.byKind?.secret || 0} />
        <StatCard label="PII" value={stats?.byKind?.pii || 0} />
        <StatCard label="Blocked" value={stats?.byAction?.blocked || 0} />
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="text-base font-semibold text-text-main">Recent detections</h2>
          <Button size="sm" variant="secondary" onClick={onRefresh}>Refresh</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="px-4 py-6 text-text-muted" colSpan={6}>Loading…</td></tr>}
              {!loading && events.length === 0 && <tr><td className="px-4 py-6 text-text-muted" colSpan={6}>No detections yet.</td></tr>}
              {events.map((event) => (
                <tr key={event.id} className="border-t border-border-subtle">
                  <td className="px-4 py-3 text-text-muted">{new Date(event.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">{event.kind}</td>
                  <td className="px-4 py-3">{event.type}</td>
                  <td className="px-4 py-3">{event.action}</td>
                  <td className="px-4 py-3 text-text-muted">{event.location}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{event.fingerprint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-main">{value}</p>
    </Card>
  );
}

function SettingsTab({ settings, onChange }) {
  function update(key, value) {
    onChange({ ...settings, [key]: value });
  }

  function updateDetector(detectorId, patch) {
    onChange({
      ...settings,
      detectorOverrides: {
        ...(settings.detectorOverrides || {}),
        [detectorId]: { ...(settings.detectorOverrides?.[detectorId] || {}), ...patch },
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4">
          <ToggleRow label="Secret scanning" value={settings.secretsEnabled} onChange={(v) => update("secretsEnabled", v)} />
          <ModeRow label="Secret mode" value={settings.secretsMode} onChange={(v) => update("secretsMode", v)} />
          <ToggleRow label="DLP scanning" value={settings.dlpEnabled} onChange={(v) => update("dlpEnabled", v)} />
          <ModeRow label="DLP mode" value={settings.dlpMode} onChange={(v) => update("dlpMode", v)} />
        </div>
      </Card>
      <DetectorGroup
        title="Secret detectors"
        detectors={SECRET_DETECTORS}
        overrides={settings.detectorOverrides || {}}
        onChange={updateDetector}
      />
      <DetectorGroup
        title="DLP / PII detectors"
        detectors={DLP_DETECTORS}
        overrides={settings.detectorOverrides || {}}
        onChange={updateDetector}
      />
    </div>
  );
}

function DetectorGroup({ title, detectors, overrides, onChange }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-main">{title}</h2>
        <p className="text-sm text-text-muted">Tune each detector without disabling the whole scanner.</p>
      </div>
      <div className="flex flex-col gap-4">
        {detectors.map((detector, index) => {
          const override = overrides?.[detector.id] || {};
          return (
            <DetectorRow
              key={detector.id}
              detector={detector}
              enabled={override.enabled !== false}
              action={override.action || "default"}
              className={index > 0 ? "pt-4 border-t border-border/50" : ""}
              onEnabledChange={(enabled) => onChange(detector.id, { enabled })}
              onActionChange={(action) => onChange(detector.id, { action })}
            />
          );
        })}
      </div>
    </Card>
  );
}

function DetectorRow({ detector, enabled, action, className, onEnabledChange, onActionChange }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className || ""}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm sm:text-base text-text-main">{detector.label}</p>
        <p className="text-xs sm:text-sm text-text-muted">{detector.noisy ? "Higher false-positive risk" : "High confidence"}</p>
      </div>
      <div className="flex items-center gap-3 self-start sm:self-auto">
        <select
          className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
          value={action}
          onChange={(e) => onActionChange(e.target.value)}
          disabled={!enabled}
        >
          <option value="default">Default</option>
          <option value="logged">Log only</option>
          <option value="redacted">Redact</option>
          <option value="blocked">Block</option>
        </select>
        <Toggle checked={enabled} onChange={onEnabledChange} />
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm sm:text-base text-text-main">{label}</p>
        {description && <p className="text-xs sm:text-sm text-text-muted">{description}</p>}
      </div>
      <Toggle checked={!!value} onChange={onChange} />
    </div>
  );
}

function ModeRow({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 pt-4 border-t border-border/50">
      <span className="font-medium text-sm sm:text-base text-text-main">{label}</span>
      <select className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="enforce">Enforce</option>
        <option value="dryrun">Dry run</option>
      </select>
    </label>
  );
}

function TesterTab({ text, setText, result, onRun }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4 p-5">
        <textarea
          className="min-h-64 rounded-xl border border-border-subtle bg-surface p-3 text-sm text-text-main outline-none focus:border-primary"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste sample text to scan without sending it to a provider."
        />
        <div className="flex flex-wrap gap-2">
          {TEST_SAMPLES.map((sample, index) => (
            <Button key={index} size="sm" variant="secondary" onClick={() => setText(sample)}>
              Sample {index + 1}
            </Button>
          ))}
        </div>
        <Button onClick={onRun}>Run scan</Button>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-text-main">Result</h2>
        <pre className="max-h-96 overflow-auto rounded-xl bg-surface-2 p-4 text-xs text-text-muted">
          {result ? JSON.stringify(result, null, 2) : "No scan yet."}
        </pre>
      </Card>
    </div>
  );
}
