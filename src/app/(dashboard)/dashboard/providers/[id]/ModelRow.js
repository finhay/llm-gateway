import { useState } from "react";
import PropTypes from "prop-types";

export default function ModelRow({ model, fullModel, alias, copied, onCopy, testStatus, isCustom, isFree, onSetAlias, onDeleteAlias, onTest, isTesting, onDisable }) {
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasValue, setAliasValue] = useState(alias || "");
  const [savingAlias, setSavingAlias] = useState(false);

  const saveAlias = async () => {
    const value = aliasValue.trim();
    if (!value || !onSetAlias || savingAlias) return;
    setSavingAlias(true);
    try {
      await onSetAlias(value);
      setEditingAlias(false);
    } finally {
      setSavingAlias(false);
    }
  };

  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`group min-w-0 max-w-full rounded-lg border px-3 py-2 ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="material-symbols-outlined shrink-0 text-base"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <code className="max-w-[72vw] truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted sm:max-w-[360px]">{fullModel}</code>
          {(model.name || (alias && !editingAlias && !isCustom)) && (
            <div className="flex min-w-0 flex-col items-start gap-1 pl-1">
              {model.name && <span className="truncate text-[10px] text-text-muted/70">{model.name}</span>}
              {alias && !editingAlias && !isCustom && (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] leading-none text-primary" title={`Alias: ${alias}`}>
                  <span className="material-symbols-outlined text-[11px]">label</span>
                  <span className="max-w-[180px] truncate">{alias}</span>
                </span>
              )}
            </div>
          )}
        </div>
        {onTest && (
          <div className="relative shrink-0 group/btn">
            <button
              onClick={onTest}
              disabled={isTesting}
              className="rounded p-0.5 text-text-muted hover:bg-sidebar hover:text-primary"
            >
              <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                {isTesting ? "progress_activity" : "science"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {isTesting ? "Testing..." : "Test"}
            </span>
          </div>
        )}
        <div className="relative shrink-0 group/btn">
          <button
            onClick={() => onCopy(fullModel, `model-${model.id}`)}
            className="rounded p-0.5 text-text-muted hover:bg-sidebar hover:text-primary"
          >
            <span className="material-symbols-outlined text-sm">
              {copied === `model-${model.id}` ? "check" : "content_copy"}
            </span>
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === `model-${model.id}` ? "Copied!" : "Copy"}
          </span>
        </div>
        {!isCustom && !alias && onSetAlias && (
          <div className="relative shrink-0 group/btn">
            <button
              type="button"
              onClick={() => {
                setAliasValue(alias || "");
                setEditingAlias((value) => !value);
              }}
              className={`rounded p-0.5 hover:bg-sidebar hover:text-primary ${editingAlias ? "bg-primary/10 text-primary" : "text-text-muted"}`}
              aria-label={editingAlias ? "Close alias editor" : "Add model alias"}
              aria-expanded={editingAlias}
            >
              <span className="material-symbols-outlined text-sm">
                {editingAlias ? "label_off" : "new_label"}
              </span>
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-text-muted opacity-0 transition-opacity group-hover/btn:opacity-100">
              {editingAlias ? "Close alias" : "Add alias"}
            </span>
          </div>
        )}
        {!isCustom && alias && onDeleteAlias && (
          <div className="relative shrink-0 group/btn">
            <button
              type="button"
              onClick={onDeleteAlias}
              className="rounded p-0.5 text-text-muted hover:bg-red-500/10 hover:text-red-500"
              aria-label={`Remove alias ${alias}`}
            >
              <span className="material-symbols-outlined text-sm">label_off</span>
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] text-text-muted opacity-0 transition-opacity group-hover/btn:opacity-100">
              Remove alias
            </span>
          </div>
        )}
        {isCustom ? (
          <button
            onClick={onDeleteAlias}
            className="ml-auto rounded p-0.5 text-text-muted hover:bg-red-500/10 hover:text-red-500"
            title="Remove custom model"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        ) : onDisable ? (
          <button
            onClick={onDisable}
            className="ml-auto rounded p-0.5 text-text-muted hover:bg-red-500/10 hover:text-red-500"
            title="Disable this model"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        ) : null}
      </div>
      {editingAlias && !isCustom && (
        <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-border/60 pt-2">
          <input
            value={aliasValue}
            onChange={(event) => setAliasValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveAlias();
              if (event.key === "Escape") {
                setAliasValue(alias || "");
                setEditingAlias(false);
              }
            }}
            placeholder="e.g. claude-minimax-m3"
            autoFocus
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-primary"
          />
          <button type="button" onClick={saveAlias} disabled={!aliasValue.trim() || savingAlias} className="rounded bg-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
            {savingAlias ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => { setAliasValue(alias || ""); setEditingAlias(false); }} className="rounded px-2 py-1 text-xs text-text-muted hover:bg-sidebar">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onSetAlias: PropTypes.func,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
};
