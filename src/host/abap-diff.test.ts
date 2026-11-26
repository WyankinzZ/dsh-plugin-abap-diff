import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildSplitRows, buildUnifiedRows, tokenizeAbapLine } from '../client/diff-engine.ts';
import { attachAbapInterceptor } from './interceptor.ts';
import { createAbapDiffHttpHandler } from './routes.ts';
import { SessionStore } from './session-store.ts';
import { ShadowGitRepo } from './shadow-git.ts';
import { parseAdtUrl, parseMcpToolName, resolveWriteIntent } from './tool-registry.ts';

describe('tool-registry', () => {
  it('parses MCP public names and ADT URLs accurately', () => {
    assert.deepEqual(parseMcpToolName('mcp__abap-adt-130__EditSource'), {
      serverName: 'abap-adt-130',
      rawName: 'EditSource',
    });
    assert.equal(parseMcpToolName('read_file'), null);

    assert.deepEqual(parseAdtUrl('/sap/bc/adt/programs/programs/zrep_01/source/main'), {
      objectType: 'PROG',
      objectName: 'ZREP_01',
    });
    assert.deepEqual(parseAdtUrl('/sap/bc/adt/oo/classes/zcl_demo/includes/testclasses'), {
      objectType: 'CLAS',
      objectName: 'ZCL_DEMO',
      includeType: 'testclasses',
    });
    assert.deepEqual(parseAdtUrl('/sap/bc/adt/functions/groups/zfg_1/fmodules/zfm_check/source/main'), {
      objectType: 'FUNC',
      objectName: 'ZFM_CHECK',
      parent: 'ZFG_1',
    });
  });

  it('resolves CreateClassWithTests into main and testclasses targets', () => {
    const intent = resolveWriteIntent('abap-adt-cspc', 'CreateClassWithTests', {
      class_name: 'zcl_unit',
      class_source: 'CLASS zcl_unit DEFINITION. ENDCLASS.',
      test_source: 'CLASS ltcl_test DEFINITION FOR TESTING. ENDCLASS.',
      transport: 'DS4K900111',
    });
    assert.ok(intent);
    assert.equal(intent.kind, 'create');
    assert.equal(intent.targets.length, 2);
    assert.equal(intent.targets[0].filePath, 'abap-adt-cspc/CLAS/ZCL_UNIT.clas.abap');
    assert.equal(intent.targets[1].filePath, 'abap-adt-cspc/CLAS/ZCL_UNIT.clas.testclasses.abap');
    assert.equal(intent.targets[0].transport, 'DS4K900111');
  });
});

describe('diff-engine', () => {
  it('builds aligned split rows, unified rows, and ABAP syntax tokens', () => {
    const before = 'REPORT ztest.\nDATA lv_a TYPE i.\nlv_a = 1.\nWRITE lv_a.\n';
    const after = 'REPORT ztest.\nDATA lv_a TYPE i.\nlv_a = 42.\nlv_b = 99.\nWRITE lv_a.\n';

    const split = buildSplitRows(before, after, { contextLines: 1 });
    assert.ok(split.some((r) => r.leftKind === 'del' && r.leftText === 'lv_a = 1.'));
    assert.ok(split.some((r) => r.rightKind === 'add' && r.rightText === 'lv_a = 42.'));
    assert.ok(split.some((r) => r.leftKind === 'empty' && r.rightKind === 'add' && r.rightText === 'lv_b = 99.'));

    const unified = buildUnifiedRows(before, after, { contextLines: 1 });
    assert.ok(unified.some((r) => r.kind === 'del' && r.text === 'lv_a = 1.'));
    assert.ok(unified.some((r) => r.kind === 'add' && r.text === 'lv_a = 42.'));

    const tokens = tokenizeAbapLine("  DATA lv_msg TYPE string VALUE 'OK'. \" comment");
    assert.equal(tokens[1].kind, 'keyword');
    assert.equal(tokens[1].text, 'DATA');
    assert.ok(tokens.some((t) => t.kind === 'string' && t.text === "'OK'"));
    assert.ok(tokens.some((t) => t.kind === 'comment'));
  });
});

