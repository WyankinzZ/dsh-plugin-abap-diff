import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ChangeKind,
  DiffDetailResponse,
  FailedToolCall,
  TouchedObjectRecord,
  TrackerStateSummary,
  TrackingSession,
  TrackingSessionSummary,
  TurnRecord,
} from '../shared/types.ts';
import type { ShadowGitRepo } from './shadow-git.ts';

interface InternalFileRef {
  baseCommit: string;
  endCommit: string;
  record: TouchedObjectRecord;
}

interface InternalTurn {
  turnIndex: number;
  dshSessionId?: string;
  promptSummary: string;
  startedAt: string;
  endedAt?: string;
  baseCommit: string;
  endCommit: string;
  files: Record<string, InternalFileRef>;
}

interface InternalSession {
  id: string;
  title: string;
  status: 'recording' | 'closed';
  startedAt: string;
  stoppedAt?: string;
  baseCommit: string;
  headCommit: string;
  turns: InternalTurn[];
  files: Record<string, InternalFileRef>;
  failedCalls: FailedToolCall[];
}

interface PersistedStore {
  activeSessionId: string | null;
  sessions: InternalSession[];
}

export interface RecordChangeInput {
  serverName: string;
  objectType: string;
  objectName: string;
  includeType?: string;
  methodName?: string;
  objectUrl?: string;
  filePath: string;
  changeKind: ChangeKind;
  fileBaseCommit: string;
  fileEndCommit: string;
  active: boolean | null;
  transport?: string;
  toolName: string;
  externalPreEdit?: boolean;
  dshSessionId?: string;
}

function summarizePrompt(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '对话变更';
  return cleaned.length > 64 ? `${cleaned.slice(0, 64)}…` : cleaned;
}

