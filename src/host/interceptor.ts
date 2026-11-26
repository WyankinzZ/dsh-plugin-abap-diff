import type { ChangeKind } from '../shared/types.ts';
import type { SessionStore } from './session-store.ts';
import type { ShadowGitRepo } from './shadow-git.ts';
import {
  extractTextFromToolOutput,
  isAbapServerName,
  normalizeNewlines,
  parseMcpToolName,
  resolveWriteIntent,
  type ObjectTargetSpec,
  type WriteIntent,
} from './tool-registry.ts';

interface TargetSnapshot {
  target: ObjectTargetSpec;
  fileBaseCommit: string;
  existedBefore: boolean;
  externalPreEdit: boolean;
}

interface PendingCall {
  serverName: string;
  intent: WriteIntent;
  snapshots: TargetSnapshot[];
  dshSessionId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeReadTool(ctx: any, serverName: string, rawToolName: string, args: Record<string, unknown>): Promise<string | null> {
  const publicName = `mcp__${serverName}__${rawToolName}`;
  const toolDef = ctx.tools?.get?.(publicName);
  if (!toolDef || typeof toolDef.execute !== 'function') return null;

  try {
    const output = await toolDef.execute(args, {
      signal: AbortSignal.timeout(25_000),
      callId: `abap-diff-read-${Date.now()}`,
      name: publicName,
      arguments: args,
    });
    return extractTextFromToolOutput(output);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryReadTarget(ctx: any, target: ObjectTargetSpec): Promise<string | null> {
  if (!target.readCall) return null;
  const primary = await invokeReadTool(ctx, target.serverName, target.readCall.rawToolName, target.readCall.args);
  if (primary !== null) return primary;

  // Fallback to dedicated legacy read tools if GetSource isn't exposed or fails
  if (target.readCall.rawToolName === 'GetSource') {
    const type = target.objectType.toUpperCase();
    if (type === 'PROG') {
      return invokeReadTool(ctx, target.serverName, 'GetProgram', { program_name: target.objectName });
    }
    if (type === 'CLAS') {
      if (target.includeType && target.includeType !== 'main') {
        return invokeReadTool(ctx, target.serverName, 'GetClassInclude', {
          class_name: target.objectName,
          include_type: target.includeType,
        });
      }
      return invokeReadTool(ctx, target.serverName, 'GetClass', { class_name: target.objectName });
    }
    if (type === 'INTF') {
      return invokeReadTool(ctx, target.serverName, 'GetInterface', { interface_name: target.objectName });
    }
    if (type === 'INCL') {
      return invokeReadTool(ctx, target.serverName, 'GetInclude', { include_name: target.objectName });
    }
    if (type === 'FUNC' && target.parent) {
      return invokeReadTool(ctx, target.serverName, 'GetFunction', {
        function_name: target.objectName,
        function_group: target.parent,
      });
    }
  }
  return null;
}

function isAbapMcpServer(ctx: any, serverName: string): boolean {
  if (isAbapServerName(serverName)) return true;
  const hasGetSource = Boolean(ctx.tools?.get?.(`mcp__${serverName}__GetSource`));
  const hasEditSource = Boolean(ctx.tools?.get?.(`mcp__${serverName}__EditSource`));
  return hasGetSource || hasEditSource;
}

function scanRegisteredServers(ctx: any, store: SessionStore): void {
  try {
    const view = ctx.tools?.view?.();
    const names: Iterable<string> | undefined = view?.knownNames;
    if (!names) return;
    const found = new Set<string>();
    for (const fullName of names) {
      const parsed = parseMcpToolName(fullName);
      if (parsed && isAbapServerName(parsed.serverName)) {
        found.add(parsed.serverName);
      }
    }
    if (found.size > 0) {
      store.registerDetectedServers([...found]);
    }
  } catch {
    // ignore scan errors
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function attachAbapInterceptor(ctx: any, git: ShadowGitRepo, store: SessionStore): () => void {
  const pendingCalls = new Map<string, PendingCall>();
  const callSessionMap = new Map<string, string>();
  let latestActiveDshSessionId: string | undefined;

  scanRegisteredServers(ctx, store);

  const offToolsChange = ctx.on('tools/change', () => {
    scanRegisteredServers(ctx, store);
  });

  const offSessionEvent = ctx.on('session/event', (session: any, event: any) => {
    try {
      const dshSessionId =
        typeof session?.id === 'string'
          ? session.id
          : typeof session?.header?.id === 'string'
            ? session.header.id
            : undefined;
      if (dshSessionId) latestActiveDshSessionId = dshSessionId;

      const type = event?.type;
      if (type === 'user/message') {
        const content = event?.data?.content;
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          text = content
            .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
            .map((b: any) => b.text)
            .join(' ');
        }
        if (text) store.noteUserPrompt(dshSessionId, text);
      } else if (type === 'turn/start') {
        store.noteTurnStart(dshSessionId);
      } else if (type === 'turn/end') {
        void store.noteTurnEnd(dshSessionId);
      } else if (type === 'tool/call') {
        const callId = event?.data?.callId ?? event?.data?.id;
        if (typeof callId === 'string' && dshSessionId) {
          callSessionMap.set(callId, dshSessionId);
        }
      }
    } catch {
      // never disrupt host session bus
    }
  });

  const offPre = ctx.on('tools/pre-execute', async (exec: any, next: () => Promise<unknown>) => {
    try {
      if (store.isRecording()) {
        const parsedName = parseMcpToolName(String(exec?.name ?? ''));
        if (parsedName && isAbapMcpServer(ctx, parsedName.serverName)) {
          store.registerDetectedServers([parsedName.serverName]);
          const intent = resolveWriteIntent(parsedName.serverName, parsedName.rawName, exec?.arguments);
          if (intent) {
            const dshSessionId =
              callSessionMap.get(String(exec?.callId ?? '')) ??
              (typeof exec?.agent?.sessionId === 'string' ? exec.agent.sessionId : undefined) ??
              latestActiveDshSessionId;

            const snapshots: TargetSnapshot[] = [];

            if (intent.kind === 'edit' || intent.kind === 'create' || intent.kind === 'delete') {
              for (const target of intent.targets) {
                const working = await git.readWorkingFile(target.filePath);
                let fileBaseCommit = await git.getHead();
                let existedBefore = working !== null;
                let externalPreEdit = false;

                if (intent.kind === 'edit' || intent.kind === 'delete') {
                  const sapSource = await tryReadTarget(ctx, target);
                  if (sapSource !== null) {
                    existedBefore = true;
                    if (working === null) {
                      const baseRes = await git.commitFile(
                        target.filePath,
                        sapSource,
                        `[baseline] ${target.serverName} ${target.objectType} ${target.objectName}`,
                      );
                      fileBaseCommit = baseRes.commitHash;
                    } else if (working !== sapSource) {
                      const extRes = await git.commitFile(
                        target.filePath,
                        sapSource,
                        `[external] ${target.serverName} ${target.objectType} ${target.objectName}`,
                      );
                      fileBaseCommit = extRes.commitHash;
                      externalPreEdit = true;
                    }
                  } else if (working === null) {
                    existedBefore = false;
                  }
                }

                snapshots.push({
                  target,
                  fileBaseCommit,
                  existedBefore,
                  externalPreEdit,
                });
              }
            }

            if (exec?.callId) {
              pendingCalls.set(String(exec.callId), {
                serverName: parsedName.serverName,
                intent,
                snapshots,
                dshSessionId,
              });
            }
          }
        }
      }
    } catch (err) {
      ctx.logger?.warn?.(`[abap-diff] pre-execute hook error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return next();
  });

  const offPost = ctx.on('tools/post-execute', async (exec: any, result: any, next: () => Promise<unknown>) => {
    const callId = String(exec?.callId ?? '');
    const pending = callId ? pendingCalls.get(callId) : undefined;
    if (callId) {
      pendingCalls.delete(callId);
      callSessionMap.delete(callId);
    }

    if (pending) {
      try {
        if (store.isRecording()) {
          if (result?.isError) {
            const errText =
              result?.error?.message ??
              extractTextFromToolOutput(result) ??
              'Tool execution failed';
            const firstTarget = pending.intent.targets[0];
            const objKey = firstTarget
              ? `${firstTarget.serverName}/${firstTarget.objectType}/${firstTarget.objectName}`
              : pending.serverName;
            await store.recordFailedCall(pending.intent.rawToolName, objKey, String(errText));
          } else {
            const { intent, snapshots, dshSessionId } = pending;

            if (intent.kind === 'activate') {
              for (const target of intent.targets) {
                await store.markActivated(pending.serverName, {
                  filePath: target.filePath,
                  objectType: target.objectType,
                  objectName: target.objectName,
                });
              }
            } else if (intent.kind === 'activate-package') {
              await store.markActivated(pending.serverName, { allForServer: true });
            } else if (intent.kind === 'delete') {
              for (const snap of snapshots) {
                const { target, fileBaseCommit, externalPreEdit } = snap;
                const delRes = await git.deleteFile(
                  target.filePath,
                  `[ai][${intent.rawToolName}] delete ${target.serverName} ${target.objectType} ${target.objectName}`,
                );
                if (delRes.changed) {
                  await store.recordFileChange({
                    serverName: target.serverName,
                    objectType: target.objectType,
                    objectName: target.objectName,
                    includeType: target.includeType,
                    methodName: target.methodName,
                    objectUrl: target.objectUrl,
                    filePath: target.filePath,
                    changeKind: 'D',
                    fileBaseCommit,
                    fileEndCommit: delRes.commitHash,
                    active: null,
                    transport: target.transport,
                    toolName: intent.rawToolName,
                    externalPreEdit,
                    dshSessionId,
                  });
                }
              }
            } else {
              for (const snap of snapshots) {
                const { target, fileBaseCommit, existedBefore, externalPreEdit } = snap;
                const freshSource = await tryReadTarget(ctx, target);
                const finalSource =
                  freshSource !== null
                    ? freshSource
                    : target.fallbackSource !== undefined
                      ? normalizeNewlines(target.fallbackSource)
                      : null;

                if (finalSource === null) continue;

                const commitRes = await git.commitFile(
                  target.filePath,
                  finalSource,
                  `[ai][${intent.rawToolName}] ${target.serverName} ${target.objectType} ${target.objectName}`,
                );

                if (commitRes.changed) {
                  const kind: ChangeKind = existedBefore ? 'M' : 'A';
                  await store.recordFileChange({
                    serverName: target.serverName,
                    objectType: target.objectType,
                    objectName: target.objectName,
                    includeType: target.includeType,
                    methodName: target.methodName,
                    objectUrl: target.objectUrl,
                    filePath: target.filePath,
                    changeKind: kind,
                    fileBaseCommit,
                    fileEndCommit: commitRes.commitHash,
                    active: target.autoActivated ? true : false,
                    transport: target.transport,
                    toolName: intent.rawToolName,
                    externalPreEdit,
                    dshSessionId,
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        ctx.logger?.warn?.(`[abap-diff] post-execute hook error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return next();
  });

  return () => {
    offPre();
    offPost();
    offSessionEvent();
    offToolsChange();
    pendingCalls.clear();
    callSessionMap.clear();
  };
}
