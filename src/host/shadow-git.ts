import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ChangeKind, DiffDetailResponse } from '../shared/types.ts';
import { normalizeNewlines } from './tool-registry.ts';

const execFileAsync = promisify(execFile);

export interface GitNumStatEntry {
  filePath: string;
  changeKind: ChangeKind;
  additions: number;
  deletions: number;
}

export class ShadowGitRepo {
  readonly repoDir: string;
  private lock: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(repoDir: string) {
    this.repoDir = path.resolve(repoDir);
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((r) => {
      release = r;
    });
    return prev.then(fn).finally(() => release());
  }

  private resolveSafePath(relPath: string): { absPath: string; gitPath: string } {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absPath = path.resolve(this.repoDir, normalized);
    const rel = path.relative(this.repoDir, absPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Invalid shadow repo path: ${relPath}`);
    }
    return { absPath, gitPath: rel.replace(/\\/g, '/') };
  }

  private async git(args: string[], allowNonZero = false): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const { stdout, stderr } = await execFileAsync('git', ['-c', 'core.quotepath=false', ...args], {
        cwd: this.repoDir,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      });
      return { stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      if (allowNonZero) {
        return {
          stdout: String(e.stdout ?? ''),
          stderr: String(e.stderr ?? ''),
          code: typeof e.code === 'number' ? e.code : 1,
        };
      }
      throw new Error(`git ${args.join(' ')} failed: ${e.stderr || e.message || String(err)}`);
    }
  }

  async ensureRepo(): Promise<string> {
    return this.withLock(async () => {
      return this.ensureRepoUnlocked();
    });
  }

  private async ensureRepoUnlocked(): Promise<string> {
    if (this.initialized && existsSync(path.join(this.repoDir, '.git'))) {
      const head = await this.git(['rev-parse', 'HEAD'], true);
      if (head.code === 0 && head.stdout.trim()) {
        return head.stdout.trim();
      }
    }

    await fs.mkdir(this.repoDir, { recursive: true });
    if (!existsSync(path.join(this.repoDir, '.git'))) {
      await this.git(['init', '-b', 'main']);
    }
    await this.git(['config', 'user.name', 'DSH ABAP Tracker']);
    await this.git(['config', 'user.email', 'abap-tracker@dsh.local']);
    await this.git(['config', 'core.autocrlf', 'false']);

    const head = await this.git(['rev-parse', 'HEAD'], true);
    if (head.code !== 0 || !head.stdout.trim()) {
      await this.git(['commit', '--allow-empty', '-m', '[init] initialize ABAP shadow repository']);
    }
    this.initialized = true;
    const verified = await this.git(['rev-parse', 'HEAD']);
    return verified.stdout.trim();
  }

  async getHead(): Promise<string> {
    return this.withLock(async () => this.ensureRepoUnlocked());
  }

  async readWorkingFile(relPath: string): Promise<string | null> {
    const { absPath } = this.resolveSafePath(relPath);
    try {
      const raw = await fs.readFile(absPath, 'utf8');
      return normalizeNewlines(raw);
    } catch {
      return null;
    }
  }

  async commitFile(
    relPath: string,
    content: string,
    message: string,
  ): Promise<{ commitHash: string; changed: boolean }> {
    return this.withLock(async () => {
      const headBefore = await this.ensureRepoUnlocked();
      const { absPath, gitPath } = this.resolveSafePath(relPath);
      const normalized = normalizeNewlines(content);

      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, normalized, 'utf8');
      await this.git(['add', '-f', '--', gitPath]);

      const diffCheck = await this.git(['diff', '--cached', '--quiet'], true);
      if (diffCheck.code === 0) {
        return { commitHash: headBefore, changed: false };
      }

      await this.git(['commit', '--no-verify', '-m', message]);
      const headAfter = await this.git(['rev-parse', 'HEAD']);
      return { commitHash: headAfter.stdout.trim(), changed: true };
    });
  }

  async deleteFile(relPath: string, message: string): Promise<{ commitHash: string; changed: boolean }> {
    return this.withLock(async () => {
      const headBefore = await this.ensureRepoUnlocked();
      const { absPath, gitPath } = this.resolveSafePath(relPath);
      if (!existsSync(absPath)) {
        return { commitHash: headBefore, changed: false };
      }
      await fs.rm(absPath, { force: true });
      await this.git(['add', '-A', '--', gitPath]);

      const diffCheck = await this.git(['diff', '--cached', '--quiet'], true);
      if (diffCheck.code === 0) {
        return { commitHash: headBefore, changed: false };
      }
      await this.git(['commit', '--no-verify', '-m', message]);
      const headAfter = await this.git(['rev-parse', 'HEAD']);
      return { commitHash: headAfter.stdout.trim(), changed: true };
    });
  }

  async getRangeNumStat(baseCommit: string, headCommit: string): Promise<GitNumStatEntry[]> {
    if (!baseCommit || !headCommit || baseCommit === headCommit) return [];

    const [statusRes, numstatRes] = await Promise.all([
      this.git(['diff', '--name-status', '--no-renames', baseCommit, headCommit], true),
      this.git(['diff', '--numstat', '--no-renames', baseCommit, headCommit], true),
    ]);

    const statusMap = new Map<string, ChangeKind>();
    for (const line of statusRes.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const code = parts[0].trim().charAt(0).toUpperCase();
      const filePath = parts[1].trim();
      const kind: ChangeKind = code === 'A' ? 'A' : code === 'D' ? 'D' : 'M';
      statusMap.set(filePath, kind);
    }

    const entries: GitNumStatEntry[] = [];
    for (const line of numstatRes.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const add = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10) || 0;
      const del = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10) || 0;
      const filePath = parts.slice(2).join('\t').trim();
      entries.push({
        filePath,
        changeKind: statusMap.get(filePath) ?? 'M',
        additions: add,
        deletions: del,
      });
    }
    return entries;
  }

  async showAtCommit(commitHash: string, relPath: string): Promise<string | null> {
    const { gitPath } = this.resolveSafePath(relPath);
    const res = await this.git(['show', `${commitHash}:${gitPath}`], true);
    if (res.code !== 0) return null;
    return normalizeNewlines(res.stdout);
  }

  async getFileDiff(baseCommit: string, headCommit: string, relPath: string): Promise<DiffDetailResponse> {
    const { gitPath } = this.resolveSafePath(relPath);
    const [beforeRaw, afterRaw, diffRes, stats] = await Promise.all([
      this.showAtCommit(baseCommit, gitPath),
      this.showAtCommit(headCommit, gitPath),
      this.git(['diff', '-U3', '--no-renames', baseCommit, headCommit, '--', gitPath], true),
      this.getRangeNumStat(baseCommit, headCommit),
    ]);

    const stat = stats.find((s) => s.filePath === gitPath);
    const changeKind: ChangeKind =
      stat?.changeKind ??
      (beforeRaw === null ? (afterRaw === null ? 'D' : 'A') : afterRaw === null ? 'D' : 'M');

    return {
      filePath: gitPath,
      baseCommit,
      headCommit,
      changeKind,
      beforeText: beforeRaw ?? '',
      afterText: afterRaw ?? '',
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      unifiedPatch: diffRes.stdout,
    };
  }
}
