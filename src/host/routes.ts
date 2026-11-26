import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from './session-store.ts';

export const ROUTE_PREFIX = '/dsh-abap-diff';
const MAX_BODY_BYTES = 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache, no-store',
  });
  res.end(body);
}

export function createAbapDiffHttpHandler(store: SessionStore) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const method = (req.method ?? 'GET').toUpperCase();
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathPart = url.pathname.startsWith(ROUTE_PREFIX)
        ? url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, '')
        : url.pathname.replace(/^\/+/, '');

      if (method === 'GET' && (pathPart === '' || pathPart === 'state')) {
        const state = await store.getStateSummary();
        sendJson(res, 200, state);
        return;
      }

      if (method === 'GET' && pathPart === 'sessions') {
        const sessions = await store.listSessions();
        sendJson(res, 200, { sessions });
        return;
      }

      if (method === 'POST' && pathPart === 'sessions/start') {
        const raw = await readBody(req);
        let title: string | undefined;
        if (raw.trim()) {
          try {
            const body = JSON.parse(raw) as { title?: unknown };
            if (typeof body?.title === 'string') title = body.title;
          } catch {
            sendJson(res, 400, { error: 'Invalid JSON body' });
            return;
          }
        }
        const session = await store.startSession(title);
        sendJson(res, 200, { session });
        return;
      }

      if (method === 'POST' && pathPart === 'sessions/stop') {
        const session = await store.stopSession();
        sendJson(res, 200, { session });
        return;
      }

      const diffMatch = /^sessions\/([^/]+)\/diff$/.exec(pathPart);
      if (method === 'GET' && diffMatch) {
        const id = decodeURIComponent(diffMatch[1]);
        const filePath = url.searchParams.get('file') ?? '';
        const turn = url.searchParams.get('turn') ?? 'all';
        if (!filePath) {
          sendJson(res, 400, { error: 'Missing required query parameter: file' });
          return;
        }
        const diff = await store.getDiffDetail(id, filePath, turn);
        if (!diff) {
          sendJson(res, 404, { error: 'Diff not found for session/file' });
          return;
        }
        sendJson(res, 200, { diff });
        return;
      }

      const sessionMatch = /^sessions\/([^/]+)$/.exec(pathPart);
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        if (method === 'GET') {
          const session = await store.getSession(id);
          if (!session) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          sendJson(res, 200, { session });
          return;
        }
        if (method === 'DELETE') {
          const deleted = await store.deleteSession(id);
          if (!deleted) {
            sendJson(res, 404, { error: 'Session not found' });
            return;
          }
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      sendJson(res, 404, { error: `Unknown route: ${method} ${url.pathname}` });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}
