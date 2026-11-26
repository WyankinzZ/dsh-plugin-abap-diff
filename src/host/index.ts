import os from 'node:os';
import path from 'node:path';
import { attachAbapInterceptor } from './interceptor.ts';
import { createAbapDiffHttpHandler, ROUTE_PREFIX } from './routes.ts';
import { SessionStore } from './session-store.ts';
import { ShadowGitRepo } from './shadow-git.ts';

export const name = 'abap-diff';
export const inject = ['webServer', 'tools'];

export interface AbapDiffPluginConfig {
  dataDir?: string;
}

function resolveDshHomeDir(): string {
  const envHome = process.env.DSH_HOME;
  if (envHome && envHome.trim().length > 0) {
    const trimmed = envHome.trim();
    if (trimmed === '~') return os.homedir();
    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
      return path.join(os.homedir(), trimmed.slice(2));
    }
    return path.resolve(trimmed);
  }
  return path.join(os.homedir(), '.dsh');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apply(ctx: any, config: AbapDiffPluginConfig = {}): void {
  const dataDir = config.dataDir?.trim() || path.join(resolveDshHomeDir(), 'abap-diff');
  const git = new ShadowGitRepo(path.join(dataDir, 'repo'));
  const store = new SessionStore(dataDir, git);

  void store.init().catch((err) => {
    ctx.logger?.error?.(`[abap-diff] init failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  // 1. Register HTTP API routes for DSH Web UI
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: createAbapDiffHttpHandler(store),
      }),
    'abap-diff: http routes',
  );

  // 2. Attach read-only MCP tool & session lifecycle interceptors
  ctx.effect(() => attachAbapInterceptor(ctx, git, store), 'abap-diff: mcp interceptor');

  // 3. Optional /abap-diff slash command (only if commands service is mounted)
  ctx.effect(() => {
    const commands = ctx.get?.('commands');
    if (!commands || typeof commands.register !== 'function') return () => {};
    return commands.register({
      name: 'abap-diff',
      description: '控制 ABAP 代码变更追踪：start / stop / status',
      input: { hint: '[start | stop | status]' },
      handler: async ({ rawInput }: { rawInput: string }) => {
        const sub = rawInput.trim().toLowerCase() || 'status';
        if (sub === 'start') {
          const s = await store.startSession();
          return {
            kind: 'success',
            text: `已启动 ABAP 变更追踪 (${s.title})，可在左侧「ABAP Diff」面板查看实时对比。`,
          };
        }
        if (sub === 'stop') {
          const stopped = await store.stopSession();
          if (!stopped) {
            return { kind: 'success', text: '当前未在追踪中。' };
          }
          const add = stopped.files.reduce((n, f) => n + f.additions, 0);
          const del = stopped.files.reduce((n, f) => n + f.deletions, 0);
          return {
            kind: 'success',
            text: `已停止追踪 (${stopped.title})：共变更 ${stopped.files.length} 个对象 (+${add} / -${del})，本地仓库：${git.repoDir}`,
          };
        }
        const state = await store.getStateSummary();
        if (!state.recording || !state.activeSummary) {
          return {
            kind: 'success',
            text: `ABAP 追踪当前未启动。输入 /abap-diff start 或在界面顶部点击「开启追踪」。`,
          };
        }
        return {
          kind: 'success',
          text: `ABAP 追踪进行中：已记录 ${state.activeSummary.turnsCount} 轮对话、${state.activeSummary.filesCount} 个对象 (+${state.activeSummary.additions} / -${state.activeSummary.deletions})。`,
        };
      },
    });
  }, 'abap-diff: slash command');
}
