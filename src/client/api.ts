import type {
  DiffDetailResponse,
  TrackerStateSummary,
  TrackingSession,
  TrackingSessionSummary,
} from '../shared/types.ts';

const API_BASE = '/dsh-abap-diff';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const abapDiffApi = {
  getState: () => fetchJson<TrackerStateSummary>(`${API_BASE}/state`),
  listSessions: () => fetchJson<{ sessions: TrackingSessionSummary[] }>(`${API_BASE}/sessions`),
  getSession: (id: string) =>
    fetchJson<{ session: TrackingSession }>(`${API_BASE}/sessions/${encodeURIComponent(id)}`),
  getDiff: (id: string, filePath: string, turn: string = 'all') =>
    fetchJson<{ diff: DiffDetailResponse }>(
      `${API_BASE}/sessions/${encodeURIComponent(id)}/diff?file=${encodeURIComponent(filePath)}&turn=${encodeURIComponent(turn)}`,
    ),
  startSession: (title?: string) =>
    fetchJson<{ session: TrackingSession }>(`${API_BASE}/sessions/start`, {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  stopSession: () =>
    fetchJson<{ session: TrackingSession | null }>(`${API_BASE}/sessions/stop`, {
      method: 'POST',
      body: '{}',
    }),
  deleteSession: (id: string) =>
    fetchJson<{ ok: boolean }>(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

// Shared reactive poll store for HeaderPill + Main Workbench
type StateListener = () => void;

let currentState: TrackerStateSummary | null = null;
let currentError: string | null = null;
const listeners = new Set<StateListener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function notify(): void {
  for (const fn of listeners) fn();
}

export async function refreshTrackerState(): Promise<TrackerStateSummary | null> {
  if (inFlight) return currentState;
  inFlight = true;
  try {
    const next = await abapDiffApi.getState();
    currentState = next;
    currentError = null;
    notify();
    return next;
  } catch (err) {
    currentError = err instanceof Error ? err.message : String(err);
    notify();
    return currentState;
  } finally {
    inFlight = false;
  }
}

function scheduleNextPoll(): void {
  if (timer !== null) clearTimeout(timer);
  if (listeners.size === 0) {
    timer = null;
    return;
  }
  const interval = currentState?.recording ? 1500 : 4000;
  timer = setTimeout(async () => {
    if (typeof document === 'undefined' || !document.hidden) {
      await refreshTrackerState();
    }
    scheduleNextPoll();
  }, interval);
}

export function subscribeTrackerState(fn: StateListener): () => void {
  listeners.add(fn);
  if (listeners.size === 1) {
    void refreshTrackerState().then(() => scheduleNextPoll());
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export function getTrackerSnapshot(): { state: TrackerStateSummary | null; error: string | null } {
  return { state: currentState, error: currentError };
}
