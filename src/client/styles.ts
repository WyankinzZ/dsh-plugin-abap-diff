const STYLE_ID = 'dsh-abap-diff-styles';

const CSS = `
.abap-diff-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, system-ui, -apple-system, sans-serif);
  font-size: 13px;
  -webkit-app-region: no-drag;
}

.abap-diff-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}

.abap-diff-toolbar-left,
.abap-diff-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.abap-diff-title {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.abap-diff-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25));
}

.abap-diff-status-badge.recording {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
  border-color: rgba(22, 163, 74, 0.35);
}

.abap-diff-status-badge.idle {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.08));
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.abap-diff-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.abap-diff-dot.pulse {
  animation: abapDiffPulse 1.6s infinite;
}

@keyframes abapDiffPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

.abap-diff-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.3));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-primary, inherit);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.abap-diff-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14));
}

.abap-diff-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.abap-diff-btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.abap-diff-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.abap-diff-btn.danger {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(220, 38, 38, 0.35);
  color: #dc2626;
}

.abap-diff-btn.danger:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.2);
}

.abap-diff-select {
  height: 30px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.3));
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  max-width: 260px;
}

.abap-diff-segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.1));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
}

.abap-diff-seg-btn {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.abap-diff-seg-btn.active {
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #111827);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}

.abap-diff-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.abap-diff-sidebar {
  width: 310px;
  min-width: 240px;
  max-width: 380px;
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
}

.abap-diff-sidebar-top {
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.abap-diff-search {
  width: 100%;
  box-sizing: border-box;
  height: 29px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.25));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  outline: none;
}

.abap-diff-search:focus {
  border-color: #2563eb;
}

.abap-diff-tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.abap-diff-group-header {
  padding: 7px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #6b7280);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.abap-diff-group-prompt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.abap-diff-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  padding: 7px 12px;
  cursor: pointer;
  font-size: 12px;
}

.abap-diff-file-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
}

.abap-diff-file-row.selected {
  background: rgba(37, 99, 235, 0.12);
}

.abap-diff-kind-tag {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.abap-diff-kind-A { background: rgba(22, 163, 74, 0.16); color: #16a34a; }
.abap-diff-kind-M { background: rgba(217, 119, 6, 0.16); color: #d97706; }
.abap-diff-kind-D { background: rgba(220, 38, 38, 0.16); color: #dc2626; }

.abap-diff-file-main {
  flex: 1;
  min-width: 0;
}

.abap-diff-file-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.abap-diff-file-sub {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
}

.abap-diff-stats {
  display: inline-flex;
  gap: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  flex-shrink: 0;
}

.abap-diff-stat-add { color: #16a34a; }
.abap-diff-stat-del { color: #dc2626; }

.abap-diff-viewer {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.abap-diff-viewer-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.04));
}

.abap-diff-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22));
  background: var(--dsw-alias-bg-layer-1, transparent);
}

.abap-diff-meta-pill.active-ok {
  color: #16a34a;
  border-color: rgba(22, 163, 74, 0.35);
  background: rgba(22, 163, 74, 0.08);
}

.abap-diff-meta-pill.active-warn {
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.35);
  background: rgba(217, 119, 6, 0.08);
}

.abap-diff-code-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.abap-diff-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.abap-diff-ln {
  width: 46px;
  min-width: 46px;
  padding: 0 8px;
  text-align: right;
  user-select: none;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15));
  vertical-align: top;
}

.abap-diff-sign {
  width: 20px;
  min-width: 20px;
  text-align: center;
  user-select: none;
  vertical-align: top;
}

.abap-diff-code-cell {
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-word;
  vertical-align: top;
}

.abap-diff-line-add {
  background: rgba(22, 163, 74, 0.13);
}
.abap-diff-line-add .abap-diff-sign { color: #16a34a; font-weight: 700; }

.abap-diff-line-del {
  background: rgba(220, 38, 38, 0.13);
}
.abap-diff-line-del .abap-diff-sign { color: #dc2626; font-weight: 700; }

.abap-diff-line-empty {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.05));
}

.abap-diff-gap-row td {
  background: rgba(59, 130, 246, 0.07);
  color: var(--dsw-alias-label-secondary, #6b7280);
  padding: 4px 12px;
  font-size: 11px;
  text-align: center;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14));
}

.abap-tok-keyword { color: #2563eb; font-weight: 600; }
.abap-tok-comment { color: #6b7280; font-style: italic; }
.abap-tok-string { color: #059669; }
.abap-tok-number { color: #b45309; }

.abap-diff-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.abap-header-pill-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.abap-header-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.28));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.abap-header-pill-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14));
}

.abap-header-pill-btn.recording {
  border-color: rgba(22, 163, 74, 0.45);
  background: rgba(22, 163, 74, 0.11);
  color: #16a34a;
}

.abap-diff-footer-bar {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
`;

export function ensureAbapDiffStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
