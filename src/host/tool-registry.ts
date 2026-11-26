export interface ReadCallSpec {
  rawToolName: string;
  args: Record<string, unknown>;
}

export interface ObjectTargetSpec {
  serverName: string;
  objectType: string;
  objectName: string;
  includeType?: string;
  parent?: string;
  methodName?: string;
  objectUrl?: string;
  filePath: string;
  readCall?: ReadCallSpec;
  fallbackSource?: string;
  autoActivated?: boolean;
  transport?: string;
}

export interface WriteIntent {
  kind: 'edit' | 'create' | 'delete' | 'activate' | 'activate-package';
  rawToolName: string;
  targets: ObjectTargetSpec[];
  packageName?: string;
}

export interface ParsedAdtUrl {
  objectType: string;
  objectName: string;
  includeType?: string;
  parent?: string;
}

export function sanitizeSegment(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/g, '') || 'UNKNOWN';
}

export function parseMcpToolName(publicName: string): { serverName: string; rawName: string } | null {
  const match = /^mcp__(.+?)__(.+)$/.exec(publicName);
  if (!match) return null;
  return { serverName: match[1], rawName: match[2] };
}

export function isAbapServerName(serverName: string): boolean {
  return /^abap[-_]?adt/i.test(serverName);
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function stripMirrorBanner(text: string): string {
  return text
    .replace(/\n\n\*----------------------------------------------------------------------\*\n\* \[SAP-MCP-Mirror:[\s\S]*?\*----------------------------------------------------------------------\*$/m, '')
    .replace(/\n\n\* \[SAP-MCP-Mirror: MIRROR\][^\n]*\*$/m, '');
}

export function extractTextFromToolOutput(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const obj = output as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  };
  if (Array.isArray(obj.content)) {
    const texts = obj.content
      .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text as string);
    if (texts.length > 0) {
      return normalizeNewlines(stripMirrorBanner(texts.join('\n')));
    }
  }
  if (obj.structuredContent !== undefined) {
    return JSON.stringify(obj.structuredContent, null, 2);
  }
  return null;
}

export function parseAdtUrl(rawUrl: string): ParsedAdtUrl | null {
  if (!rawUrl) return null;
  let cleaned = String(rawUrl).trim();
  try {
    if (/^https?:\/\//i.test(cleaned)) {
      cleaned = new URL(cleaned).pathname;
    }
  } catch {
    // ignore URL parse error and use raw string
  }
  cleaned = cleaned.split('?')[0].split('#')[0].replace(/\/+$/, '');

  const decode = (s: string) => {
    try {
      return decodeURIComponent(s).toUpperCase();
    } catch {
      return s.toUpperCase();
    }
  };

  let m: RegExpExecArray | null;

  // Classes & class includes: /sap/bc/adt/oo/classes/<name>(/source/main|/includes/<inc>)?
  if ((m = /\/oo\/classes\/([^/]+)(?:\/includes\/([^/]+)|\/source\/main)?$/i.exec(cleaned))) {
    const inc = m[2] ? m[2].toLowerCase() : undefined;
    return {
      objectType: 'CLAS',
      objectName: decode(m[1]),
      includeType: inc && inc !== 'main' ? inc : undefined,
    };
  }
  // Interfaces
  if ((m = /\/oo\/interfaces\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'INTF', objectName: decode(m[1]) };
  }
  // Programs
  if ((m = /\/programs\/programs\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'PROG', objectName: decode(m[1]) };
  }
  // Includes
  if ((m = /\/programs\/includes\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'INCL', objectName: decode(m[1]) };
  }
  // Function modules
  if ((m = /\/functions\/groups\/([^/]+)\/fmodules\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'FUNC', objectName: decode(m[2]), parent: decode(m[1]) };
  }
  // Function groups
  if ((m = /\/functions\/groups\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'FUGR', objectName: decode(m[1]) };
  }
  // CDS DDL
  if ((m = /\/ddic\/ddl\/sources\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'DDLS', objectName: decode(m[1]) };
  }
  // Behavior definitions
  if ((m = /\/bo\/behaviordefinitions\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'BDEF', objectName: decode(m[1]) };
  }
  // Service definitions
  if ((m = /\/ddic\/srvd\/sources\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'SRVD', objectName: decode(m[1]) };
  }
  // DDIC views / tables / structures
  if ((m = /\/ddic\/views\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'VIEW', objectName: decode(m[1]) };
  }
  if ((m = /\/ddic\/tables\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'TABL', objectName: decode(m[1]) };
  }
  if ((m = /\/ddic\/structures\/([^/]+)(?:\/source\/main)?$/i.exec(cleaned))) {
    return { objectType: 'STRU', objectName: decode(m[1]) };
  }
  // Message class
  if ((m = /\/messages\/([^/]+)$/i.exec(cleaned))) {
    return { objectType: 'MSAG', objectName: decode(m[1]) };
  }

  // Generic fallback: take last non-source segment
  const stripped = cleaned.replace(/\/source\/main$/i, '');
  const parts = stripped.split('/').filter(Boolean);
  if (parts.length > 0) {
    return {
      objectType: 'OBJ',
      objectName: decode(parts[parts.length - 1]),
    };
  }
  return null;
}

