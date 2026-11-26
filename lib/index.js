// dsh-plugin-abap-diff host bundle

// src/host/index.ts
import os from "node:os";
import path3 from "node:path";

// src/host/tool-registry.ts
function sanitizeSegment(value) {
  return String(value || "").trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.+$/g, "") || "UNKNOWN";
}
function parseMcpToolName(publicName) {
  const match = /^mcp__(.+?)__(.+)$/.exec(publicName);
  if (!match) return null;
  return { serverName: match[1], rawName: match[2] };
}
function isAbapServerName(serverName) {
  return /^abap[-_]?adt/i.test(serverName);
}
function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}
function stripMirrorBanner(text) {
  return text.replace(/\n\n\*----------------------------------------------------------------------\*\n\* \[SAP-MCP-Mirror:[\s\S]*?\*----------------------------------------------------------------------\*$/m, "").replace(/\n\n\* \[SAP-MCP-Mirror: MIRROR\][^\n]*\*$/m, "");
}
function extractTextFromToolOutput(output) {
  if (!output || typeof output !== "object") return null;
  const obj = output;
  if (Array.isArray(obj.content)) {
    const texts = obj.content.filter((item) => item && item.type === "text" && typeof item.text === "string").map((item) => item.text);
    if (texts.length > 0) {
      return normalizeNewlines(stripMirrorBanner(texts.join("\n")));
    }
  }
  if (obj.structuredContent !== void 0) {
    return JSON.stringify(obj.structuredContent, null, 2);
  }
  return null;
}
function parseAdtUrl(rawUrl) {
  if (!rawUrl) return null;
  let cleaned = String(rawUrl).trim();
  try {
    if (/^https?:\/\//i.test(cleaned)) {
      cleaned = new URL(cleaned).pathname;
    }
  } catch {
  }
  cleaned = cleaned.split("?")[0].split("#")[0].replace(/\/+$/, "");
  const decode = (s) => {
    try {
      return decodeURIComponent(s).toUpperCase();
    } catch {
      return s.toUpperCase();
    }
  };
  let m;
  if (m = /\/oo\/classes\/([^/]+)(?:\/includes\/([^/]+)|\/source\/main)?$/i.exec(cleaned)) {
    const inc = m[2] ? m[2].toLowerCase() : void 0;
    return {
      objectType: "CLAS",
      objectName: decode(m[1]),
      includeType: inc && inc !== "main" ? inc : void 0
    };
  }
  if (m = /\/oo\/interfaces\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "INTF", objectName: decode(m[1]) };
  }
  if (m = /\/programs\/programs\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "PROG", objectName: decode(m[1]) };
  }
  if (m = /\/programs\/includes\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "INCL", objectName: decode(m[1]) };
  }
  if (m = /\/functions\/groups\/([^/]+)\/fmodules\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "FUNC", objectName: decode(m[2]), parent: decode(m[1]) };
  }
  if (m = /\/functions\/groups\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "FUGR", objectName: decode(m[1]) };
  }
  if (m = /\/ddic\/ddl\/sources\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "DDLS", objectName: decode(m[1]) };
  }
  if (m = /\/bo\/behaviordefinitions\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "BDEF", objectName: decode(m[1]) };
  }
  if (m = /\/ddic\/srvd\/sources\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "SRVD", objectName: decode(m[1]) };
  }
  if (m = /\/ddic\/views\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "VIEW", objectName: decode(m[1]) };
  }
  if (m = /\/ddic\/tables\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "TABL", objectName: decode(m[1]) };
  }
  if (m = /\/ddic\/structures\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned)) {
    return { objectType: "STRU", objectName: decode(m[1]) };
  }
  if (m = /\/messages\/([^/]+)$/i.exec(cleaned)) {
    return { objectType: "MSAG", objectName: decode(m[1]) };
  }
  const stripped = cleaned.replace(/\/source\/main$/i, "");
  const parts = stripped.split("/").filter(Boolean);
  if (parts.length > 0) {
    return {
      objectType: "OBJ",
      objectName: decode(parts[parts.length - 1])
    };
  }
  return null;
}
function buildShadowFilePath(serverName, spec) {
  const srv = sanitizeSegment(serverName);
  const type = sanitizeSegment(spec.objectType.toUpperCase());
  const name2 = sanitizeSegment(spec.objectName.toUpperCase());
  const inc = spec.includeType ? spec.includeType.toLowerCase() : void 0;
  if (type === "CLAS") {
    const suffix = inc && inc !== "main" ? `.clas.${sanitizeSegment(inc)}.abap` : ".clas.abap";
    return `${srv}/CLAS/${name2}${suffix}`;
  }
  if (type === "FUNC" && spec.parent) {
    return `${srv}/FUGR/${sanitizeSegment(spec.parent.toUpperCase())}/${name2}.func.abap`;
  }
  if (type === "TEXT") {
    return `${srv}/TEXT/${name2}.texts.json`;
  }
  const ext = type.toLowerCase();
  return `${srv}/${type}/${name2}.${ext}.abap`;
}
function makeGetSourceCall(spec) {
  const supported = /* @__PURE__ */ new Set([
    "PROG",
    "CLAS",
    "INTF",
    "FUNC",
    "FUGR",
    "INCL",
    "DDLS",
    "VIEW",
    "BDEF",
    "SRVD",
    "SRVB",
    "MSAG"
  ]);
  const type = spec.objectType.toUpperCase();
  if (!supported.has(type)) return void 0;
  if (type === "CLAS" && spec.includeType && spec.includeType !== "main") {
    return {
      rawToolName: "GetSource",
      args: {
        object_type: "CLAS",
        name: spec.objectName,
        include: spec.includeType
      }
    };
  }
  const args = {
    object_type: type,
    name: spec.objectName
  };
  if (type === "FUNC" && spec.parent) {
    args.parent = spec.parent;
  }
  return { rawToolName: "GetSource", args };
}
function asString(v) {
  return typeof v === "string" && v.trim() ? v.trim() : void 0;
}
function resolveWriteIntent(serverName, rawToolName, rawArgs) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const transport = asString(args.transport);
  switch (rawToolName) {
    case "EditSource":
    case "UpdateSource": {
      const objectUrl = asString(args.object_url);
      if (!objectUrl) return null;
      const parsed = parseAdtUrl(objectUrl) ?? { objectType: "OBJ", objectName: sanitizeSegment(objectUrl) };
      const methodName = asString(args.method)?.toUpperCase();
      return {
        kind: "edit",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: parsed.objectType,
            objectName: parsed.objectName,
            includeType: parsed.includeType,
            parent: parsed.parent,
            methodName,
            objectUrl,
            filePath: buildShadowFilePath(serverName, parsed),
            readCall: makeGetSourceCall(parsed),
            fallbackSource: rawToolName === "UpdateSource" ? asString(args.source) : void 0,
            autoActivated: false,
            transport
          }
        ]
      };
    }
    case "WriteSource": {
      const objectType = (asString(args.object_type) ?? "OBJ").toUpperCase();
      const objectName = (asString(args.name) ?? "").toUpperCase();
      if (!objectName) return null;
      const mode = (asString(args.mode) ?? "upsert").toLowerCase();
      const methodName = asString(args.method)?.toUpperCase();
      const targets = [
        {
          serverName,
          objectType,
          objectName,
          methodName,
          filePath: buildShadowFilePath(serverName, { objectType, objectName }),
          readCall: makeGetSourceCall({ objectType, objectName }),
          fallbackSource: asString(args.source),
          autoActivated: false,
          transport
        }
      ];
      if (objectType === "CLAS" && asString(args.test_source)) {
        targets.push({
          serverName,
          objectType: "CLAS",
          objectName,
          includeType: "testclasses",
          filePath: buildShadowFilePath(serverName, {
            objectType: "CLAS",
            objectName,
            includeType: "testclasses"
          }),
          readCall: makeGetSourceCall({ objectType: "CLAS", objectName, includeType: "testclasses" }),
          fallbackSource: asString(args.test_source),
          autoActivated: false,
          transport
        });
      }
      return {
        kind: mode === "create" ? "create" : "edit",
        rawToolName,
        targets
      };
    }
    case "WriteProgram":
    case "CreateAndActivateProgram": {
      const objectName = (asString(args.program_name) ?? "").toUpperCase();
      if (!objectName) return null;
      return {
        kind: rawToolName === "CreateAndActivateProgram" ? "create" : "edit",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: "PROG",
            objectName,
            filePath: buildShadowFilePath(serverName, { objectType: "PROG", objectName }),
            readCall: makeGetSourceCall({ objectType: "PROG", objectName }),
            fallbackSource: asString(args.source),
            autoActivated: rawToolName === "CreateAndActivateProgram",
            transport
          }
        ]
      };
    }
    case "WriteClass": {
      const objectName = (asString(args.class_name) ?? "").toUpperCase();
      if (!objectName) return null;
      return {
        kind: "edit",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: "CLAS",
            objectName,
            filePath: buildShadowFilePath(serverName, { objectType: "CLAS", objectName }),
            readCall: makeGetSourceCall({ objectType: "CLAS", objectName }),
            fallbackSource: asString(args.source),
            autoActivated: false,
            transport
          }
        ]
      };
    }
    case "CreateClassWithTests": {
      const objectName = (asString(args.class_name) ?? "").toUpperCase();
      if (!objectName) return null;
      return {
        kind: "create",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: "CLAS",
            objectName,
            filePath: buildShadowFilePath(serverName, { objectType: "CLAS", objectName }),
            readCall: makeGetSourceCall({ objectType: "CLAS", objectName }),
            fallbackSource: asString(args.class_source),
            autoActivated: false,
            transport
          },
          {
            serverName,
            objectType: "CLAS",
            objectName,
            includeType: "testclasses",
            filePath: buildShadowFilePath(serverName, {
              objectType: "CLAS",
              objectName,
              includeType: "testclasses"
            }),
            readCall: makeGetSourceCall({ objectType: "CLAS", objectName, includeType: "testclasses" }),
            fallbackSource: asString(args.test_source),
            autoActivated: false,
            transport
          }
        ]
      };
    }
    case "UpdateClassInclude":
    case "CreateTestInclude": {
      const objectName = (asString(args.class_name) ?? "").toUpperCase();
      if (!objectName) return null;
      const includeType = rawToolName === "CreateTestInclude" ? "testclasses" : (asString(args.include_type) ?? "implementations").toLowerCase();
      return {
        kind: rawToolName === "CreateTestInclude" ? "create" : "edit",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: "CLAS",
            objectName,
            includeType,
            filePath: buildShadowFilePath(serverName, {
              objectType: "CLAS",
              objectName,
              includeType
            }),
            readCall: makeGetSourceCall({ objectType: "CLAS", objectName, includeType }),
            fallbackSource: asString(args.source),
            autoActivated: false,
            transport
          }
        ]
      };
    }
    case "CreateObject": {
      const objectType = (asString(args.object_type) ?? "").toUpperCase();
      const objectName = (asString(args.name) ?? "").toUpperCase();
      const parent = asString(args.parent_name)?.toUpperCase();
      if (!objectType || !objectName) return null;
      return {
        kind: "create",
        rawToolName,
        targets: [
          {
            serverName,
            objectType,
            objectName,
            parent,
            filePath: buildShadowFilePath(serverName, { objectType, objectName, parent }),
            readCall: makeGetSourceCall({ objectType, objectName, parent }),
            fallbackSource: "",
            autoActivated: false,
            transport
          }
        ]
      };
    }
    case "DeleteObject": {
      const objectUrl = asString(args.object_url);
      if (!objectUrl) return null;
      const parsed = parseAdtUrl(objectUrl) ?? { objectType: "OBJ", objectName: sanitizeSegment(objectUrl) };
      return {
        kind: "delete",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: parsed.objectType,
            objectName: parsed.objectName,
            includeType: parsed.includeType,
            parent: parsed.parent,
            objectUrl,
            filePath: buildShadowFilePath(serverName, parsed),
            readCall: makeGetSourceCall(parsed),
            transport
          }
        ]
      };
    }
    case "SetTextElements": {
      const program = (asString(args.program) ?? "").toUpperCase();
      if (!program) return null;
      const language = asString(args.language);
      return {
        kind: "edit",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: "TEXT",
            objectName: program,
            filePath: buildShadowFilePath(serverName, { objectType: "TEXT", objectName: program }),
            readCall: {
              rawToolName: "GetTextElements",
              args: language ? { program, language } : { program }
            },
            fallbackSource: JSON.stringify(
              {
                program,
                language: language ?? "default",
                text_symbols: args.text_symbols ?? null,
                selection_texts: args.selection_texts ?? null,
                heading_texts: args.heading_texts ?? null
              },
              null,
              2
            ),
            autoActivated: false
          }
        ]
      };
    }
    case "Activate": {
      const objectUrl = asString(args.object_url);
      const objectName = asString(args.object_name)?.toUpperCase();
      const parsed = objectUrl ? parseAdtUrl(objectUrl) : null;
      if (!parsed && !objectName) return null;
      const resolved = parsed ?? { objectType: "OBJ", objectName };
      return {
        kind: "activate",
        rawToolName,
        targets: [
          {
            serverName,
            objectType: resolved.objectType,
            objectName: resolved.objectName,
            includeType: resolved.includeType,
            parent: resolved.parent,
            objectUrl,
            filePath: buildShadowFilePath(serverName, resolved),
            autoActivated: true
          }
        ]
      };
    }
    case "ActivatePackage": {
      return {
        kind: "activate-package",
        rawToolName,
        targets: [],
        packageName: asString(args.package)
      };
    }
    default:
      return null;
  }
}

