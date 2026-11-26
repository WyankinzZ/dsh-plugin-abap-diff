import { diffLines } from 'diff';

export type LineKind = 'context' | 'add' | 'del' | 'empty';

export interface UnifiedRow {
  kind: 'context' | 'add' | 'del' | 'gap';
  oldLineNo: number | null;
  newLineNo: number | null;
  text: string;
  hiddenCount?: number;
  gapId?: string;
}

export interface SplitRow {
  kind: 'row' | 'gap';
  leftLineNo: number | null;
  leftText: string;
  leftKind: LineKind;
  rightLineNo: number | null;
  rightText: string;
  rightKind: LineKind;
  hiddenCount?: number;
  gapId?: string;
}

interface RawLine {
  kind: 'context' | 'add' | 'del';
  oldLineNo: number | null;
  newLineNo: number | null;
  text: string;
}

function splitLinesPreserve(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function buildRawDiffLines(beforeText: string, afterText: string): RawLine[] {
  const parts = diffLines(beforeText.replace(/\r\n/g, '\n'), afterText.replace(/\r\n/g, '\n'));
  const result: RawLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const part of parts) {
    const lines = splitLinesPreserve(part.value);
    for (const line of lines) {
      if (part.added) {
        result.push({ kind: 'add', oldLineNo: null, newLineNo: newLine++, text: line });
      } else if (part.removed) {
        result.push({ kind: 'del', oldLineNo: oldLine++, newLineNo: null, text: line });
      } else {
        result.push({ kind: 'context', oldLineNo: oldLine++, newLineNo: newLine++, text: line });
      }
    }
  }
  return result;
}

function computeVisibleMask(lines: RawLine[], contextLines: number, showAll: boolean): boolean[] {
  if (showAll || lines.length === 0) return lines.map(() => true);
  const visible = new Array<boolean>(lines.length).fill(false);
  let hasChanges = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== 'context') {
      hasChanges = true;
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) visible[j] = true;
    }
  }

  if (!hasChanges) {
    return lines.map((_, idx) => idx < 50);
  }
  return visible;
}

export function buildUnifiedRows(
  beforeText: string,
  afterText: string,
  options: { contextLines?: number; showAll?: boolean } = {},
): UnifiedRow[] {
  const raw = buildRawDiffLines(beforeText, afterText);
  const mask = computeVisibleMask(raw, options.contextLines ?? 3, options.showAll ?? false);
  const rows: UnifiedRow[] = [];

  let i = 0;
  while (i < raw.length) {
    if (mask[i]) {
      rows.push(raw[i]);
      i++;
    } else {
      const start = i;
      while (i < raw.length && !mask[i]) i++;
      rows.push({
        kind: 'gap',
        oldLineNo: null,
        newLineNo: null,
        text: `已折叠 ${i - start} 行未修改代码`,
        hiddenCount: i - start,
        gapId: `gap-${start}-${i}`,
      });
    }
  }
  return rows;
}

export function buildSplitRows(
  beforeText: string,
  afterText: string,
  options: { contextLines?: number; showAll?: boolean } = {},
): SplitRow[] {
  const raw = buildRawDiffLines(beforeText, afterText);
  const mask = computeVisibleMask(raw, options.contextLines ?? 3, options.showAll ?? false);
  const rows: SplitRow[] = [];

  let i = 0;
  while (i < raw.length) {
    if (!mask[i]) {
      const start = i;
      while (i < raw.length && !mask[i]) i++;
      rows.push({
        kind: 'gap',
        leftLineNo: null,
        leftText: `已折叠 ${i - start} 行未修改代码`,
        leftKind: 'context',
        rightLineNo: null,
        rightText: '',
        rightKind: 'context',
        hiddenCount: i - start,
        gapId: `gap-${start}-${i}`,
      });
      continue;
    }

    if (raw[i].kind === 'context') {
      rows.push({
        kind: 'row',
        leftLineNo: raw[i].oldLineNo,
        leftText: raw[i].text,
        leftKind: 'context',
        rightLineNo: raw[i].newLineNo,
        rightText: raw[i].text,
        rightKind: 'context',
      });
      i++;
      continue;
    }

    // Group consecutive del + add block into aligned side-by-side pairs
    const dels: RawLine[] = [];
    const adds: RawLine[] = [];
    while (i < raw.length && raw[i].kind === 'del') {
      dels.push(raw[i]);
      i++;
    }
    while (i < raw.length && raw[i].kind === 'add') {
      adds.push(raw[i]);
      i++;
    }

    const pairCount = Math.max(dels.length, adds.length);
    for (let k = 0; k < pairCount; k++) {
      const d = dels[k];
      const a = adds[k];
      rows.push({
        kind: 'row',
        leftLineNo: d ? d.oldLineNo : null,
        leftText: d ? d.text : '',
        leftKind: d ? 'del' : 'empty',
        rightLineNo: a ? a.newLineNo : null,
        rightText: a ? a.text : '',
        rightKind: a ? 'add' : 'empty',
      });
    }
  }

  return rows;
}