export function buildShadowFilePath(
  serverName: string,
  spec: { objectType: string; objectName: string; includeType?: string; parent?: string },
): string {
  const srv = sanitizeSegment(serverName);
  const type = sanitizeSegment(spec.objectType.toUpperCase());
  const name = sanitizeSegment(spec.objectName.toUpperCase());
  const inc = spec.includeType ? spec.includeType.toLowerCase() : undefined;

  if (type === 'CLAS') {
    const suffix = inc && inc !== 'main' ? `.clas.${sanitizeSegment(inc)}.abap` : '.clas.abap';
    return `${srv}/CLAS/${name}${suffix}`;
  }
  if (type === 'FUNC' && spec.parent) {
    return `${srv}/FUGR/${sanitizeSegment(spec.parent.toUpperCase())}/${name}.func.abap`;
  }
  if (type === 'TEXT') {
    return `${srv}/TEXT/${name}.texts.json`;
  }
  const ext = type.toLowerCase();
  return `${srv}/${type}/${name}.${ext}.abap`;
}

function makeGetSourceCall(spec: ParsedAdtUrl): ReadCallSpec | undefined {
  const supported = new Set([
    'PROG',
    'CLAS',
    'INTF',
    'FUNC',
    'FUGR',
    'INCL',
    'DDLS',
    'VIEW',
    'BDEF',
    'SRVD',
    'SRVB',
    'MSAG',
  ]);
  const type = spec.objectType.toUpperCase();
  if (!supported.has(type)) return undefined;

  if (type === 'CLAS' && spec.includeType && spec.includeType !== 'main') {
    return {
      rawToolName: 'GetSource',
      args: {
        object_type: 'CLAS',
        name: spec.objectName,
        include: spec.includeType,
      },
    };
  }
  const args: Record<string, unknown> = {
    object_type: type,
    name: spec.objectName,
  };
  if (type === 'FUNC' && spec.parent) {
    args.parent = spec.parent;
  }
  return { rawToolName: 'GetSource', args };
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function resolveWriteIntent(
  serverName: string,
  rawToolName: string,
  rawArgs: unknown,
): WriteIntent | null {
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  const transport = asString(args.transport);

  switch (rawToolName) {
    case 'EditSource':
    case 'UpdateSource': {
      const objectUrl = asString(args.object_url);
      if (!objectUrl) return null;
      const parsed = parseAdtUrl(objectUrl) ?? { objectType: 'OBJ', objectName: sanitizeSegment(objectUrl) };
      const methodName = asString(args.method)?.toUpperCase();
      return {
        kind: 'edit',
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
            fallbackSource: rawToolName === 'UpdateSource' ? asString(args.source) : undefined,
            autoActivated: false,
            transport,
          },
        ],
      };
    }

    case 'WriteSource': {
      const objectType = (asString(args.object_type) ?? 'OBJ').toUpperCase();
      const objectName = (asString(args.name) ?? '').toUpperCase();
      if (!objectName) return null;
      const mode = (asString(args.mode) ?? 'upsert').toLowerCase();
      const methodName = asString(args.method)?.toUpperCase();
      const targets: ObjectTargetSpec[] = [
        {
          serverName,
          objectType,
          objectName,
          methodName,
          filePath: buildShadowFilePath(serverName, { objectType, objectName }),
          readCall: makeGetSourceCall({ objectType, objectName }),
          fallbackSource: asString(args.source),
          autoActivated: false,
          transport,
        },
      ];
      if (objectType === 'CLAS' && asString(args.test_source)) {
        targets.push({
          serverName,
          objectType: 'CLAS',
          objectName,
          includeType: 'testclasses',
          filePath: buildShadowFilePath(serverName, {
            objectType: 'CLAS',
            objectName,
            includeType: 'testclasses',
          }),
          readCall: makeGetSourceCall({ objectType: 'CLAS', objectName, includeType: 'testclasses' }),
          fallbackSource: asString(args.test_source),
          autoActivated: false,
          transport,
        });
      }
      return {
        kind: mode === 'create' ? 'create' : 'edit',
        rawToolName,
        targets,
      };
    }

    case 'WriteProgram':
    case 'CreateAndActivateProgram': {
      const objectName = (asString(args.program_name) ?? '').toUpperCase();
      if (!objectName) return null;
      return {
        kind: rawToolName === 'CreateAndActivateProgram' ? 'create' : 'edit',
        rawToolName,
        targets: [
          {
            serverName,
            objectType: 'PROG',
            objectName,
            filePath: buildShadowFilePath(serverName, { objectType: 'PROG', objectName }),
            readCall: makeGetSourceCall({ objectType: 'PROG', objectName }),
            fallbackSource: asString(args.source),
            autoActivated: rawToolName === 'CreateAndActivateProgram',
            transport,
          },
        ],
      };
    }

    case 'WriteClass': {
      const objectName = (asString(args.class_name) ?? '').toUpperCase();
      if (!objectName) return null;
      return {
        kind: 'edit',
        rawToolName,
        targets: [
          {
            serverName,
            objectType: 'CLAS',
            objectName,
            filePath: buildShadowFilePath(serverName, { objectType: 'CLAS', objectName }),
            readCall: makeGetSourceCall({ objectType: 'CLAS', objectName }),
            fallbackSource: asString(args.source),
            autoActivated: false,
            transport,
          },
        ],
      };
    }

    case 'CreateClassWithTests': {
      const objectName = (asString(args.class_name) ?? '').toUpperCase();
      if (!objectName) return null;
      return {
        kind: 'create',
        rawToolName,
        targets: [
          {
            serverName,
            objectType: 'CLAS',
            objectName,
            filePath: buildShadowFilePath(serverName, { objectType: 'CLAS', objectName }),
            readCall: makeGetSourceCall({ objectType: 'CLAS', objectName }),
            fallbackSource: asString(args.class_source),
            autoActivated: false,
            transport,
          },
          {
            serverName,
            objectType: 'CLAS',
            objectName,
            includeType: 'testclasses',
            filePath: buildShadowFilePath(serverName, {
              objectType: 'CLAS',
              objectName,
              includeType: 'testclasses',
            }),
            readCall: makeGetSourceCall({ objectType: 'CLAS', objectName, includeType: 'testclasses' }),
            fallbackSource: asString(args.test_source),
            autoActivated: false,
            transport,
          },
        ],
      };
    }

    case 'UpdateClassInclude':
    case 'CreateTestInclude': {
      const objectName = (asString(args.class_name) ?? '').toUpperCase();
      if (!objectName) return null;
      const includeType =
        rawToolName === 'CreateTestInclude'
          ? 'testclasses'
          : (asString(args.include_type) ?? 'implementations').toLowerCase();
      return {
        kind: rawToolName === 'CreateTestInclude' ? 'create' : 'edit',
        rawToolName,
        targets: [
          {
            serverName,
            objectType: 'CLAS',
            objectName,
            includeType,
            filePath: buildShadowFilePath(serverName, {
              objectType: 'CLAS',
              objectName,
              includeType,
            }),
            readCall: makeGetSourceCall({ objectType: 'CLAS', objectName, includeType }),
            fallbackSource: asString(args.source),
            autoActivated: false,
            transport,
          },
        ],
      };
    }

    case 'CreateObject': {
      const objectType = (asString(args.object_type) ?? '').toUpperCase();
      const objectName = (asString(args.name) ?? '').toUpperCase();
      const parent = asString(args.parent_name)?.toUpperCase();
      if (!objectType || !objectName) return null;
      return {
        kind: 'create',
        rawToolName,
        targets: [
          {
            serverName,
            objectType,
            objectName,
            parent,
            filePath: buildShadowFilePath(serverName, { objectType, objectName, parent }),
            readCall: makeGetSourceCall({ objectType, objectName, parent }),
            fallbackSource: '',
            autoActivated: false,
            transport,
          },
        ],
      };
    }

    case 'DeleteObject': {
      const objectUrl = asString(args.object_url);
      if (!objectUrl) return null;
      const parsed = parseAdtUrl(objectUrl) ?? { objectType: 'OBJ', objectName: sanitizeSegment(objectUrl) };
      return {
        kind: 'delete',
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
            transport,
          },
        ],
      };
    }

    case 'SetTextElements': {
      const program = (asString(args.program) ?? '').toUpperCase();
      if (!program) return null;
      const language = asString(args.language);
      return {
        kind: 'edit',
        rawToolName,
        targets: [
          {
            serverName,
            objectType: 'TEXT',
            objectName: program,
            filePath: buildShadowFilePath(serverName, { objectType: 'TEXT', objectName: program }),
            readCall: {
              rawToolName: 'GetTextElements',
              args: language ? { program, language } : { program },
            },
            fallbackSource: JSON.stringify(
              {
                program,
                language: language ?? 'default',
                text_symbols: args.text_symbols ?? null,
                selection_texts: args.selection_texts ?? null,
                heading_texts: args.heading_texts ?? null,
              },
              null,
              2,
            ),
            autoActivated: false,
          },
        ],
      };
    }

    case 'Activate': {
      const objectUrl = asString(args.object_url);
      const objectName = asString(args.object_name)?.toUpperCase();
      const parsed = objectUrl ? parseAdtUrl(objectUrl) : null;
      if (!parsed && !objectName) return null;
      const resolved = parsed ?? { objectType: 'OBJ', objectName: objectName! };
      return {
        kind: 'activate',
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
            autoActivated: true,
          },
        ],
      };
    }

    case 'ActivatePackage': {
      return {
        kind: 'activate-package',
        rawToolName,
        targets: [],
        packageName: asString(args.package),
      };
    }

    default:
      return null;
  }
}