describe('shadow-git + interceptor + session-store e2e', () => {
  it('tracks lazy baselines, edits, external manual edits, activations, deletions, and failed calls', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-abap-diff-test-'));
    try {
      const git = new ShadowGitRepo(path.join(tmpDir, 'repo'));
      const store = new SessionStore(tmpDir, git);
      await store.init();

      // Mock SAP database state
      const sapSources = new Map<string, string>([
        ['PROG:ZDEMO', 'REPORT zdemo.\nDATA lv_x TYPE i VALUE 1.\nWRITE lv_x.\n'],
        ['PROG:ZOLD', 'REPORT zold.\nWRITE \'TO BE DELETED\'.\n'],
      ]);

      // Mock Cordis ctx with event bus + tools registry
      const listeners = new Map<string, Set<(...args: any[]) => any>>();
      const registeredTools = new Map<string, any>();

      const emitWaterfall = async (eventName: string, ...args: any[]) => {
        const set = [...(listeners.get(eventName) ?? [])];
        let idx = 0;
        const runNext = async (): Promise<any> => {
          if (idx >= set.length) return eventName === 'tools/pre-execute' ? { kind: 'allow' } : { kind: 'accept' };
          const fn = set[idx++];
          return fn(...args, runNext);
        };
        return runNext();
      };

      const emitEvent = (eventName: string, ...args: any[]) => {
        for (const fn of listeners.get(eventName) ?? []) fn(...args);
      };

      const ctx: any = {
        on(ev: string, fn: (...args: any[]) => any) {
          if (!listeners.has(ev)) listeners.set(ev, new Set());
          listeners.get(ev)!.add(fn);
          return () => listeners.get(ev)?.delete(fn);
        },
        tools: {
          get: (name: string) => registeredTools.get(name),
          view: () => ({ knownNames: new Set(registeredTools.keys()) }),
        },
        logger: { warn() {}, error() {} },
      };

      registeredTools.set('mcp__abap-adt-130__GetSource', {
        name: 'mcp__abap-adt-130__GetSource',
        execute: async (args: any) => {
          const key = `${String(args.object_type).toUpperCase()}:${String(args.name).toUpperCase()}`;
          const src = sapSources.get(key);
          if (src === undefined) throw new Error(`Object ${key} not found`);
          return { content: [{ type: 'text', text: src }] };
        },
      });

      const simulateToolCall = async (
        callId: string,
        name: string,
        args: Record<string, unknown>,
        impl: () => Promise<any>,
      ) => {
        const exec = { callId, name, arguments: args };
        emitEvent('session/event', { id: 'chat-1' }, { type: 'tool/call', data: { callId, name } });
        await emitWaterfall('tools/pre-execute', exec);
        let result: any;
        try {
          result = await impl();
        } catch (e: any) {
          result = { isError: true, error: { message: e.message }, content: [{ type: 'text', text: e.message }] };
        }
        await emitWaterfall('tools/post-execute', exec, result);
        return result;
      };

      const detach = attachAbapInterceptor(ctx, git, store);

      // 1. Before starting tracking, edits are NOT recorded
      await simulateToolCall('c0', 'mcp__abap-adt-130__EditSource', {
        object_url: '/sap/bc/adt/programs/programs/zdemo',
        old_string: 'VALUE 1',
        new_string: 'VALUE 2',
      }, async () => {
        sapSources.set('PROG:ZDEMO', sapSources.get('PROG:ZDEMO')!.replace('VALUE 1', 'VALUE 2'));
        return { content: [{ type: 'text', text: 'ok' }] };
      });
      assert.equal((await store.listSessions()).length, 0);

      // 2. Start tracking
      const session = await store.startSession('测试会话');
      assert.equal(session.status, 'recording');

      // Turn 1: User prompt + EditSource on existing ZDEMO + Activate
      emitEvent('session/event', { id: 'chat-1' }, { type: 'user/message', data: { content: '把 lv_x 初始值改成 10' } });
      emitEvent('session/event', { id: 'chat-1' }, { type: 'turn/start' });

      await simulateToolCall('c1', 'mcp__abap-adt-130__EditSource', {
        object_url: '/sap/bc/adt/programs/programs/zdemo',
        old_string: 'VALUE 2',
        new_string: 'VALUE 10',
        transport: 'DS4K900555',
      }, async () => {
        sapSources.set('PROG:ZDEMO', sapSources.get('PROG:ZDEMO')!.replace('VALUE 2', 'VALUE 10'));
        return { content: [{ type: 'text', text: 'edited' }] };
      });

      let detail = (await store.getSession(session.id))!;
      assert.equal(detail.files.length, 1);
      assert.equal(detail.files[0].changeKind, 'M');
      assert.equal(detail.files[0].additions, 1);
      assert.equal(detail.files[0].deletions, 1);
      assert.equal(detail.files[0].active, false);
      assert.equal(detail.files[0].transport, 'DS4K900555');
      assert.equal(detail.turns[0].promptSummary, '把 lv_x 初始值改成 10');

      await simulateToolCall('c2', 'mcp__abap-adt-130__Activate', {
        object_url: '/sap/bc/adt/programs/programs/zdemo',
        object_name: 'ZDEMO',
      }, async () => ({ content: [{ type: 'text', text: 'activated' }] }));

      detail = (await store.getSession(session.id))!;
      assert.equal(detail.files[0].active, true);
      emitEvent('session/event', { id: 'chat-1' }, { type: 'turn/end' });

      // 3. Simulate external manual edit in SAP between turns, then Turn 2 AI edit + CreateAndActivateProgram + failed edit
      sapSources.set('PROG:ZDEMO', 'REPORT zdemo.\n* Manual comment in SAP GUI\nDATA lv_x TYPE i VALUE 10.\nWRITE lv_x.\n');

      emitEvent('session/event', { id: 'chat-1' }, { type: 'user/message', data: { content: '新建报表 ZNEW 并修改 ZDEMO' } });
      emitEvent('session/event', { id: 'chat-1' }, { type: 'turn/start' });

      await simulateToolCall('c3', 'mcp__abap-adt-130__EditSource', {
        object_url: '/sap/bc/adt/programs/programs/zdemo',
        old_string: 'WRITE lv_x.',
        new_string: 'WRITE: / lv_x.',
      }, async () => {
        sapSources.set('PROG:ZDEMO', sapSources.get('PROG:ZDEMO')!.replace('WRITE lv_x.', 'WRITE: / lv_x.'));
        return { content: [{ type: 'text', text: 'edited' }] };
      });

      const turn2ZdemoDiff = await store.getDiffDetail(session.id, 'abap-adt-130/PROG/ZDEMO.prog.abap', '2');
      assert.ok(turn2ZdemoDiff);
      assert.equal(turn2ZdemoDiff.additions, 1);
      assert.equal(turn2ZdemoDiff.deletions, 1);
      assert.ok(turn2ZdemoDiff.beforeText.includes('* Manual comment in SAP GUI'));

      await simulateToolCall('c4', 'mcp__abap-adt-130__CreateAndActivateProgram', {
        program_name: 'ZNEW',
        package_name: '$TMP',
        description: 'New test',
        source: 'REPORT znew.\nWRITE \'HELLO\'.\n',
      }, async () => {
        sapSources.set('PROG:ZNEW', "REPORT znew.\nWRITE 'HELLO'.\n");
        return { content: [{ type: 'text', text: 'created' }] };
      });

      // Failed call should NOT pollute git diff
      await simulateToolCall('c5', 'mcp__abap-adt-130__EditSource', {
        object_url: '/sap/bc/adt/programs/programs/zdemo',
        old_string: 'NON_EXISTENT',
        new_string: 'X',
      }, async () => {
        throw new Error('old_string not found');
      });

      // Delete existing ZOLD
      await simulateToolCall('c6', 'mcp__abap-adt-130__DeleteObject', {
        object_url: '/sap/bc/adt/programs/programs/zold',
        lock_handle: 'LOCK1',
      }, async () => {
        sapSources.delete('PROG:ZOLD');
        return { content: [{ type: 'text', text: 'deleted' }] };
      });

      // Stop tracking
      const stopped = await store.stopSession();
      assert.ok(stopped);
      assert.equal(stopped.status, 'closed');
      assert.equal(stopped.turns.length, 2);
      assert.equal(stopped.failedCalls.length, 1);

      const deletedDiff = await store.getDiffDetail(session.id, 'abap-adt-130/PROG/ZOLD.prog.abap', '2');
      assert.ok(deletedDiff);
      assert.equal(deletedDiff.changeKind, 'D');
      assert.ok(deletedDiff.beforeText.includes('TO BE DELETED'));
      assert.equal(deletedDiff.afterText, '');
      assert.equal(deletedDiff.deletions, 2);

      const createdDiff = await store.getDiffDetail(session.id, 'abap-adt-130/PROG/ZNEW.prog.abap', '2');
      assert.ok(createdDiff);
      assert.equal(createdDiff.changeKind, 'A');
      assert.equal(createdDiff.beforeText, '');
      assert.ok(createdDiff.afterText.includes("WRITE 'HELLO'."));

      // Verify HTTP handler state & routes
      const handler = createAbapDiffHttpHandler(store);
      assert.equal(typeof handler, 'function');

      detach();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
