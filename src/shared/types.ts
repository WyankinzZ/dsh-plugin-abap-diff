export type ChangeKind = 'A' | 'M' | 'D';

export interface TouchedObjectRecord {
  filePath: string;
  serverName: string;
  objectType: string;
  objectName: string;
  includeType?: string;
  methodName?: string;
  objectUrl?: string;
  changeKind: ChangeKind;
  active: boolean | null;
  transport?: string;
  additions: number;
  deletions: number;
  lastTool: string;
  updatedAt: string;
  externalPreEdit?: boolean;
}

export interface FailedToolCall {
  toolName: string;
  objectKey: string;
  error: string;
  at: string;
}

export interface TurnRecord {
  turnIndex: number;
  dshSessionId?: string;
  promptSummary: string;
  startedAt: string;
  endedAt?: string;
  baseCommit: string;
  endCommit: string;
  files: TouchedObjectRecord[];
}

export interface TrackingSession {
  id: string;
  title: string;
  status: 'recording' | 'closed';
  startedAt: string;
  stoppedAt?: string;
  baseCommit: string;
  headCommit: string;
  turns: TurnRecord[];
  files: TouchedObjectRecord[];
  failedCalls: FailedToolCall[];
}

export interface TrackingSessionSummary {
  id: string;
  title: string;
  status: 'recording' | 'closed';
  startedAt: string;
  stoppedAt?: string;
  turnsCount: number;
  filesCount: number;
  additions: number;
  deletions: number;
  inactiveCount: number;
}

export interface TrackerStateSummary {
  recording: boolean;
  activeSessionId: string | null;
  version: number;
  repoPath: string;
  serversDetected: string[];
  activeSummary: {
    filesCount: number;
    additions: number;
    deletions: number;
    turnsCount: number;
    inactiveCount: number;
  } | null;
}

export interface DiffDetailResponse {
  filePath: string;
  baseCommit: string;
  headCommit: string;
  changeKind: ChangeKind;
  beforeText: string;
  afterText: string;
  additions: number;
  deletions: number;
  unifiedPatch: string;
}