export interface AbapToken {
  kind: 'plain' | 'keyword' | 'comment' | 'string' | 'number';
  text: string;
}

const ABAP_KEYWORDS = new Set([
  'REPORT', 'PROGRAM', 'INCLUDE', 'FUNCTION', 'ENDFUNCTION', 'CLASS', 'ENDCLASS',
  'INTERFACE', 'ENDINTERFACE', 'METHOD', 'ENDMETHOD', 'FORM', 'ENDFORM',
  'DEFINITION', 'IMPLEMENTATION', 'PUBLIC', 'PROTECTED', 'PRIVATE', 'SECTION',
  'CREATE', 'INHERITING', 'FROM', 'FOR', 'TESTING', 'RISK', 'LEVEL', 'DURATION',
  'METHODS', 'CLASS-METHODS', 'DATA', 'CLASS-DATA', 'CONSTANTS', 'TYPES', 'BEGIN', 'END', 'OF',
  'FIELD-SYMBOLS', 'STATICS', 'PARAMETERS', 'SELECT-OPTIONS', 'TABLES',
  'IMPORTING', 'EXPORTING', 'CHANGING', 'RETURNING', 'RAISING', 'EXCEPTIONS',
  'TYPE', 'LIKE', 'REF', 'TO', 'TABLE', 'STANDARD', 'SORTED', 'HASHED', 'WITH', 'KEY',
  'VALUE', 'CORRESPONDING', 'CONV', 'CAST', 'NEW', 'COND', 'SWITCH', 'LET', 'IN',
  'IF', 'ELSEIF', 'ELSE', 'ENDIF', 'CASE', 'WHEN', 'OTHERS', 'ENDCASE',
  'DO', 'ENDDO', 'WHILE', 'ENDWHILE', 'LOOP', 'AT', 'INTO', 'ASSIGNING', 'REFERENCE', 'ENDLOOP',
  'SELECT', 'SINGLE', 'UP', 'ROWS', 'WHERE', 'ORDER', 'BY', 'GROUP', 'HAVING', 'JOIN', 'INNER', 'LEFT', 'ON', 'ENDSELECT',
  'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'APPEND', 'CLEAR', 'REFRESH', 'FREE', 'SORT', 'READ',
  'TRY', 'CATCH', 'CLEANUP', 'ENDTRY', 'RAISE', 'EXCEPTION', 'MESSAGE',
  'CALL', 'PERFORM', 'SUBMIT', 'RETURN', 'EXIT', 'CONTINUE', 'CHECK', 'ASSERT',
  'AND', 'OR', 'NOT', 'IS', 'INITIAL', 'BOUND', 'ASSIGNED', 'EQ', 'NE', 'LT', 'LE', 'GT', 'GE',
  'ABAP_TRUE', 'ABAP_FALSE', 'SY-SUBRC', 'SY-TABIX', 'ME', 'SUPER',
]);

export function tokenizeAbapLine(line: string): AbapToken[] {
  if (!line) return [];
  if (line.startsWith('*')) {
    return [{ kind: 'comment', text: line }];
  }

  const tokens: AbapToken[] = [];
  const regex = /("(?:.*)$)|('(?:''|[^'])*')|(`(?:``|[^`])*`)|(\b[A-Za-z_][A-Za-z0-9_-]*\b)|(\b\d+\b)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ kind: 'plain', text: line.slice(lastIdx, match.index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'comment', text: match[1] });
    } else if (match[2] !== undefined || match[3] !== undefined) {
      tokens.push({ kind: 'string', text: match[0] });
    } else if (match[4] !== undefined) {
      const upper = match[4].toUpperCase();
      tokens.push({
        kind: ABAP_KEYWORDS.has(upper) ? 'keyword' : 'plain',
        text: match[4],
      });
    } else if (match[5] !== undefined) {
      tokens.push({ kind: 'number', text: match[5] });
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < line.length) {
    tokens.push({ kind: 'plain', text: line.slice(lastIdx) });
  }
  return tokens;
}
