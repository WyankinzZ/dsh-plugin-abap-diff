import React, { useEffect, useState } from 'react';
import {
  abapDiffApi,
  getTrackerSnapshot,
  refreshTrackerState,
  subscribeTrackerState,
} from './api.ts';
import { ensureAbapDiffStyles } from './styles.ts';

interface HeaderPillProps {
  onOpenPanel: () => void;
}

export function HeaderPill({ onOpenPanel }: HeaderPillProps) {
  ensureAbapDiffStyles();
  const [snapshot, setSnapshot] = useState(getTrackerSnapshot);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSnapshot(getTrackerSnapshot());
    return subscribeTrackerState(() => {
      setSnapshot(getTrackerSnapshot());
    });
  }, []);

  const state = snapshot.state;
  const recording = Boolean(state?.recording);
  const count = state?.activeSummary?.filesCount ?? 0;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (recording) {
        await abapDiffApi.stopSession();
      } else {
        await abapDiffApi.startSession();
      }
      await refreshTrackerState();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="abap-header-pill-wrap">
      <button
        type="button"
        disabled={busy}
        className={`abap-header-pill-btn ${recording ? 'recording' : ''}`}
        onClick={() => void toggle()}
        title={recording ? '点击关闭 ABAP 代码变更追踪' : '点击启动 ABAP 代码变更追踪'}
      >
        <span className={`abap-diff-dot ${recording ? 'pulse' : ''}`} />
        <span>{recording ? `ABAP追踪中 (${count})` : 'ABAP追踪: 关'}</span>
      </button>
      <button
        type="button"
        className="abap-header-pill-btn"
        onClick={onOpenPanel}
        title="打开 ABAP Diff 对比面板"
      >
        Diff
      </button>
    </div>
  );
}