function formatSessionTitle(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ABAP 追踪 ${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class SessionStore {
  private readonly storePath: string;
  private readonly git: ShadowGitRepo;
  private data: PersistedStore = { activeSessionId: null, sessions: [] };
  private version = 1;
  private loaded = false;
  private serversDetected = new Set<string>();
  private latestPrompts = new Map<string, string>();
  private openTurnByDshSession = new Map<string, number>();
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, git: ShadowGitRepo) {
    this.storePath = path.join(dataDir, 'sessions.json');
    this.git = git;
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    await this.git.ensureRepo();
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    if (existsSync(this.storePath)) {
      try {
        const raw = await fs.readFile(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as PersistedStore;
        if (parsed && Array.isArray(parsed.sessions)) {
          this.data = {
            activeSessionId: parsed.activeSessionId ?? null,
            sessions: parsed.sessions,
          };
        }
      } catch {
        this.data = { activeSessionId: null, sessions: [] };
      }
    }
    this.loaded = true;
  }

  private scheduleSave(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.saveQueue = this.saveQueue.then(async () => {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.tmp`;
      await fs.writeFile(tmp, snapshot, 'utf8');
      await fs.rename(tmp, this.storePath);
    });
    return this.saveQueue;
  }

  registerDetectedServers(serverNames: string[]): void {
    let changed = false;
    for (const s of serverNames) {
      if (!this.serversDetected.has(s)) {
        this.serversDetected.add(s);
        changed = true;
      }
    }
    if (changed) this.version++;
  }

  getVersion(): number {
    return this.version;
  }

  isRecording(): boolean {
    return this.getActiveSessionInternal() !== null;
  }

  private getActiveSessionInternal(): InternalSession | null {
    if (!this.data.activeSessionId) return null;
    const found = this.data.sessions.find((s) => s.id === this.data.activeSessionId);
    return found && found.status === 'recording' ? found : null;
  }

  async startSession(customTitle?: string): Promise<TrackingSession> {
    await this.init();
    const existing = this.getActiveSessionInternal();
    if (existing) {
      return this.toPublicSession(existing);
    }

    const head = await this.git.ensureRepo();
    const now = new Date();
    const session: InternalSession = {
      id: `abap-${now.getTime()}-${randomUUID().slice(0, 6)}`,
      title: customTitle?.trim() || formatSessionTitle(now),
      status: 'recording',
      startedAt: now.toISOString(),
      baseCommit: head,
      headCommit: head,
      turns: [],
      files: {},
      failedCalls: [],
    };
    this.data.sessions.unshift(session);
    this.data.activeSessionId = session.id;
    this.openTurnByDshSession.clear();
    this.version++;
    await this.scheduleSave();
    return this.toPublicSession(session);
  }

  async stopSession(): Promise<TrackingSession | null> {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return null;

    const now = new Date().toISOString();
    active.status = 'closed';
    active.stoppedAt = now;
    for (const turn of active.turns) {
      if (!turn.endedAt) turn.endedAt = now;
    }
    this.data.activeSessionId = null;
    this.openTurnByDshSession.clear();
    this.version++;
    await this.scheduleSave();
    return this.toPublicSession(active);
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.init();
    const idx = this.data.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    if (this.data.sessions[idx].status === 'recording') {
      throw new Error('Cannot delete an active recording session; stop tracking first.');
    }
    this.data.sessions.splice(idx, 1);
    this.version++;
    await this.scheduleSave();
    return true;
  }

  noteUserPrompt(dshSessionId: string | undefined, text: string): void {
    const key = dshSessionId || '__default__';
    this.latestPrompts.set(key, summarizePrompt(text));
  }

  noteTurnStart(dshSessionId: string | undefined): void {
    const active = this.getActiveSessionInternal();
    if (!active) return;
    const key = dshSessionId || '__default__';
    this.openTurnByDshSession.delete(key);
  }

  async noteTurnEnd(dshSessionId: string | undefined): Promise<void> {
    const active = this.getActiveSessionInternal();
    if (!active) return;
    const key = dshSessionId || '__default__';
    const turnIdx = this.openTurnByDshSession.get(key);
    if (turnIdx === undefined) return;
    const turn = active.turns.find((t) => t.turnIndex === turnIdx);
    if (turn && !turn.endedAt) {
      turn.endedAt = new Date().toISOString();
      this.version++;
      await this.scheduleSave();
    }
    this.openTurnByDshSession.delete(key);
  }

  private ensureTurnForChange(session: InternalSession, dshSessionId: string | undefined, commitBefore: string): InternalTurn {
    const key = dshSessionId || '__default__';
    const existingIdx = this.openTurnByDshSession.get(key);
    if (existingIdx !== undefined) {
      const found = session.turns.find((t) => t.turnIndex === existingIdx);
      if (found) return found;
    }

    const nextIndex = session.turns.length + 1;
    const promptSummary =
      this.latestPrompts.get(key) ??
      this.latestPrompts.get('__default__') ??
      `第 ${nextIndex} 轮对话修改`;

    const turn: InternalTurn = {
      turnIndex: nextIndex,
      dshSessionId,
      promptSummary,
      startedAt: new Date().toISOString(),
      baseCommit: commitBefore,
      endCommit: commitBefore,
      files: {},
    };
    session.turns.push(turn);
    this.openTurnByDshSession.set(key, nextIndex);
    return turn;
  }

  async recordFileChange(input: RecordChangeInput): Promise<void> {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return;

    const now = new Date().toISOString();
    const diff = await this.git.getFileDiff(input.fileBaseCommit, input.fileEndCommit, input.filePath);

    // Update or create session-level file ref (preserve earliest baseCommit!)
    const existingSessionRef = active.files[input.filePath];
    const sessionBaseCommit = existingSessionRef ? existingSessionRef.baseCommit : input.fileBaseCommit;
    const sessionDiff =
      sessionBaseCommit === input.fileBaseCommit
        ? diff
        : await this.git.getFileDiff(sessionBaseCommit, input.fileEndCommit, input.filePath);

    const sessionKind: ChangeKind =
      existingSessionRef?.record.changeKind === 'A' && input.changeKind !== 'D'
        ? 'A'
        : sessionDiff.changeKind;

    active.files[input.filePath] = {
      baseCommit: sessionBaseCommit,
      endCommit: input.fileEndCommit,
      record: {
        filePath: input.filePath,
        serverName: input.serverName,
        objectType: input.objectType,
        objectName: input.objectName,
        includeType: input.includeType,
        methodName: input.methodName,
        objectUrl: input.objectUrl,
        changeKind: sessionKind,
        active: input.active,
        transport: input.transport ?? existingSessionRef?.record.transport,
        additions: sessionDiff.additions,
        deletions: sessionDiff.deletions,
        lastTool: input.toolName,
        updatedAt: now,
        externalPreEdit: Boolean(existingSessionRef?.record.externalPreEdit || input.externalPreEdit),
      },
    };

    // Update or create turn-level file ref
    const turn = this.ensureTurnForChange(active, input.dshSessionId, input.fileBaseCommit);
    const existingTurnRef = turn.files[input.filePath];
    const turnBaseCommit = existingTurnRef ? existingTurnRef.baseCommit : input.fileBaseCommit;
    const turnDiff =
      turnBaseCommit === input.fileBaseCommit
        ? diff
        : await this.git.getFileDiff(turnBaseCommit, input.fileEndCommit, input.filePath);

    turn.files[input.filePath] = {
      baseCommit: turnBaseCommit,
      endCommit: input.fileEndCommit,
      record: {
        filePath: input.filePath,
        serverName: input.serverName,
        objectType: input.objectType,
        objectName: input.objectName,
        includeType: input.includeType,
        methodName: input.methodName,
        objectUrl: input.objectUrl,
        changeKind:
          existingTurnRef?.record.changeKind === 'A' && input.changeKind !== 'D'
            ? 'A'
            : turnDiff.changeKind,
        active: input.active,
        transport: input.transport ?? existingTurnRef?.record.transport,
        additions: turnDiff.additions,
        deletions: turnDiff.deletions,
        lastTool: input.toolName,
        updatedAt: now,
        externalPreEdit: Boolean(existingTurnRef?.record.externalPreEdit || input.externalPreEdit),
      },
    };

    turn.endCommit = input.fileEndCommit;
    active.headCommit = input.fileEndCommit;
    this.version++;
    await this.scheduleSave();
  }

  async markActivated(
    serverName: string,
    target: { filePath?: string; objectType?: string; objectName?: string; allForServer?: boolean },
  ): Promise<void> {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return;

    let changed = false;
    const matchRef = (ref: InternalFileRef) => {
      if (ref.record.serverName !== serverName) return false;
      if (target.allForServer) return true;
      if (target.filePath && ref.record.filePath === target.filePath) return true;
      if (
        target.objectName &&
        ref.record.objectName === target.objectName &&
        (!target.objectType || target.objectType === 'OBJ' || ref.record.objectType === target.objectType)
      ) {
        return true;
      }
      return false;
    };

    for (const ref of Object.values(active.files)) {
      if (matchRef(ref) && ref.record.active !== true) {
        ref.record.active = true;
        changed = true;
      }
    }
    for (const turn of active.turns) {
      for (const ref of Object.values(turn.files)) {
        if (matchRef(ref) && ref.record.active !== true) {
          ref.record.active = true;
          changed = true;
        }
      }
    }

    if (changed) {
      this.version++;
      await this.scheduleSave();
    }
  }

  async recordFailedCall(toolName: string, objectKey: string, error: string): Promise<void> {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return;

    active.failedCalls.push({
      toolName,
      objectKey,
      error: error.slice(0, 500),
      at: new Date().toISOString(),
    });
    if (active.failedCalls.length > 100) {
      active.failedCalls.splice(0, active.failedCalls.length - 100);
    }
    this.version++;
    await this.scheduleSave();
  }

  async getStateSummary(): Promise<TrackerStateSummary> {
    await this.init();
    const active = this.getActiveSessionInternal();
    let activeSummary: TrackerStateSummary['activeSummary'] = null;
    if (active) {
      const files = Object.values(active.files).map((f) => f.record);
      activeSummary = {
        filesCount: files.length,
        additions: files.reduce((s, f) => s + f.additions, 0),
        deletions: files.reduce((s, f) => s + f.deletions, 0),
        turnsCount: active.turns.length,
        inactiveCount: files.filter((f) => f.active === false).length,
      };
    }

    return {
      recording: active !== null,
      activeSessionId: active?.id ?? null,
      version: this.version,
      repoPath: this.git.repoDir,
      serversDetected: [...this.serversDetected].sort(),
      activeSummary,
    };
  }

  async listSessions(): Promise<TrackingSessionSummary[]> {
    await this.init();
    return this.data.sessions.map((s) => {
      const files = Object.values(s.files).map((f) => f.record);
      return {
        id: s.id,
        title: s.title,
        status: s.status,
        startedAt: s.startedAt,
        stoppedAt: s.stoppedAt,
        turnsCount: s.turns.length,
        filesCount: files.length,
        additions: files.reduce((sum, f) => sum + f.additions, 0),
        deletions: files.reduce((sum, f) => sum + f.deletions, 0),
        inactiveCount: files.filter((f) => f.active === false).length,
      };
    });
  }

  async getSession(id: string): Promise<TrackingSession | null> {
    await this.init();
    const s = this.data.sessions.find((item) => item.id === id);
    return s ? this.toPublicSession(s) : null;
  }

  async getDiffDetail(sessionId: string, filePath: string, turnParam?: string): Promise<DiffDetailResponse | null> {
    await this.init();
    const s = this.data.sessions.find((item) => item.id === sessionId);
    if (!s) return null;

    let ref: InternalFileRef | undefined;
    if (turnParam && turnParam !== 'all') {
      const turnNum = Number.parseInt(turnParam, 10);
      const turn = s.turns.find((t) => t.turnIndex === turnNum);
      ref = turn?.files[filePath];
    } else {
      ref = s.files[filePath];
    }

    if (!ref) return null;
    return this.git.getFileDiff(ref.baseCommit, ref.endCommit, filePath);
  }

  private toPublicSession(s: InternalSession): TrackingSession {
    const sortFiles = (filesMap: Record<string, InternalFileRef>): TouchedObjectRecord[] =>
      Object.values(filesMap)
        .map((f) => f.record)
        .sort((a, b) => a.filePath.localeCompare(b.filePath));

    const turns: TurnRecord[] = s.turns.map((t) => ({
      turnIndex: t.turnIndex,
      dshSessionId: t.dshSessionId,
      promptSummary: t.promptSummary,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      baseCommit: t.baseCommit,
      endCommit: t.endCommit,
      files: sortFiles(t.files),
    }));

    return {
      id: s.id,
      title: s.title,
      status: s.status,
      startedAt: s.startedAt,
      stoppedAt: s.stoppedAt,
      baseCommit: s.baseCommit,
      headCommit: s.headCommit,
      turns,
      files: sortFiles(s.files),
      failedCalls: [...s.failedCalls],
    };
  }
}
