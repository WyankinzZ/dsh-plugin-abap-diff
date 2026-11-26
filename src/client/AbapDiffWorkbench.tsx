import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DiffDetailResponse,
  TouchedObjectRecord,
  TrackingSession,
  TrackingSessionSummary,
} from '../shared/types.ts';
import {
  abapDiffApi,
  getTrackerSnapshot,
  refreshTrackerState,
  subscribeTrackerState,
} from './api.ts';
import { DiffViewer } from './DiffViewer.tsx';
import { ensureAbapDiffStyles } from './styles.ts';

interface SelectionKey {
  filePath: string;
  turn: string; // 'all' | String(turnIndex)
}

export function AbapDiffWorkbench() {
  ensureAbapDiffStyles();

  const [snapshot, setSnapshot] = useState(getTrackerSnapshot);
  const [sessions, setSessions] = useState<TrackingSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<TrackingSession | null>(null);
  const [groupMode, setGroupMode] = useState<'session' | 'turns'>('turns');
  const [filterText, setFilterText] = useState('');
  const [selection, setSelection] = useState<SelectionKey | null>(null);
  const [diffDetail, setDiffDetail] = useState<DiffDetailResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [copiedRepo, setCopiedRepo] = useState(false);

  useEffect(() => {
    setSnapshot(getTrackerSnapshot());
    return subscribeTrackerState(() => {
      setSnapshot(getTrackerSnapshot());
    });
  }, []);

  const state = snapshot.state;
  const version = state?.version ?? 0;

  // Fetch session summaries whenever version changes
  const reloadSessions = useCallback(async () => {
    try {
      const res = await abapDiffApi.listSessions();
      setSessions(res.sessions);
      setSelectedSessionId((prev) => {
        if (prev && res.sessions.some((s) => s.id === prev)) return prev;
        return state?.activeSessionId ?? res.sessions[0]?.id ?? null;
      });
    } catch {
      // ignore transient error
    }
  }, [state?.activeSessionId]);

  useEffect(() => {
    void reloadSessions();
  }, [version, reloadSessions]);

  // Fetch active/selected session detail whenever selectedSessionId or version changes
  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      return;
    }
    let cancelled = false;
    void abapDiffApi
      .getSession(selectedSessionId)
      .then((res) => {
        if (!cancelled) setSessionDetail(res.session);
      })
      .catch(() => {
        if (!cancelled) setSessionDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, version]);

  // Auto-select first touched file when session changes or gains files
  useEffect(() => {
    if (!sessionDetail) {
      setSelection(null);
      return;
    }
    if (groupMode === 'session') {
      const exists =
        selection &&
        selection.turn === 'all' &&
        sessionDetail.files.some((f) => f.filePath === selection.filePath);
      if (!exists) {
        const first = sessionDetail.files[0];
        setSelection(first ? { filePath: first.filePath, turn: 'all' } : null);
      }
    } else {
      const turnsDesc = [...sessionDetail.turns].reverse();
      const exists =
        selection &&
        selection.turn !== 'all' &&
        turnsDesc.some(
          (t) =>
            String(t.turnIndex) === selection.turn &&
            t.files.some((f) => f.filePath === selection.filePath),
        );
      if (!exists) {
        for (const t of turnsDesc) {
          if (t.files.length > 0) {
            setSelection({ filePath: t.files[0].filePath, turn: String(t.turnIndex) });
            return;
          }
        }
        const first = sessionDetail.files[0];
        setSelection(first ? { filePath: first.filePath, turn: 'all' } : null);
      }
    }
  }, [sessionDetail, groupMode]);

  // Fetch file diff whenever selection or version changes
  useEffect(() => {
    if (!selectedSessionId || !selection) {
      setDiffDetail(null);
      setDiffError(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    void abapDiffApi
      .getDiff(selectedSessionId, selection.filePath, selection.turn)
      .then((res) => {
        if (!cancelled) {
          setDiffDetail(res.diff);
          setDiffLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDiffError(err instanceof Error ? err.message : String(err));
          setDiffLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, selection?.filePath, selection?.turn, version]);

  const handleToggleTracking = async () => {
    setBusyAction(true);
    try {
      if (state?.recording) {
        const res = await abapDiffApi.stopSession();
        if (res.session) setSelectedSessionId(res.session.id);
      } else {
        const res = await abapDiffApi.startSession();
        setSelectedSessionId(res.session.id);
      }
      await refreshTrackerState();
      await reloadSessions();
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionDetail || sessionDetail.status === 'recording') return;
    setBusyAction(true);
    try {
      await abapDiffApi.deleteSession(sessionDetail.id);
      setSelectedSessionId(null);
      await refreshTrackerState();
      await reloadSessions();
    } finally {
      setBusyAction(false);
    }
  };

  const matchesFilter = useCallback(
    (f: TouchedObjectRecord) => {
      const q = filterText.trim().toLowerCase();
      if (!q) return true;
      return (
        f.objectName.toLowerCase().includes(q) ||
        f.objectType.toLowerCase().includes(q) ||
        f.serverName.toLowerCase().includes(q) ||
        f.filePath.toLowerCase().includes(q) ||
        (f.transport?.toLowerCase().includes(q) ?? false)
      );
    },
    [filterText],
  );

  const selectedRecord: TouchedObjectRecord | null = useMemo(() => {
    if (!sessionDetail || !selection) return null;
    if (selection.turn !== 'all') {
      const turn = sessionDetail.turns.find((t) => String(t.turnIndex) === selection.turn);
      const found = turn?.files.find((f) => f.filePath === selection.filePath);
      if (found) return found;
    }
    return sessionDetail.files.find((f) => f.filePath === selection.filePath) ?? null;
  }, [sessionDetail, selection]);

  const serverGroups = useMemo(() => {
    if (!sessionDetail) return [];
    const map = new Map<string, TouchedObjectRecord[]>();
    for (const f of sessionDetail.files) {
      if (!matchesFilter(f)) continue;
      const list = map.get(f.serverName) ?? [];
      list.push(f);
      map.set(f.serverName, list);
    }
    return [...map.entries()];
  }, [sessionDetail, matchesFilter]);

  const turnGroups = useMemo(() => {
    if (!sessionDetail) return [];
    return [...sessionDetail.turns]
      .reverse()
      .map((t) => ({
        ...t,
        files: t.files.filter(matchesFilter),
      }))
      .filter((t) => t.files.length > 0);
  }, [sessionDetail, matchesFilter]);

  const totalAdds = sessionDetail?.files.reduce((s, f) => s + f.additions, 0) ?? 0;
  const totalDels = sessionDetail?.files.reduce((s, f) => s + f.deletions, 0) ?? 0;

  return (
    <div className="abap-diff-root">
      {/* Top Toolbar */}
      <div className="abap-diff-toolbar">
        <div className="abap-diff-toolbar-left">
          <div className="abap-diff-title">
            <span>ABAP 代码变更追踪</span>
            <span className={`abap-diff-status-badge ${state?.recording ? 'recording' : 'idle'}`}>
              <span className={`abap-diff-dot ${state?.recording ? 'pulse' : ''}`} />
              {state?.recording ? '追踪中' : '未启动'}
            </span>
          </div>

          <button
            type="button"
            disabled={busyAction}
            className={`abap-diff-btn ${state?.recording ? 'danger' : 'primary'}`}
            onClick={() => void handleToggleTracking()}
          >
            {state?.recording ? '关闭追踪' : '启动追踪'}
          </button>

          {sessions.length > 0 && (
            <select
              className="abap-diff-select"
              value={selectedSessionId ?? ''}
              onChange={(e) => setSelectedSessionId(e.target.value || null)}
              title="切换查看当前或历史追踪会话"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.status === 'recording' ? '● ' : ''}
                  {s.title} ({s.filesCount} 对象, +{s.additions}/-{s.deletions})
                </option>
              ))}
            </select>
          )}

          {sessionDetail && sessionDetail.status === 'closed' && (
            <button
              type="button"
              disabled={busyAction}
              className="abap-diff-btn"
              onClick={() => void handleDeleteSession()}
              title="删除此历史记录"
            >
              删除记录
            </button>
          )}
        </div>

        <div className="abap-diff-toolbar-right">
          <div className="abap-diff-segmented">
            <button
              type="button"
              className={`abap-diff-seg-btn ${groupMode === 'turns' ? 'active' : ''}`}
              onClick={() => setGroupMode('turns')}
            >
              按轮次 (Turn)
            </button>
            <button
              type="button"
              className={`abap-diff-seg-btn ${groupMode === 'session' ? 'active' : ''}`}
              onClick={() => setGroupMode('session')}
            >
              按整次会话
            </button>
          </div>

          <button
            type="button"
            className="abap-diff-btn"
            onClick={() => {
              void refreshTrackerState();
              void reloadSessions();
            }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="abap-diff-body">
        {/* Left Navigation */}
        <div className="abap-diff-sidebar">
          <div className="abap-diff-sidebar-top">
            <input
              type="text"
              className="abap-diff-search"
              placeholder="搜索对象名 / 系统 / TR..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {sessionDetail && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.8 }}>
                <span>
                  {sessionDetail.turns.length} 轮对话 · {sessionDetail.files.length} 个对象
                </span>
                <span className="abap-diff-stats">
                  <span className="abap-diff-stat-add">+{totalAdds}</span>
                  <span className="abap-diff-stat-del">-{totalDels}</span>
                </span>
              </div>
            )}
          </div>

          <div className="abap-diff-tree">
            {!sessionDetail ? (
              <div className="abap-diff-empty" style={{ padding: 20 }}>
                <span>暂无追踪会话</span>
                <span style={{ fontSize: 12 }}>点击左上角「启动追踪」后让 AI 修改 ABAP 代码即可在此查看 Diff。</span>
              </div>
            ) : groupMode === 'turns' ? (
              turnGroups.length === 0 ? (
                <div className="abap-diff-empty" style={{ padding: 20 }}>
                  {sessionDetail.status === 'recording'
                    ? '追踪已开启，等待 AI 执行 ABAP 写操作…'
                    : '本次会话未捕获到 ABAP 代码修改。'}
                </div>
              ) : (
                turnGroups.map((turn) => (
                  <div key={turn.turnIndex} style={{ marginBottom: 6 }}>
                    <div className="abap-diff-group-header" title={turn.promptSummary}>
                      <span className="abap-diff-group-prompt">
                        Turn #{turn.turnIndex}: {turn.promptSummary}
                      </span>
                      <span>{turn.files.length}</span>
                    </div>
                    {turn.files.map((f) => {
                      const isSel =
                        selection?.filePath === f.filePath &&
                        selection?.turn === String(turn.turnIndex);
                      return (
                        <FileRow
                          key={`${turn.turnIndex}:${f.filePath}`}
                          record={f}
                          selected={isSel}
                          onSelect={() =>
                            setSelection({ filePath: f.filePath, turn: String(turn.turnIndex) })
                          }
                        />
                      );
                    })}
                  </div>
                ))
              )
            ) : serverGroups.length === 0 ? (
              <div className="abap-diff-empty" style={{ padding: 20 }}>
                {sessionDetail.status === 'recording'
                  ? '追踪已开启，等待 AI 执行 ABAP 写操作…'
                  : '本次会话未捕获到 ABAP 代码修改。'}
              </div>
            ) : (
              serverGroups.map(([srv, files]) => (
                <div key={srv} style={{ marginBottom: 6 }}>
                  <div className="abap-diff-group-header">
                    <span>{srv}</span>
                    <span>{files.length}</span>
                  </div>
                  {files.map((f) => {
                    const isSel =
                      selection?.filePath === f.filePath && selection?.turn === 'all';
                    return (
                      <FileRow
                        key={f.filePath}
                        record={f}
                        selected={isSel}
                        onSelect={() => setSelection({ filePath: f.filePath, turn: 'all' })}
                      />
                    );
                  })}
                </div>
              ))
            )}

            {sessionDetail && sessionDetail.failedCalls.length > 0 && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.18))' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>
                  失败写入记录 ({sessionDetail.failedCalls.length})
                </div>
                {sessionDetail.failedCalls.slice(-5).map((fc, idx) => (
                  <div key={idx} style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                    <code>{fc.toolName}</code> {fc.objectKey}: {fc.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Diff Pane */}
        {selectedRecord ? (
          <DiffViewer
            record={selectedRecord}
            diff={diffDetail}
            loading={diffLoading}
            error={diffError}
          />
        ) : (
          <div className="abap-diff-empty">
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {state?.recording ? 'ABAP 变更追踪运行中' : '准备好追踪 AI 对 SAP ABAP 的修改'}
            </div>
            <div style={{ maxWidth: 460, lineHeight: 1.6 }}>
              {state?.recording
                ? '插件正在只读监听所有 abap-adt* MCP 写操作。每当 AI 修改、创建、删除或激活 ABAP 对象时，会自动拉取 SAP 基线并生成本地 Git Diff。'
                : '点击「启动追踪」开始录制。你可以随时关闭追踪，并在本地安全查看每一轮对话、每一个对象的精确代码改动对比。'}
            </div>
            {!state?.recording && (
              <button
                type="button"
                className="abap-diff-btn primary"
                onClick={() => void handleToggleTracking()}
              >
                立即启动追踪
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Info Bar */}
      <div className="abap-diff-footer-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <span style={{ whiteSpace: 'nowrap' }}>
            已识别 MCP:{' '}
            {state?.serversDetected?.length
              ? state.serversDetected.join(', ')
              : '等待 abap-adt 工具注册'}
          </span>
        </div>
        {state?.repoPath && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
              本地影子 Git: <code>{state.repoPath}</code>
            </span>
            <button
              type="button"
              className="abap-diff-btn"
              style={{ height: 22, padding: '0 8px', fontSize: 11 }}
              onClick={() => {
                void navigator.clipboard?.writeText(state.repoPath).then(() => {
                  setCopiedRepo(true);
                  setTimeout(() => setCopiedRepo(false), 1500);
                });
              }}
            >
              {copiedRepo ? '已复制' : '复制路径'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({
  record,
  selected,
  onSelect,
}: {
  record: TouchedObjectRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`abap-diff-file-row ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      title={record.filePath}
    >
      <span className={`abap-diff-kind-tag abap-diff-kind-${record.changeKind}`}>
        {record.changeKind}
      </span>
      <div className="abap-diff-file-main">
        <div className="abap-diff-file-name">
          {record.objectName}
          {record.includeType ? `.${record.includeType}` : ''}
        </div>
        <div className="abap-diff-file-sub">
          <span>{record.objectType}</span>
          <span>·</span>
          <span>{record.serverName}</span>
          {record.active === false && (
            <span style={{ color: '#d97706' }}>· 未激活</span>
          )}
        </div>
      </div>
      <span className="abap-diff-stats">
        <span className="abap-diff-stat-add">+{record.additions}</span>
        <span className="abap-diff-stat-del">-{record.deletions}</span>
      </span>
    </button>
  );
}