// src/host/interceptor.ts
async function invokeReadTool(ctx, serverName, rawToolName, args) {
  const publicName = `mcp__${serverName}__${rawToolName}`;
  const toolDef = ctx.tools?.get?.(publicName);
  if (!toolDef || typeof toolDef.execute !== "function") return null;
  try {
    const output = await toolDef.execute(args, {
      signal: AbortSignal.timeout(25e3),
      callId: `abap-diff-read-${Date.now()}`,
      name: publicName,
      arguments: args
    });
    return extractTextFromToolOutput(output);
  } catch {
    return null;
  }
}
async function tryReadTarget(ctx, target) {
  if (!target.readCall) return null;
  const primary = await invokeReadTool(ctx, target.serverName, target.readCall.rawToolName, target.readCall.args);
  if (primary !== null) return primary;
  if (target.readCall.rawToolName === "GetSource") {
    const type = target.objectType.toUpperCase();
    if (type === "PROG") {
      return invokeReadTool(ctx, target.serverName, "GetProgram", { program_name: target.objectName });
    }
    if (type === "CLAS") {
      if (target.includeType && target.includeType !== "main") {
        return invokeReadTool(ctx, target.serverName, "GetClassInclude", {
          class_name: target.objectName,
          include_type: target.includeType
        });
      }
      return invokeReadTool(ctx, target.serverName, "GetClass", { class_name: target.objectName });
    }
    if (type === "INTF") {
      return invokeReadTool(ctx, target.serverName, "GetInterface", { interface_name: target.objectName });
    }
    if (type === "INCL") {
      return invokeReadTool(ctx, target.serverName, "GetInclude", { include_name: target.objectName });
    }
    if (type === "FUNC" && target.parent) {
      return invokeReadTool(ctx, target.serverName, "GetFunction", {
        function_name: target.objectName,
        function_group: target.parent
      });
    }
  }
  return null;
}
function isAbapMcpServer(ctx, serverName) {
  if (isAbapServerName(serverName)) return true;
  const hasGetSource = Boolean(ctx.tools?.get?.(`mcp__${serverName}__GetSource`));
  const hasEditSource = Boolean(ctx.tools?.get?.(`mcp__${serverName}__EditSource`));
  return hasGetSource || hasEditSource;
}
function scanRegisteredServers(ctx, store) {
  try {
    const view = ctx.tools?.view?.();
    const names = view?.knownNames;
    if (!names) return;
    const found = /* @__PURE__ */ new Set();
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
  }
}
function attachAbapInterceptor(ctx, git, store) {
  const pendingCalls = /* @__PURE__ */ new Map();
  const callSessionMap = /* @__PURE__ */ new Map();
  let latestActiveDshSessionId;
  scanRegisteredServers(ctx, store);
  const offToolsChange = ctx.on("tools/change", () => {
    scanRegisteredServers(ctx, store);
  });
  const offSessionEvent = ctx.on("session/event", (session, event) => {
    try {
      const dshSessionId = typeof session?.id === "string" ? session.id : typeof session?.header?.id === "string" ? session.header.id : void 0;
      if (dshSessionId) latestActiveDshSessionId = dshSessionId;
      const type = event?.type;
      if (type === "user/message") {
        const content = event?.data?.content;
        let text = "";
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          text = content.filter((b) => b?.type === "text" && typeof b?.text === "string").map((b) => b.text).join(" ");
        }
        if (text) store.noteUserPrompt(dshSessionId, text);
      } else if (type === "turn/start") {
        store.noteTurnStart(dshSessionId);
      } else if (type === "turn/end") {
        void store.noteTurnEnd(dshSessionId);
      } else if (type === "tool/call") {
        const callId = event?.data?.callId ?? event?.data?.id;
        if (typeof callId === "string" && dshSessionId) {
          callSessionMap.set(callId, dshSessionId);
        }
      }
    } catch {
    }
  });
  const offPre = ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      if (store.isRecording()) {
        const parsedName = parseMcpToolName(String(exec?.name ?? ""));
        if (parsedName && isAbapMcpServer(ctx, parsedName.serverName)) {
          store.registerDetectedServers([parsedName.serverName]);
          const intent = resolveWriteIntent(parsedName.serverName, parsedName.rawName, exec?.arguments);
          if (intent) {
            const dshSessionId = callSessionMap.get(String(exec?.callId ?? "")) ?? (typeof exec?.agent?.sessionId === "string" ? exec.agent.sessionId : void 0) ?? latestActiveDshSessionId;
            const snapshots = [];
            if (intent.kind === "edit" || intent.kind === "create" || intent.kind === "delete") {
              for (const target of intent.targets) {
                const working = await git.readWorkingFile(target.filePath);
                let fileBaseCommit = await git.getHead();
                let existedBefore = working !== null;
                let externalPreEdit = false;
                if (intent.kind === "edit" || intent.kind === "delete") {
                  const sapSource = await tryReadTarget(ctx, target);
                  if (sapSource !== null) {
                    existedBefore = true;
                    if (working === null) {
                      const baseRes = await git.commitFile(
                        target.filePath,
                        sapSource,
                        `[baseline] ${target.serverName} ${target.objectType} ${target.objectName}`
                      );
                      fileBaseCommit = baseRes.commitHash;
                    } else if (working !== sapSource) {
                      const extRes = await git.commitFile(
                        target.filePath,
                        sapSource,
                        `[external] ${target.serverName} ${target.objectType} ${target.objectName}`
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
                  externalPreEdit
                });
              }
            }
            if (exec?.callId) {
              pendingCalls.set(String(exec.callId), {
                serverName: parsedName.serverName,
                intent,
                snapshots,
                dshSessionId
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
  const offPost = ctx.on("tools/post-execute", async (exec, result, next) => {
    const callId = String(exec?.callId ?? "");
    const pending = callId ? pendingCalls.get(callId) : void 0;
    if (callId) {
      pendingCalls.delete(callId);
      callSessionMap.delete(callId);
    }
    if (pending) {
      try {
        if (store.isRecording()) {
          if (result?.isError) {
            const errText = result?.error?.message ?? extractTextFromToolOutput(result) ?? "Tool execution failed";
            const firstTarget = pending.intent.targets[0];
            const objKey = firstTarget ? `${firstTarget.serverName}/${firstTarget.objectType}/${firstTarget.objectName}` : pending.serverName;
            await store.recordFailedCall(pending.intent.rawToolName, objKey, String(errText));
          } else {
            const { intent, snapshots, dshSessionId } = pending;
            if (intent.kind === "activate") {
              for (const target of intent.targets) {
                await store.markActivated(pending.serverName, {
                  filePath: target.filePath,
                  objectType: target.objectType,
                  objectName: target.objectName
                });
              }
            } else if (intent.kind === "activate-package") {
              await store.markActivated(pending.serverName, { allForServer: true });
            } else if (intent.kind === "delete") {
              for (const snap of snapshots) {
                const { target, fileBaseCommit, externalPreEdit } = snap;
                const delRes = await git.deleteFile(
                  target.filePath,
                  `[ai][${intent.rawToolName}] delete ${target.serverName} ${target.objectType} ${target.objectName}`
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
                    changeKind: "D",
                    fileBaseCommit,
                    fileEndCommit: delRes.commitHash,
                    active: null,
                    transport: target.transport,
                    toolName: intent.rawToolName,
                    externalPreEdit,
                    dshSessionId
                  });
                }
              }
            } else {
              for (const snap of snapshots) {
                const { target, fileBaseCommit, existedBefore, externalPreEdit } = snap;
                const freshSource = await tryReadTarget(ctx, target);
                const finalSource = freshSource !== null ? freshSource : target.fallbackSource !== void 0 ? normalizeNewlines(target.fallbackSource) : null;
                if (finalSource === null) continue;
                const commitRes = await git.commitFile(
                  target.filePath,
                  finalSource,
                  `[ai][${intent.rawToolName}] ${target.serverName} ${target.objectType} ${target.objectName}`
                );
                if (commitRes.changed) {
                  const kind = existedBefore ? "M" : "A";
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
                    dshSessionId
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

// src/host/routes.ts
var ROUTE_PREFIX = "/dsh-abap-diff";
var MAX_BODY_BYTES = 1024 * 1024;
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function sendJson(res, status, payload) {
  if (res.destroyed || res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache, no-store"
  });
  res.end(body);
}
function createAbapDiffHttpHandler(store) {
  return async (req, res) => {
    try {
      const method = (req.method ?? "GET").toUpperCase();
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathPart = url.pathname.startsWith(ROUTE_PREFIX) ? url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, "") : url.pathname.replace(/^\/+/, "");
      if (method === "GET" && (pathPart === "" || pathPart === "state")) {
        const state = await store.getStateSummary();
        sendJson(res, 200, state);
        return;
      }
      if (method === "GET" && pathPart === "sessions") {
        const sessions = await store.listSessions();
        sendJson(res, 200, { sessions });
        return;
      }
      if (method === "POST" && pathPart === "sessions/start") {
        const raw = await readBody(req);
        let title;
        if (raw.trim()) {
          try {
            const body = JSON.parse(raw);
            if (typeof body?.title === "string") title = body.title;
          } catch {
            sendJson(res, 400, { error: "Invalid JSON body" });
            return;
          }
        }
        const session = await store.startSession(title);
        sendJson(res, 200, { session });
        return;
      }
      if (method === "POST" && pathPart === "sessions/stop") {
        const session = await store.stopSession();
        sendJson(res, 200, { session });
        return;
      }
      const diffMatch = /^sessions\/([^/]+)\/diff$/.exec(pathPart);
      if (method === "GET" && diffMatch) {
        const id = decodeURIComponent(diffMatch[1]);
        const filePath = url.searchParams.get("file") ?? "";
        const turn = url.searchParams.get("turn") ?? "all";
        if (!filePath) {
          sendJson(res, 400, { error: "Missing required query parameter: file" });
          return;
        }
        const diff = await store.getDiffDetail(id, filePath, turn);
        if (!diff) {
          sendJson(res, 404, { error: "Diff not found for session/file" });
          return;
        }
        sendJson(res, 200, { diff });
        return;
      }
      const sessionMatch = /^sessions\/([^/]+)$/.exec(pathPart);
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        if (method === "GET") {
          const session = await store.getSession(id);
          if (!session) {
            sendJson(res, 404, { error: "Session not found" });
            return;
          }
          sendJson(res, 200, { session });
          return;
        }
        if (method === "DELETE") {
          const deleted = await store.deleteSession(id);
          if (!deleted) {
            sendJson(res, 404, { error: "Session not found" });
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

// src/host/session-store.ts
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
function summarizePrompt(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "\u5BF9\u8BDD\u53D8\u66F4";
  return cleaned.length > 64 ? `${cleaned.slice(0, 64)}\u2026` : cleaned;
}
function formatSessionTitle(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `ABAP \u8FFD\u8E2A ${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
var SessionStore = class {
  storePath;
  git;
  data = { activeSessionId: null, sessions: [] };
  version = 1;
  loaded = false;
  serversDetected = /* @__PURE__ */ new Set();
  latestPrompts = /* @__PURE__ */ new Map();
  openTurnByDshSession = /* @__PURE__ */ new Map();
  saveQueue = Promise.resolve();
  constructor(dataDir, git) {
    this.storePath = path.join(dataDir, "sessions.json");
    this.git = git;
  }
  async init() {
    if (this.loaded) return;
    await this.git.ensureRepo();
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    if (existsSync(this.storePath)) {
      try {
        const raw = await fs.readFile(this.storePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sessions)) {
          this.data = {
            activeSessionId: parsed.activeSessionId ?? null,
            sessions: parsed.sessions
          };
        }
      } catch {
        this.data = { activeSessionId: null, sessions: [] };
      }
    }
    this.loaded = true;
  }
  scheduleSave() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.saveQueue = this.saveQueue.then(async () => {
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.tmp`;
      await fs.writeFile(tmp, snapshot, "utf8");
      await fs.rename(tmp, this.storePath);
    });
    return this.saveQueue;
  }
  registerDetectedServers(serverNames) {
    let changed = false;
    for (const s of serverNames) {
      if (!this.serversDetected.has(s)) {
        this.serversDetected.add(s);
        changed = true;
      }
    }
    if (changed) this.version++;
  }
  getVersion() {
    return this.version;
  }
  isRecording() {
    return this.getActiveSessionInternal() !== null;
  }
  getActiveSessionInternal() {
    if (!this.data.activeSessionId) return null;
    const found = this.data.sessions.find((s) => s.id === this.data.activeSessionId);
    return found && found.status === "recording" ? found : null;
  }
  async startSession(customTitle) {
    await this.init();
    const existing = this.getActiveSessionInternal();
    if (existing) {
      return this.toPublicSession(existing);
    }
    const head = await this.git.ensureRepo();
    const now = /* @__PURE__ */ new Date();
    const session = {
      id: `abap-${now.getTime()}-${randomUUID().slice(0, 6)}`,
      title: customTitle?.trim() || formatSessionTitle(now),
      status: "recording",
      startedAt: now.toISOString(),
      baseCommit: head,
      headCommit: head,
      turns: [],
      files: {},
      failedCalls: []
    };
    this.data.sessions.unshift(session);
    this.data.activeSessionId = session.id;
    this.openTurnByDshSession.clear();
    this.version++;
    await this.scheduleSave();
    return this.toPublicSession(session);
  }
  async stopSession() {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return null;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    active.status = "closed";
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
  async deleteSession(id) {
    await this.init();
    const idx = this.data.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    if (this.data.sessions[idx].status === "recording") {
      throw new Error("Cannot delete an active recording session; stop tracking first.");
    }
    this.data.sessions.splice(idx, 1);
    this.version++;
    await this.scheduleSave();
    return true;
  }
  noteUserPrompt(dshSessionId, text) {
    const key = dshSessionId || "__default__";
    this.latestPrompts.set(key, summarizePrompt(text));
  }
  noteTurnStart(dshSessionId) {
    const active = this.getActiveSessionInternal();
    if (!active) return;
    const key = dshSessionId || "__default__";
    this.openTurnByDshSession.delete(key);
  }
  async noteTurnEnd(dshSessionId) {
    const active = this.getActiveSessionInternal();
    if (!active) return;
    const key = dshSessionId || "__default__";
    const turnIdx = this.openTurnByDshSession.get(key);
    if (turnIdx === void 0) return;
    const turn = active.turns.find((t) => t.turnIndex === turnIdx);
    if (turn && !turn.endedAt) {
      turn.endedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.version++;
      await this.scheduleSave();
    }
    this.openTurnByDshSession.delete(key);
  }
  ensureTurnForChange(session, dshSessionId, commitBefore) {
    const key = dshSessionId || "__default__";
    const existingIdx = this.openTurnByDshSession.get(key);
    if (existingIdx !== void 0) {
      const found = session.turns.find((t) => t.turnIndex === existingIdx);
      if (found) return found;
    }
    const nextIndex = session.turns.length + 1;
    const promptSummary = this.latestPrompts.get(key) ?? this.latestPrompts.get("__default__") ?? `\u7B2C ${nextIndex} \u8F6E\u5BF9\u8BDD\u4FEE\u6539`;
    const turn = {
      turnIndex: nextIndex,
      dshSessionId,
      promptSummary,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      baseCommit: commitBefore,
      endCommit: commitBefore,
      files: {}
    };
    session.turns.push(turn);
    this.openTurnByDshSession.set(key, nextIndex);
    return turn;
  }
  async recordFileChange(input) {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const diff = await this.git.getFileDiff(input.fileBaseCommit, input.fileEndCommit, input.filePath);
    const existingSessionRef = active.files[input.filePath];
    const sessionBaseCommit = existingSessionRef ? existingSessionRef.baseCommit : input.fileBaseCommit;
    const sessionDiff = sessionBaseCommit === input.fileBaseCommit ? diff : await this.git.getFileDiff(sessionBaseCommit, input.fileEndCommit, input.filePath);
    const sessionKind = existingSessionRef?.record.changeKind === "A" && input.changeKind !== "D" ? "A" : sessionDiff.changeKind;
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
        externalPreEdit: Boolean(existingSessionRef?.record.externalPreEdit || input.externalPreEdit)
      }
    };
    const turn = this.ensureTurnForChange(active, input.dshSessionId, input.fileBaseCommit);
    const existingTurnRef = turn.files[input.filePath];
    const turnBaseCommit = existingTurnRef ? existingTurnRef.baseCommit : input.fileBaseCommit;
    const turnDiff = turnBaseCommit === input.fileBaseCommit ? diff : await this.git.getFileDiff(turnBaseCommit, input.fileEndCommit, input.filePath);
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
        changeKind: existingTurnRef?.record.changeKind === "A" && input.changeKind !== "D" ? "A" : turnDiff.changeKind,
        active: input.active,
        transport: input.transport ?? existingTurnRef?.record.transport,
        additions: turnDiff.additions,
        deletions: turnDiff.deletions,
        lastTool: input.toolName,
        updatedAt: now,
        externalPreEdit: Boolean(existingTurnRef?.record.externalPreEdit || input.externalPreEdit)
      }
    };
    turn.endCommit = input.fileEndCommit;
    active.headCommit = input.fileEndCommit;
    this.version++;
    await this.scheduleSave();
  }
  async markActivated(serverName, target) {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return;
    let changed = false;
    const matchRef = (ref) => {
      if (ref.record.serverName !== serverName) return false;
      if (target.allForServer) return true;
      if (target.filePath && ref.record.filePath === target.filePath) return true;
      if (target.objectName && ref.record.objectName === target.objectName && (!target.objectType || target.objectType === "OBJ" || ref.record.objectType === target.objectType)) {
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
  async recordFailedCall(toolName, objectKey, error) {
    await this.init();
    const active = this.getActiveSessionInternal();
    if (!active) return;
    active.failedCalls.push({
      toolName,
      objectKey,
      error: error.slice(0, 500),
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (active.failedCalls.length > 100) {
      active.failedCalls.splice(0, active.failedCalls.length - 100);
    }
    this.version++;
    await this.scheduleSave();
  }
  async getStateSummary() {
    await this.init();
    const active = this.getActiveSessionInternal();
    let activeSummary = null;
    if (active) {
      const files = Object.values(active.files).map((f) => f.record);
      activeSummary = {
        filesCount: files.length,
        additions: files.reduce((s, f) => s + f.additions, 0),
        deletions: files.reduce((s, f) => s + f.deletions, 0),
        turnsCount: active.turns.length,
        inactiveCount: files.filter((f) => f.active === false).length
      };
    }
    return {
      recording: active !== null,
      activeSessionId: active?.id ?? null,
      version: this.version,
      repoPath: this.git.repoDir,
      serversDetected: [...this.serversDetected].sort(),
      activeSummary
    };
  }
  async listSessions() {
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
        inactiveCount: files.filter((f) => f.active === false).length
      };
    });
  }
  async getSession(id) {
    await this.init();
    const s = this.data.sessions.find((item) => item.id === id);
    return s ? this.toPublicSession(s) : null;
  }
  async getDiffDetail(sessionId, filePath, turnParam) {
    await this.init();
    const s = this.data.sessions.find((item) => item.id === sessionId);
    if (!s) return null;
    let ref;
    if (turnParam && turnParam !== "all") {
      const turnNum = Number.parseInt(turnParam, 10);
      const turn = s.turns.find((t) => t.turnIndex === turnNum);
      ref = turn?.files[filePath];
    } else {
      ref = s.files[filePath];
    }
    if (!ref) return null;
    return this.git.getFileDiff(ref.baseCommit, ref.endCommit, filePath);
  }
  toPublicSession(s) {
    const sortFiles = (filesMap) => Object.values(filesMap).map((f) => f.record).sort((a, b) => a.filePath.localeCompare(b.filePath));
    const turns = s.turns.map((t) => ({
      turnIndex: t.turnIndex,
      dshSessionId: t.dshSessionId,
      promptSummary: t.promptSummary,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      baseCommit: t.baseCommit,
      endCommit: t.endCommit,
      files: sortFiles(t.files)
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
      failedCalls: [...s.failedCalls]
    };
  }
};

// src/host/shadow-git.ts
import { execFile } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import fs2 from "node:fs/promises";
import path2 from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var ShadowGitRepo = class {
  repoDir;
  lock = Promise.resolve();
  initialized = false;
  constructor(repoDir) {
    this.repoDir = path2.resolve(repoDir);
  }
  withLock(fn) {
    const prev = this.lock;
    let release;
    this.lock = new Promise((r) => {
      release = r;
    });
    return prev.then(fn).finally(() => release());
  }
  resolveSafePath(relPath) {
    const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const absPath = path2.resolve(this.repoDir, normalized);
    const rel = path2.relative(this.repoDir, absPath);
    if (!rel || rel.startsWith("..") || path2.isAbsolute(rel)) {
      throw new Error(`Invalid shadow repo path: ${relPath}`);
    }
    return { absPath, gitPath: rel.replace(/\\/g, "/") };
  }
  async git(args, allowNonZero = false) {
    try {
      const { stdout, stderr } = await execFileAsync("git", ["-c", "core.quotepath=false", ...args], {
        cwd: this.repoDir,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true
      });
      return { stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code: 0 };
    } catch (err) {
      const e = err;
      if (allowNonZero) {
        return {
          stdout: String(e.stdout ?? ""),
          stderr: String(e.stderr ?? ""),
          code: typeof e.code === "number" ? e.code : 1
        };
      }
      throw new Error(`git ${args.join(" ")} failed: ${e.stderr || e.message || String(err)}`);
    }
  }
  async ensureRepo() {
    return this.withLock(async () => {
      return this.ensureRepoUnlocked();
    });
  }
  async ensureRepoUnlocked() {
    if (this.initialized && existsSync2(path2.join(this.repoDir, ".git"))) {
      const head2 = await this.git(["rev-parse", "HEAD"], true);
      if (head2.code === 0 && head2.stdout.trim()) {
        return head2.stdout.trim();
      }
    }
    await fs2.mkdir(this.repoDir, { recursive: true });
    if (!existsSync2(path2.join(this.repoDir, ".git"))) {
      await this.git(["init", "-b", "main"]);
    }
    await this.git(["config", "user.name", "DSH ABAP Tracker"]);
    await this.git(["config", "user.email", "abap-tracker@dsh.local"]);
    await this.git(["config", "core.autocrlf", "false"]);
    const head = await this.git(["rev-parse", "HEAD"], true);
    if (head.code !== 0 || !head.stdout.trim()) {
      await this.git(["commit", "--allow-empty", "-m", "[init] initialize ABAP shadow repository"]);
    }
    this.initialized = true;
    const verified = await this.git(["rev-parse", "HEAD"]);
    return verified.stdout.trim();
  }
  async getHead() {
    return this.withLock(async () => this.ensureRepoUnlocked());
  }
  async readWorkingFile(relPath) {
    const { absPath } = this.resolveSafePath(relPath);
    try {
      const raw = await fs2.readFile(absPath, "utf8");
      return normalizeNewlines(raw);
    } catch {
      return null;
    }
  }
  async commitFile(relPath, content, message) {
    return this.withLock(async () => {
      const headBefore = await this.ensureRepoUnlocked();
      const { absPath, gitPath } = this.resolveSafePath(relPath);
      const normalized = normalizeNewlines(content);
      await fs2.mkdir(path2.dirname(absPath), { recursive: true });
      await fs2.writeFile(absPath, normalized, "utf8");
      await this.git(["add", "-f", "--", gitPath]);
      const diffCheck = await this.git(["diff", "--cached", "--quiet"], true);
      if (diffCheck.code === 0) {
        return { commitHash: headBefore, changed: false };
      }
      await this.git(["commit", "--no-verify", "-m", message]);
      const headAfter = await this.git(["rev-parse", "HEAD"]);
      return { commitHash: headAfter.stdout.trim(), changed: true };
    });
  }
  async deleteFile(relPath, message) {
    return this.withLock(async () => {
      const headBefore = await this.ensureRepoUnlocked();
      const { absPath, gitPath } = this.resolveSafePath(relPath);
      if (!existsSync2(absPath)) {
        return { commitHash: headBefore, changed: false };
      }
      await fs2.rm(absPath, { force: true });
      await this.git(["add", "-A", "--", gitPath]);
      const diffCheck = await this.git(["diff", "--cached", "--quiet"], true);
      if (diffCheck.code === 0) {
        return { commitHash: headBefore, changed: false };
      }
      await this.git(["commit", "--no-verify", "-m", message]);
      const headAfter = await this.git(["rev-parse", "HEAD"]);
      return { commitHash: headAfter.stdout.trim(), changed: true };
    });
  }
  async getRangeNumStat(baseCommit, headCommit) {
    if (!baseCommit || !headCommit || baseCommit === headCommit) return [];
    const [statusRes, numstatRes] = await Promise.all([
      this.git(["diff", "--name-status", "--no-renames", baseCommit, headCommit], true),
      this.git(["diff", "--numstat", "--no-renames", baseCommit, headCommit], true)
    ]);
    const statusMap = /* @__PURE__ */ new Map();
    for (const line of statusRes.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split("	");
      if (parts.length < 2) continue;
      const code = parts[0].trim().charAt(0).toUpperCase();
      const filePath = parts[1].trim();
      const kind = code === "A" ? "A" : code === "D" ? "D" : "M";
      statusMap.set(filePath, kind);
    }
    const entries = [];
    for (const line of numstatRes.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split("	");
      if (parts.length < 3) continue;
      const add = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
      const del = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
      const filePath = parts.slice(2).join("	").trim();
      entries.push({
        filePath,
        changeKind: statusMap.get(filePath) ?? "M",
        additions: add,
        deletions: del
      });
    }
    return entries;
  }
  async showAtCommit(commitHash, relPath) {
    const { gitPath } = this.resolveSafePath(relPath);
    const res = await this.git(["show", `${commitHash}:${gitPath}`], true);
    if (res.code !== 0) return null;
    return normalizeNewlines(res.stdout);
  }
  async getFileDiff(baseCommit, headCommit, relPath) {
    const { gitPath } = this.resolveSafePath(relPath);
    const [beforeRaw, afterRaw, diffRes, stats] = await Promise.all([
      this.showAtCommit(baseCommit, gitPath),
      this.showAtCommit(headCommit, gitPath),
      this.git(["diff", "-U3", "--no-renames", baseCommit, headCommit, "--", gitPath], true),
      this.getRangeNumStat(baseCommit, headCommit)
    ]);
    const stat = stats.find((s) => s.filePath === gitPath);
    const changeKind = stat?.changeKind ?? (beforeRaw === null ? afterRaw === null ? "D" : "A" : afterRaw === null ? "D" : "M");
    return {
      filePath: gitPath,
      baseCommit,
      headCommit,
      changeKind,
      beforeText: beforeRaw ?? "",
      afterText: afterRaw ?? "",
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      unifiedPatch: diffRes.stdout
    };
  }
};

// src/host/index.ts
var name = "abap-diff";
var inject = ["webServer", "tools"];
function resolveDshHomeDir() {
  const envHome = process.env.DSH_HOME;
  if (envHome && envHome.trim().length > 0) {
    const trimmed = envHome.trim();
    if (trimmed === "~") return os.homedir();
    if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
      return path3.join(os.homedir(), trimmed.slice(2));
    }
    return path3.resolve(trimmed);
  }
  return path3.join(os.homedir(), ".dsh");
}
function apply(ctx, config = {}) {
  const dataDir = config.dataDir?.trim() || path3.join(resolveDshHomeDir(), "abap-diff");
  const git = new ShadowGitRepo(path3.join(dataDir, "repo"));
  const store = new SessionStore(dataDir, git);
  void store.init().catch((err) => {
    ctx.logger?.error?.(`[abap-diff] init failed: ${err instanceof Error ? err.message : String(err)}`);
  });
  ctx.effect(
    () => ctx.webServer.register({
      kind: "prefix",
      path: ROUTE_PREFIX,
      handler: createAbapDiffHttpHandler(store)
    }),
    "abap-diff: http routes"
  );
  ctx.effect(() => attachAbapInterceptor(ctx, git, store), "abap-diff: mcp interceptor");
  ctx.effect(() => {
    const commands = ctx.get?.("commands");
    if (!commands || typeof commands.register !== "function") return () => {
    };
    return commands.register({
      name: "abap-diff",
      description: "\u63A7\u5236 ABAP \u4EE3\u7801\u53D8\u66F4\u8FFD\u8E2A\uFF1Astart / stop / status",
      input: { hint: "[start | stop | status]" },
      handler: async ({ rawInput }) => {
        const sub = rawInput.trim().toLowerCase() || "status";
        if (sub === "start") {
          const s = await store.startSession();
          return {
            kind: "success",
            text: `\u5DF2\u542F\u52A8 ABAP \u53D8\u66F4\u8FFD\u8E2A (${s.title})\uFF0C\u53EF\u5728\u5DE6\u4FA7\u300CABAP Diff\u300D\u9762\u677F\u67E5\u770B\u5B9E\u65F6\u5BF9\u6BD4\u3002`
          };
        }
        if (sub === "stop") {
          const stopped = await store.stopSession();
          if (!stopped) {
            return { kind: "success", text: "\u5F53\u524D\u672A\u5728\u8FFD\u8E2A\u4E2D\u3002" };
          }
          const add = stopped.files.reduce((n, f) => n + f.additions, 0);
          const del = stopped.files.reduce((n, f) => n + f.deletions, 0);
          return {
            kind: "success",
            text: `\u5DF2\u505C\u6B62\u8FFD\u8E2A (${stopped.title})\uFF1A\u5171\u53D8\u66F4 ${stopped.files.length} \u4E2A\u5BF9\u8C61 (+${add} / -${del})\uFF0C\u672C\u5730\u4ED3\u5E93\uFF1A${git.repoDir}`
          };
        }
        const state = await store.getStateSummary();
        if (!state.recording || !state.activeSummary) {
          return {
            kind: "success",
            text: `ABAP \u8FFD\u8E2A\u5F53\u524D\u672A\u542F\u52A8\u3002\u8F93\u5165 /abap-diff start \u6216\u5728\u754C\u9762\u9876\u90E8\u70B9\u51FB\u300C\u5F00\u542F\u8FFD\u8E2A\u300D\u3002`
          };
        }
        return {
          kind: "success",
          text: `ABAP \u8FFD\u8E2A\u8FDB\u884C\u4E2D\uFF1A\u5DF2\u8BB0\u5F55 ${state.activeSummary.turnsCount} \u8F6E\u5BF9\u8BDD\u3001${state.activeSummary.filesCount} \u4E2A\u5BF9\u8C61 (+${state.activeSummary.additions} / -${state.activeSummary.deletions})\u3002`
        };
      }
    });
  }, "abap-diff: slash command");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
