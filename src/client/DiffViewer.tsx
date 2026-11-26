import React, { useMemo, useState } from 'react';
import type { DiffDetailResponse, TouchedObjectRecord } from '../shared/types.ts';
import { buildSplitRows, buildUnifiedRows, tokenizeAbapLine } from './diff-engine.ts';

interface DiffViewerProps {
  record: TouchedObjectRecord;
  diff: DiffDetailResponse | null;
  loading: boolean;
  error: string | null;
}

function AbapHighlightedText({ text }: { text: string }) {
  const tokens = useMemo(() => tokenizeAbapLine(text), [text]);
  if (tokens.length === 0) return <>&nbsp;</>;
  return (
    <>
      {tokens.map((tok, idx) => {
        if (tok.kind === 'plain') return <React.Fragment key={idx}>{tok.text}</React.Fragment>;
        return (
          <span key={idx} className={`abap-tok-${tok.kind}`}>
            {tok.text}
          </span>
        );
      })}
    </>
  );
}

export function DiffViewer({ record, diff, loading, error }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [showAll, setShowAll] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const splitRows = useMemo(() => {
    if (!diff) return [];
    return buildSplitRows(diff.beforeText, diff.afterText, { contextLines: 3, showAll });
  }, [diff, showAll]);

  const unifiedRows = useMemo(() => {
    if (!diff) return [];
    return buildUnifiedRows(diff.beforeText, diff.afterText, { contextLines: 3, showAll });
  }, [diff, showAll]);

  const copyText = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 1500);
    });
  };

  return (
    <div className="abap-diff-viewer">
      <div className="abap-diff-viewer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`abap-diff-kind-tag abap-diff-kind-${record.changeKind}`}>
            {record.changeKind}
          </span>
          <strong style={{ fontSize: 13 }}>
            {record.objectType} {record.objectName}
            {record.includeType ? ` (${record.includeType})` : ''}
          </strong>
          <span className="abap-diff-meta-pill">{record.serverName}</span>
          {record.active === true && (
            <span className="abap-diff-meta-pill active-ok">● 已激活</span>
          )}
          {record.active === false && (
            <span className="abap-diff-meta-pill active-warn">⚠ 未激活</span>
          )}
          {record.transport && (
            <span className="abap-diff-meta-pill">TR: {record.transport}</span>
          )}
          {record.externalPreEdit && (
            <span className="abap-diff-meta-pill" title="修改前检测到 SAP 服务器上有未同步的人工改动，已自动分离基线">
              含外部变更基线
            </span>
          )}
          <span className="abap-diff-stats">
            <span className="abap-diff-stat-add">+{diff?.additions ?? record.additions}</span>
            <span className="abap-diff-stat-del">-{diff?.deletions ?? record.deletions}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="abap-diff-segmented">
            <button
              type="button"
              className={`abap-diff-seg-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
            >
              左右分栏
            </button>
            <button
              type="button"
              className={`abap-diff-seg-btn ${viewMode === 'unified' ? 'active' : ''}`}
              onClick={() => setViewMode('unified')}
            >
              行内对比
            </button>
          </div>

          <button
            type="button"
            className="abap-diff-btn"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? '仅看变更上下文' : '展开全部源码'}
          </button>

          {diff?.unifiedPatch && (
            <button
              type="button"
              className="abap-diff-btn"
              onClick={() => copyText(diff.unifiedPatch, 'patch')}
            >
              {copiedLabel === 'patch' ? '已复制 Patch' : '复制 Diff'}
            </button>
          )}
        </div>
      </div>

      {loading && !diff ? (
        <div className="abap-diff-empty">正在读取本地 Git Diff…</div>
      ) : error ? (
        <div className="abap-diff-empty" style={{ color: '#dc2626' }}>
          读取 Diff 失败：{error}
        </div>
      ) : !diff ? (
        <div className="abap-diff-empty">未找到变更内容。</div>
      ) : viewMode === 'split' ? (
        <div className="abap-diff-code-scroll">
          <table className="abap-diff-table">
            <colgroup>
              <col style={{ width: 46 }} />
              <col style={{ width: 'calc(50% - 46px)' }} />
              <col style={{ width: 46 }} />
              <col style={{ width: 'calc(50% - 46px)' }} />
            </colgroup>
            <tbody>
              {splitRows.map((row, idx) => {
                if (row.kind === 'gap') {
                  return (
                    <tr key={row.gapId ?? idx} className="abap-diff-gap-row">
                      <td colSpan={4}>
                        <button
                          type="button"
                          onClick={() => setShowAll(true)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontSize: 11,
                          }}
                        >
                          ⋯ {row.leftText}（点击展开全文）
                        </button>
                      </td>
                    </tr>
                  );
                }

                const leftCls =
                  row.leftKind === 'del'
                    ? 'abap-diff-line-del'
                    : row.leftKind === 'empty'
                      ? 'abap-diff-line-empty'
                      : '';
                const rightCls =
                  row.rightKind === 'add'
                    ? 'abap-diff-line-add'
                    : row.rightKind === 'empty'
                      ? 'abap-diff-line-empty'
                      : '';

                return (
                  <tr key={idx}>
                    <td className={`abap-diff-ln ${leftCls}`}>{row.leftLineNo ?? ''}</td>
                    <td
                      className={`abap-diff-code-cell ${leftCls}`}
                      style={{ borderRight: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))' }}
                    >
                      {row.leftKind === 'empty' ? (
                        <>&nbsp;</>
                      ) : (
                        <AbapHighlightedText text={row.leftText} />
                      )}
                    </td>
                    <td className={`abap-diff-ln ${rightCls}`}>{row.rightLineNo ?? ''}</td>
                    <td className={`abap-diff-code-cell ${rightCls}`}>
                      {row.rightKind === 'empty' ? (
                        <>&nbsp;</>
                      ) : (
                        <AbapHighlightedText text={row.rightText} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="abap-diff-code-scroll">
          <table className="abap-diff-table">
            <colgroup>
              <col style={{ width: 46 }} />
              <col style={{ width: 46 }} />
              <col style={{ width: 20 }} />
              <col />
            </colgroup>
            <tbody>
              {unifiedRows.map((row, idx) => {
                if (row.kind === 'gap') {
                  return (
                    <tr key={row.gapId ?? idx} className="abap-diff-gap-row">
                      <td colSpan={4}>
                        <button
                          type="button"
                          onClick={() => setShowAll(true)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontSize: 11,
                          }}
                        >
                          ⋯ {row.text}（点击展开全文）
                        </button>
                      </td>
                    </tr>
                  );
                }

                const rowCls =
                  row.kind === 'add'
                    ? 'abap-diff-line-add'
                    : row.kind === 'del'
                      ? 'abap-diff-line-del'
                      : '';
                const sign = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' ';

                return (
                  <tr key={idx} className={rowCls}>
                    <td className="abap-diff-ln">{row.oldLineNo ?? ''}</td>
                    <td className="abap-diff-ln">{row.newLineNo ?? ''}</td>
                    <td className="abap-diff-sign">{sign}</td>
                    <td className="abap-diff-code-cell">
                      <AbapHighlightedText text={row.text} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
