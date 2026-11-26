// dsh-plugin-abap-diff client bundle
window.__ModuleLoader__.load({
  id: "dsh-plugin-abap-diff",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/AbapDiffWorkbench.tsx
var import_react2 = require("react");

// src/client/api.ts
var API_BASE = "/dsh-abap-diff";
async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...init?.body ? { "content-type": "application/json" } : {},
      ...init?.headers ?? {}
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}
var abapDiffApi = {
  getState: () => fetchJson(`${API_BASE}/state`),
  listSessions: () => fetchJson(`${API_BASE}/sessions`),
  getSession: (id) => fetchJson(`${API_BASE}/sessions/${encodeURIComponent(id)}`),
  getDiff: (id, filePath, turn = "all") => fetchJson(
    `${API_BASE}/sessions/${encodeURIComponent(id)}/diff?file=${encodeURIComponent(filePath)}&turn=${encodeURIComponent(turn)}`
  ),
  startSession: (title) => fetchJson(`${API_BASE}/sessions/start`, {
    method: "POST",
    body: JSON.stringify(title ? { title } : {})
  }),
  stopSession: () => fetchJson(`${API_BASE}/sessions/stop`, {
    method: "POST",
    body: "{}"
  }),
  deleteSession: (id) => fetchJson(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE"
  })
};
var currentState = null;
var currentError = null;
var listeners = /* @__PURE__ */ new Set();
var timer = null;
var inFlight = false;
function notify() {
  for (const fn of listeners) fn();
}
async function refreshTrackerState() {
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
function scheduleNextPoll() {
  if (timer !== null) clearTimeout(timer);
  if (listeners.size === 0) {
    timer = null;
    return;
  }
  const interval = currentState?.recording ? 1500 : 4e3;
  timer = setTimeout(async () => {
    if (typeof document === "undefined" || !document.hidden) {
      await refreshTrackerState();
    }
    scheduleNextPoll();
  }, interval);
}
function subscribeTrackerState(fn) {
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
function getTrackerSnapshot() {
  return { state: currentState, error: currentError };
}

// src/client/DiffViewer.tsx
var import_react = __toESM(require("react"), 1);

// node_modules/diff/lib/index.mjs
function Diff() {
}
Diff.prototype = {
  diff: function diff(oldString, newString) {
    var _options$timeout;
    var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    var callback = options.callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    var self = this;
    function done(value) {
      value = self.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return true;
      } else {
        return value;
      }
    }
    oldString = this.castInput(oldString, options);
    newString = this.castInput(newString, options);
    oldString = this.removeEmpty(this.tokenize(oldString, options));
    newString = this.removeEmpty(this.tokenize(newString, options));
    var newLen = newString.length, oldLen = oldString.length;
    var editLength = 1;
    var maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    var maxExecutionTime = (_options$timeout = options.timeout) !== null && _options$timeout !== void 0 ? _options$timeout : Infinity;
    var abortAfterTimestamp = Date.now() + maxExecutionTime;
    var bestPath = [{
      oldPos: -1,
      lastComponent: void 0
    }];
    var newPos = this.extractCommon(bestPath[0], newString, oldString, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(buildValues(self, bestPath[0].lastComponent, newString, oldString, self.useLongestToken));
    }
    var minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    function execEditLength() {
      for (var diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        var basePath = void 0;
        var removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        var canAdd = false;
        if (addPath) {
          var addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        var canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = self.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = self.addToPath(removePath, false, true, 1, options);
        }
        newPos = self.extractCommon(basePath, newString, oldString, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(buildValues(self, basePath.lastComponent, newString, oldString, self.useLongestToken));
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    }
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback();
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        var ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  },
  addToPath: function addToPath(path, added, removed, oldPosInc, options) {
    var last = path.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: {
          count: last.count + 1,
          added,
          removed,
          previousComponent: last.previousComponent
        }
      };
    } else {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: {
          count: 1,
          added,
          removed,
          previousComponent: last
        }
      };
    }
  },
  extractCommon: function extractCommon(basePath, newString, oldString, diagonalPath, options) {
    var newLen = newString.length, oldLen = oldString.length, oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldString[oldPos + 1], newString[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = {
          count: 1,
          previousComponent: basePath.lastComponent,
          added: false,
          removed: false
        };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = {
        count: commonCount,
        previousComponent: basePath.lastComponent,
        added: false,
        removed: false
      };
    }
    basePath.oldPos = oldPos;
    return newPos;
  },
  equals: function equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  },
  removeEmpty: function removeEmpty(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  },
  castInput: function castInput(value) {
    return value;
  },
  tokenize: function tokenize(value) {
    return Array.from(value);
  },
  join: function join(chars) {
    return chars.join("");
  },
  postProcess: function postProcess(changeObjects) {
    return changeObjects;
  }
};
function buildValues(diff2, lastComponent, newString, oldString, useLongestToken) {
  var components = [];
  var nextComponent;
  while (lastComponent) {
    components.push(lastComponent);
    nextComponent = lastComponent.previousComponent;
    delete lastComponent.previousComponent;
    lastComponent = nextComponent;
  }
  components.reverse();
  var componentPos = 0, componentLen = components.length, newPos = 0, oldPos = 0;
  for (; componentPos < componentLen; componentPos++) {
    var component = components[componentPos];
    if (!component.removed) {
      if (!component.added && useLongestToken) {
        var value = newString.slice(newPos, newPos + component.count);
        value = value.map(function(value2, i) {
          var oldValue = oldString[oldPos + i];
          return oldValue.length > value2.length ? oldValue : value2;
        });
        component.value = diff2.join(value);
      } else {
        component.value = diff2.join(newString.slice(newPos, newPos + component.count));
      }
      newPos += component.count;
      if (!component.added) {
        oldPos += component.count;
      }
    } else {
      component.value = diff2.join(oldString.slice(oldPos, oldPos + component.count));
      oldPos += component.count;
    }
  }
  return components;
}
var characterDiff = new Diff();
function longestCommonPrefix(str1, str2) {
  var i;
  for (i = 0; i < str1.length && i < str2.length; i++) {
    if (str1[i] != str2[i]) {
      return str1.slice(0, i);
    }
  }
  return str1.slice(0, i);
}
function longestCommonSuffix(str1, str2) {
  var i;
  if (!str1 || !str2 || str1[str1.length - 1] != str2[str2.length - 1]) {
    return "";
  }
  for (i = 0; i < str1.length && i < str2.length; i++) {
    if (str1[str1.length - (i + 1)] != str2[str2.length - (i + 1)]) {
      return str1.slice(-i);
    }
  }
  return str1.slice(-i);
}
function replacePrefix(string, oldPrefix, newPrefix) {
  if (string.slice(0, oldPrefix.length) != oldPrefix) {
    throw Error("string ".concat(JSON.stringify(string), " doesn't start with prefix ").concat(JSON.stringify(oldPrefix), "; this is a bug"));
  }
  return newPrefix + string.slice(oldPrefix.length);
}
function replaceSuffix(string, oldSuffix, newSuffix) {
  if (!oldSuffix) {
    return string + newSuffix;
  }
  if (string.slice(-oldSuffix.length) != oldSuffix) {
    throw Error("string ".concat(JSON.stringify(string), " doesn't end with suffix ").concat(JSON.stringify(oldSuffix), "; this is a bug"));
  }
  return string.slice(0, -oldSuffix.length) + newSuffix;
}
function removePrefix(string, oldPrefix) {
  return replacePrefix(string, oldPrefix, "");
}
function removeSuffix(string, oldSuffix) {
  return replaceSuffix(string, oldSuffix, "");
}
function maximumOverlap(string1, string2) {
  return string2.slice(0, overlapCount(string1, string2));
}
function overlapCount(a, b) {
  var startA = 0;
  if (a.length > b.length) {
    startA = a.length - b.length;
  }
  var endB = b.length;
  if (a.length < b.length) {
    endB = a.length;
  }
  var map = Array(endB);
  var k = 0;
  map[0] = 0;
  for (var j = 1; j < endB; j++) {
    if (b[j] == b[k]) {
      map[j] = map[k];
    } else {
      map[j] = k;
    }
    while (k > 0 && b[j] != b[k]) {
      k = map[k];
    }
    if (b[j] == b[k]) {
      k++;
    }
  }
  k = 0;
  for (var i = startA; i < a.length; i++) {
    while (k > 0 && a[i] != b[k]) {
      k = map[k];
    }
    if (a[i] == b[k]) {
      k++;
    }
  }
  return k;
}
var extendedWordChars = "a-zA-Z0-9_\\u{C0}-\\u{FF}\\u{D8}-\\u{F6}\\u{F8}-\\u{2C6}\\u{2C8}-\\u{2D7}\\u{2DE}-\\u{2FF}\\u{1E00}-\\u{1EFF}";
var tokenizeIncludingWhitespace = new RegExp("[".concat(extendedWordChars, "]+|\\s+|[^").concat(extendedWordChars, "]"), "ug");
var wordDiff = new Diff();
wordDiff.equals = function(left, right, options) {
  if (options.ignoreCase) {
    left = left.toLowerCase();
    right = right.toLowerCase();
  }
  return left.trim() === right.trim();
};
wordDiff.tokenize = function(value) {
  var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
  var parts;
  if (options.intlSegmenter) {
    if (options.intlSegmenter.resolvedOptions().granularity != "word") {
      throw new Error('The segmenter passed must have a granularity of "word"');
    }
    parts = Array.from(options.intlSegmenter.segment(value), function(segment) {
      return segment.segment;
    });
  } else {
    parts = value.match(tokenizeIncludingWhitespace) || [];
  }
  var tokens = [];
  var prevPart = null;
  parts.forEach(function(part) {
    if (/\s/.test(part)) {
      if (prevPart == null) {
        tokens.push(part);
      } else {
        tokens.push(tokens.pop() + part);
      }
    } else if (/\s/.test(prevPart)) {
      if (tokens[tokens.length - 1] == prevPart) {
        tokens.push(tokens.pop() + part);
      } else {
        tokens.push(prevPart + part);
      }
    } else {
      tokens.push(part);
    }
    prevPart = part;
  });
  return tokens;
};
wordDiff.join = function(tokens) {
  return tokens.map(function(token, i) {
    if (i == 0) {
      return token;
    } else {
      return token.replace(/^\s+/, "");
    }
  }).join("");
};
wordDiff.postProcess = function(changes, options) {
  if (!changes || options.oneChangePerToken) {
    return changes;
  }
  var lastKeep = null;
  var insertion = null;
  var deletion = null;
  changes.forEach(function(change) {
    if (change.added) {
      insertion = change;
    } else if (change.removed) {
      deletion = change;
    } else {
      if (insertion || deletion) {
        dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, change);
      }
      lastKeep = change;
      insertion = null;
      deletion = null;
    }
  });
  if (insertion || deletion) {
    dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, null);
  }
  return changes;
};
function dedupeWhitespaceInChangeObjects(startKeep, deletion, insertion, endKeep) {
  if (deletion && insertion) {
    var oldWsPrefix = deletion.value.match(/^\s*/)[0];
    var oldWsSuffix = deletion.value.match(/\s*$/)[0];
    var newWsPrefix = insertion.value.match(/^\s*/)[0];
    var newWsSuffix = insertion.value.match(/\s*$/)[0];
    if (startKeep) {
      var commonWsPrefix = longestCommonPrefix(oldWsPrefix, newWsPrefix);
      startKeep.value = replaceSuffix(startKeep.value, newWsPrefix, commonWsPrefix);
      deletion.value = removePrefix(deletion.value, commonWsPrefix);
      insertion.value = removePrefix(insertion.value, commonWsPrefix);
    }
    if (endKeep) {
      var commonWsSuffix = longestCommonSuffix(oldWsSuffix, newWsSuffix);
      endKeep.value = replacePrefix(endKeep.value, newWsSuffix, commonWsSuffix);
      deletion.value = removeSuffix(deletion.value, commonWsSuffix);
      insertion.value = removeSuffix(insertion.value, commonWsSuffix);
    }
  } else if (insertion) {
    if (startKeep) {
      insertion.value = insertion.value.replace(/^\s*/, "");
    }
    if (endKeep) {
      endKeep.value = endKeep.value.replace(/^\s*/, "");
    }
  } else if (startKeep && endKeep) {
    var newWsFull = endKeep.value.match(/^\s*/)[0], delWsStart = deletion.value.match(/^\s*/)[0], delWsEnd = deletion.value.match(/\s*$/)[0];
    var newWsStart = longestCommonPrefix(newWsFull, delWsStart);
    deletion.value = removePrefix(deletion.value, newWsStart);
    var newWsEnd = longestCommonSuffix(removePrefix(newWsFull, newWsStart), delWsEnd);
    deletion.value = removeSuffix(deletion.value, newWsEnd);
    endKeep.value = replacePrefix(endKeep.value, newWsFull, newWsEnd);
    startKeep.value = replaceSuffix(startKeep.value, newWsFull, newWsFull.slice(0, newWsFull.length - newWsEnd.length));
  } else if (endKeep) {
    var endKeepWsPrefix = endKeep.value.match(/^\s*/)[0];
    var deletionWsSuffix = deletion.value.match(/\s*$/)[0];
    var overlap = maximumOverlap(deletionWsSuffix, endKeepWsPrefix);
    deletion.value = removeSuffix(deletion.value, overlap);
  } else if (startKeep) {
    var startKeepWsSuffix = startKeep.value.match(/\s*$/)[0];
    var deletionWsPrefix = deletion.value.match(/^\s*/)[0];
    var _overlap = maximumOverlap(startKeepWsSuffix, deletionWsPrefix);
    deletion.value = removePrefix(deletion.value, _overlap);
  }
}
var wordWithSpaceDiff = new Diff();
wordWithSpaceDiff.tokenize = function(value) {
  var regex = new RegExp("(\\r?\\n)|[".concat(extendedWordChars, "]+|[^\\S\\n\\r]+|[^").concat(extendedWordChars, "]"), "ug");
  return value.match(regex) || [];
};
var lineDiff = new Diff();
lineDiff.tokenize = function(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  var retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (var i = 0; i < linesAndNewlines.length; i++) {
    var line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
};
lineDiff.equals = function(left, right, options) {
  if (options.ignoreWhitespace) {
    if (!options.newlineIsToken || !left.includes("\n")) {
      left = left.trim();
    }
    if (!options.newlineIsToken || !right.includes("\n")) {
      right = right.trim();
    }
  } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
    if (left.endsWith("\n")) {
      left = left.slice(0, -1);
    }
    if (right.endsWith("\n")) {
      right = right.slice(0, -1);
    }
  }
  return Diff.prototype.equals.call(this, left, right, options);
};
function diffLines(oldStr, newStr, callback) {
  return lineDiff.diff(oldStr, newStr, callback);
}
var sentenceDiff = new Diff();
sentenceDiff.tokenize = function(value) {
  return value.split(/(\S.+?[.!?])(?=\s+|$)/);
};
var cssDiff = new Diff();
cssDiff.tokenize = function(value) {
  return value.split(/([{}:;,]|\s+)/);
};
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}
var jsonDiff = new Diff();
jsonDiff.useLongestToken = true;
jsonDiff.tokenize = lineDiff.tokenize;
jsonDiff.castInput = function(value, options) {
  var undefinedReplacement = options.undefinedReplacement, _options$stringifyRep = options.stringifyReplacer, stringifyReplacer = _options$stringifyRep === void 0 ? function(k, v) {
    return typeof v === "undefined" ? undefinedReplacement : v;
  } : _options$stringifyRep;
  return typeof value === "string" ? value : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), stringifyReplacer, "  ");
};
jsonDiff.equals = function(left, right, options) {
  return Diff.prototype.equals.call(jsonDiff, left.replace(/,([\r\n])/g, "$1"), right.replace(/,([\r\n])/g, "$1"), options);
};
function canonicalize(obj, stack, replacementStack, replacer, key) {
  stack = stack || [];
  replacementStack = replacementStack || [];
  if (replacer) {
    obj = replacer(key, obj);
  }
  var i;
  for (i = 0; i < stack.length; i += 1) {
    if (stack[i] === obj) {
      return replacementStack[i];
    }
  }
  var canonicalizedObj;
  if ("[object Array]" === Object.prototype.toString.call(obj)) {
    stack.push(obj);
    canonicalizedObj = new Array(obj.length);
    replacementStack.push(canonicalizedObj);
    for (i = 0; i < obj.length; i += 1) {
      canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, key);
    }
    stack.pop();
    replacementStack.pop();
    return canonicalizedObj;
  }
  if (obj && obj.toJSON) {
    obj = obj.toJSON();
  }
  if (_typeof(obj) === "object" && obj !== null) {
    stack.push(obj);
    canonicalizedObj = {};
    replacementStack.push(canonicalizedObj);
    var sortedKeys = [], _key;
    for (_key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, _key)) {
        sortedKeys.push(_key);
      }
    }
    sortedKeys.sort();
    for (i = 0; i < sortedKeys.length; i += 1) {
      _key = sortedKeys[i];
      canonicalizedObj[_key] = canonicalize(obj[_key], stack, replacementStack, replacer, _key);
    }
    stack.pop();
    replacementStack.pop();
  } else {
    canonicalizedObj = obj;
  }
  return canonicalizedObj;
}
var arrayDiff = new Diff();
arrayDiff.tokenize = function(value) {
  return value.slice();
};
arrayDiff.join = arrayDiff.removeEmpty = function(value) {
  return value;
};

// src/client/diff-engine.ts
function splitLinesPreserve(text) {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
function buildRawDiffLines(beforeText, afterText) {
  const parts = diffLines(beforeText.replace(/\r\n/g, "\n"), afterText.replace(/\r\n/g, "\n"));
  const result = [];
  let oldLine = 1;
  let newLine = 1;
  for (const part of parts) {
    const lines = splitLinesPreserve(part.value);
    for (const line of lines) {
      if (part.added) {
        result.push({ kind: "add", oldLineNo: null, newLineNo: newLine++, text: line });
      } else if (part.removed) {
        result.push({ kind: "del", oldLineNo: oldLine++, newLineNo: null, text: line });
      } else {
        result.push({ kind: "context", oldLineNo: oldLine++, newLineNo: newLine++, text: line });
      }
    }
  }
  return result;
}
function computeVisibleMask(lines, contextLines, showAll) {
  if (showAll || lines.length === 0) return lines.map(() => true);
  const visible = new Array(lines.length).fill(false);
  let hasChanges = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "context") {
      hasChanges = true;
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) visible[j] = true;
    }
  }
  if (!hasChanges) {
    return lines.map((_, idx) => idx < 50);
  }
  return visible;
}
function buildUnifiedRows(beforeText, afterText, options = {}) {
  const raw = buildRawDiffLines(beforeText, afterText);
  const mask = computeVisibleMask(raw, options.contextLines ?? 3, options.showAll ?? false);
  const rows = [];
  let i = 0;
  while (i < raw.length) {
    if (mask[i]) {
      rows.push(raw[i]);
      i++;
    } else {
      const start = i;
      while (i < raw.length && !mask[i]) i++;
      rows.push({
        kind: "gap",
        oldLineNo: null,
        newLineNo: null,
        text: `\u5DF2\u6298\u53E0 ${i - start} \u884C\u672A\u4FEE\u6539\u4EE3\u7801`,
        hiddenCount: i - start,
        gapId: `gap-${start}-${i}`
      });
    }
  }
  return rows;
}
function buildSplitRows(beforeText, afterText, options = {}) {
  const raw = buildRawDiffLines(beforeText, afterText);
  const mask = computeVisibleMask(raw, options.contextLines ?? 3, options.showAll ?? false);
  const rows = [];
  let i = 0;
  while (i < raw.length) {
    if (!mask[i]) {
      const start = i;
      while (i < raw.length && !mask[i]) i++;
      rows.push({
        kind: "gap",
        leftLineNo: null,
        leftText: `\u5DF2\u6298\u53E0 ${i - start} \u884C\u672A\u4FEE\u6539\u4EE3\u7801`,
        leftKind: "context",
        rightLineNo: null,
        rightText: "",
        rightKind: "context",
        hiddenCount: i - start,
        gapId: `gap-${start}-${i}`
      });
      continue;
    }
    if (raw[i].kind === "context") {
      rows.push({
        kind: "row",
        leftLineNo: raw[i].oldLineNo,
        leftText: raw[i].text,
        leftKind: "context",
        rightLineNo: raw[i].newLineNo,
        rightText: raw[i].text,
        rightKind: "context"
      });
      i++;
      continue;
    }
    const dels = [];
    const adds = [];
    while (i < raw.length && raw[i].kind === "del") {
      dels.push(raw[i]);
      i++;
    }
    while (i < raw.length && raw[i].kind === "add") {
      adds.push(raw[i]);
      i++;
    }
    const pairCount = Math.max(dels.length, adds.length);
    for (let k = 0; k < pairCount; k++) {
      const d = dels[k];
      const a = adds[k];
      rows.push({
        kind: "row",
        leftLineNo: d ? d.oldLineNo : null,
        leftText: d ? d.text : "",
        leftKind: d ? "del" : "empty",
        rightLineNo: a ? a.newLineNo : null,
        rightText: a ? a.text : "",
        rightKind: a ? "add" : "empty"
      });
    }
  }
  return rows;
}
var ABAP_KEYWORDS = /* @__PURE__ */ new Set([
  "REPORT",
  "PROGRAM",
  "INCLUDE",
  "FUNCTION",
  "ENDFUNCTION",
  "CLASS",
  "ENDCLASS",
  "INTERFACE",
  "ENDINTERFACE",
  "METHOD",
  "ENDMETHOD",
  "FORM",
  "ENDFORM",
  "DEFINITION",
  "IMPLEMENTATION",
  "PUBLIC",
  "PROTECTED",
  "PRIVATE",
  "SECTION",
  "CREATE",
  "INHERITING",
  "FROM",
  "FOR",
  "TESTING",
  "RISK",
  "LEVEL",
  "DURATION",
  "METHODS",
  "CLASS-METHODS",
  "DATA",
  "CLASS-DATA",
  "CONSTANTS",
  "TYPES",
  "BEGIN",
  "END",
  "OF",
  "FIELD-SYMBOLS",
  "STATICS",
  "PARAMETERS",
  "SELECT-OPTIONS",
  "TABLES",
  "IMPORTING",
  "EXPORTING",
  "CHANGING",
  "RETURNING",
  "RAISING",
  "EXCEPTIONS",
  "TYPE",
  "LIKE",
  "REF",
  "TO",
  "TABLE",
  "STANDARD",
  "SORTED",
  "HASHED",
  "WITH",
  "KEY",
  "VALUE",
  "CORRESPONDING",
  "CONV",
  "CAST",
  "NEW",
  "COND",
  "SWITCH",
  "LET",
  "IN",
  "IF",
  "ELSEIF",
  "ELSE",
  "ENDIF",
  "CASE",
  "WHEN",
  "OTHERS",
  "ENDCASE",
  "DO",
  "ENDDO",
  "WHILE",
  "ENDWHILE",
  "LOOP",
  "AT",
  "INTO",
  "ASSIGNING",
  "REFERENCE",
  "ENDLOOP",
  "SELECT",
  "SINGLE",
  "UP",
  "ROWS",
  "WHERE",
  "ORDER",
  "BY",
  "GROUP",
  "HAVING",
  "JOIN",
  "INNER",
  "LEFT",
  "ON",
  "ENDSELECT",
  "INSERT",
  "UPDATE",
  "MODIFY",
  "DELETE",
  "APPEND",
  "CLEAR",
  "REFRESH",
  "FREE",
  "SORT",
  "READ",
  "TRY",
  "CATCH",
  "CLEANUP",
  "ENDTRY",
  "RAISE",
  "EXCEPTION",
  "MESSAGE",
  "CALL",
  "PERFORM",
  "SUBMIT",
  "RETURN",
  "EXIT",
  "CONTINUE",
  "CHECK",
  "ASSERT",
  "AND",
  "OR",
  "NOT",
  "IS",
  "INITIAL",
  "BOUND",
  "ASSIGNED",
  "EQ",
  "NE",
  "LT",
  "LE",
  "GT",
  "GE",
  "ABAP_TRUE",
  "ABAP_FALSE",
  "SY-SUBRC",
  "SY-TABIX",
  "ME",
  "SUPER"
]);
function tokenizeAbapLine(line) {
  if (!line) return [];
  if (line.startsWith("*")) {
    return [{ kind: "comment", text: line }];
  }
  const tokens = [];
  const regex = /("(?:.*)$)|('(?:''|[^'])*')|(`(?:``|[^`])*`)|(\b[A-Za-z_][A-Za-z0-9_-]*\b)|(\b\d+\b)/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ kind: "plain", text: line.slice(lastIdx, match.index) });
    }
    if (match[1] !== void 0) {
      tokens.push({ kind: "comment", text: match[1] });
    } else if (match[2] !== void 0 || match[3] !== void 0) {
      tokens.push({ kind: "string", text: match[0] });
    } else if (match[4] !== void 0) {
      const upper = match[4].toUpperCase();
      tokens.push({
        kind: ABAP_KEYWORDS.has(upper) ? "keyword" : "plain",
        text: match[4]
      });
    } else if (match[5] !== void 0) {
      tokens.push({ kind: "number", text: match[5] });
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < line.length) {
    tokens.push({ kind: "plain", text: line.slice(lastIdx) });
  }
  return tokens;
}

// src/client/DiffViewer.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function AbapHighlightedText({ text }) {
  const tokens = (0, import_react.useMemo)(() => tokenizeAbapLine(text), [text]);
  if (tokens.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "\xA0" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: tokens.map((tok, idx) => {
    if (tok.kind === "plain") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.default.Fragment, { children: tok.text }, idx);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `abap-tok-${tok.kind}`, children: tok.text }, idx);
  }) });
}
function DiffViewer({ record, diff: diff2, loading, error }) {
  const [viewMode, setViewMode] = (0, import_react.useState)("split");
  const [showAll, setShowAll] = (0, import_react.useState)(false);
  const [copiedLabel, setCopiedLabel] = (0, import_react.useState)(null);
  const splitRows = (0, import_react.useMemo)(() => {
    if (!diff2) return [];
    return buildSplitRows(diff2.beforeText, diff2.afterText, { contextLines: 3, showAll });
  }, [diff2, showAll]);
  const unifiedRows = (0, import_react.useMemo)(() => {
    if (!diff2) return [];
    return buildUnifiedRows(diff2.beforeText, diff2.afterText, { contextLines: 3, showAll });
  }, [diff2, showAll]);
  const copyText = (text, label) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 1500);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "abap-diff-viewer", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "abap-diff-viewer-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `abap-diff-kind-tag abap-diff-kind-${record.changeKind}`, children: record.changeKind }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { style: { fontSize: 13 }, children: [
          record.objectType,
          " ",
          record.objectName,
          record.includeType ? ` (${record.includeType})` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "abap-diff-meta-pill", children: record.serverName }),
        record.active === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "abap-diff-meta-pill active-ok", children: "\u25CF \u5DF2\u6FC0\u6D3B" }),
        record.active === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "abap-diff-meta-pill active-warn", children: "\u26A0 \u672A\u6FC0\u6D3B" }),
        record.transport && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "abap-diff-meta-pill", children: [
          "TR: ",
          record.transport
        ] }),
        record.externalPreEdit && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "abap-diff-meta-pill", title: "\u4FEE\u6539\u524D\u68C0\u6D4B\u5230 SAP \u670D\u52A1\u5668\u4E0A\u6709\u672A\u540C\u6B65\u7684\u4EBA\u5DE5\u6539\u52A8\uFF0C\u5DF2\u81EA\u52A8\u5206\u79BB\u57FA\u7EBF", children: "\u542B\u5916\u90E8\u53D8\u66F4\u57FA\u7EBF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "abap-diff-stats", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "abap-diff-stat-add", children: [
            "+",
            diff2?.additions ?? record.additions
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "abap-diff-stat-del", children: [
            "-",
            diff2?.deletions ?? record.deletions
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "abap-diff-segmented", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: `abap-diff-seg-btn ${viewMode === "split" ? "active" : ""}`,
              onClick: () => setViewMode("split"),
              children: "\u5DE6\u53F3\u5206\u680F"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: `abap-diff-seg-btn ${viewMode === "unified" ? "active" : ""}`,
              onClick: () => setViewMode("unified"),
              children: "\u884C\u5185\u5BF9\u6BD4"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "abap-diff-btn",
            onClick: () => setShowAll((v) => !v),
            children: showAll ? "\u4EC5\u770B\u53D8\u66F4\u4E0A\u4E0B\u6587" : "\u5C55\u5F00\u5168\u90E8\u6E90\u7801"
          }
        ),
        diff2?.unifiedPatch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "abap-diff-btn",
            onClick: () => copyText(diff2.unifiedPatch, "patch"),
            children: copiedLabel === "patch" ? "\u5DF2\u590D\u5236 Patch" : "\u590D\u5236 Diff"
          }
        )
      ] })
    ] }),
    loading && !diff2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "abap-diff-empty", children: "\u6B63\u5728\u8BFB\u53D6\u672C\u5730 Git Diff\u2026" }) : error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "abap-diff-empty", style: { color: "#dc2626" }, children: [
      "\u8BFB\u53D6 Diff \u5931\u8D25\uFF1A",
      error
    ] }) : !diff2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "abap-diff-empty", children: "\u672A\u627E\u5230\u53D8\u66F4\u5185\u5BB9\u3002" }) : viewMode === "split" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "abap-diff-code-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "abap-diff-table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("colgroup", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: 46 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: "calc(50% - 46px)" } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: 46 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: "calc(50% - 46px)" } })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: splitRows.map((row, idx) => {
        if (row.kind === "gap") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { className: "abap-diff-gap-row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 4, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              onClick: () => setShowAll(true),
              style: {
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 11
              },
              children: [
                "\u22EF ",
                row.leftText,
                "\uFF08\u70B9\u51FB\u5C55\u5F00\u5168\u6587\uFF09"
              ]
            }
          ) }) }, row.gapId ?? idx);
        }
        const leftCls = row.leftKind === "del" ? "abap-diff-line-del" : row.leftKind === "empty" ? "abap-diff-line-empty" : "";
        const rightCls = row.rightKind === "add" ? "abap-diff-line-add" : row.rightKind === "empty" ? "abap-diff-line-empty" : "";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: `abap-diff-ln ${leftCls}`, children: row.leftLineNo ?? "" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "td",
            {
              className: `abap-diff-code-cell ${leftCls}`,
              style: { borderRight: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))" },
              children: row.leftKind === "empty" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "\xA0" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AbapHighlightedText, { text: row.leftText })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: `abap-diff-ln ${rightCls}`, children: row.rightLineNo ?? "" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: `abap-diff-code-cell ${rightCls}`, children: row.rightKind === "empty" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "\xA0" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AbapHighlightedText, { text: row.rightText }) })
        ] }, idx);
      }) })
    ] }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "abap-diff-code-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "abap-diff-table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("colgroup", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: 46 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: 46 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { style: { width: 20 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", {})
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: unifiedRows.map((row, idx) => {
        if (row.kind === "gap") {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { className: "abap-diff-gap-row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 4, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              onClick: () => setShowAll(true),
              style: {
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 11
              },
              children: [
                "\u22EF ",
                row.text,
                "\uFF08\u70B9\u51FB\u5C55\u5F00\u5168\u6587\uFF09"
              ]
            }
          ) }) }, row.gapId ?? idx);
        }
        const rowCls = row.kind === "add" ? "abap-diff-line-add" : row.kind === "del" ? "abap-diff-line-del" : "";
        const sign = row.kind === "add" ? "+" : row.kind === "del" ? "-" : " ";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: rowCls, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "abap-diff-ln", children: row.oldLineNo ?? "" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "abap-diff-ln", children: row.newLineNo ?? "" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "abap-diff-sign", children: sign }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "abap-diff-code-cell", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AbapHighlightedText, { text: row.text }) })
        ] }, idx);
      }) })
    ] }) })
  ] });
}

// src/client/styles.ts
var STYLE_ID = "dsh-abap-diff-styles";
var CSS = `
.abap-diff-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-family: var(--dsw-font-family, system-ui, -apple-system, sans-serif);
  font-size: 13px;
  -webkit-app-region: no-drag;
}

.abap-diff-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}

.abap-diff-toolbar-left,
.abap-diff-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.abap-diff-title {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.abap-diff-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25));
}

.abap-diff-status-badge.recording {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
  border-color: rgba(22, 163, 74, 0.35);
}

.abap-diff-status-badge.idle {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.08));
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.abap-diff-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.abap-diff-dot.pulse {
  animation: abapDiffPulse 1.6s infinite;
}

@keyframes abapDiffPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

.abap-diff-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.3));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-primary, inherit);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.abap-diff-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14));
}

.abap-diff-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.abap-diff-btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.abap-diff-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.abap-diff-btn.danger {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(220, 38, 38, 0.35);
  color: #dc2626;
}

.abap-diff-btn.danger:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.2);
}

.abap-diff-select {
  height: 30px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.3));
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  max-width: 260px;
}

.abap-diff-segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.1));
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
}

.abap-diff-seg-btn {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.abap-diff-seg-btn.active {
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #111827);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}

.abap-diff-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.abap-diff-sidebar {
  width: 310px;
  min-width: 240px;
  max-width: 380px;
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
}

.abap-diff-sidebar-top {
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.abap-diff-search {
  width: 100%;
  box-sizing: border-box;
  height: 29px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.25));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  outline: none;
}

.abap-diff-search:focus {
  border-color: #2563eb;
}

.abap-diff-tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.abap-diff-group-header {
  padding: 7px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #6b7280);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.abap-diff-group-prompt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.abap-diff-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  padding: 7px 12px;
  cursor: pointer;
  font-size: 12px;
}

.abap-diff-file-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
}

.abap-diff-file-row.selected {
  background: rgba(37, 99, 235, 0.12);
}

.abap-diff-kind-tag {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.abap-diff-kind-A { background: rgba(22, 163, 74, 0.16); color: #16a34a; }
.abap-diff-kind-M { background: rgba(217, 119, 6, 0.16); color: #d97706; }
.abap-diff-kind-D { background: rgba(220, 38, 38, 0.16); color: #dc2626; }

.abap-diff-file-main {
  flex: 1;
  min-width: 0;
}

.abap-diff-file-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.abap-diff-file-sub {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
}

.abap-diff-stats {
  display: inline-flex;
  gap: 4px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  flex-shrink: 0;
}

.abap-diff-stat-add { color: #16a34a; }
.abap-diff-stat-del { color: #dc2626; }

.abap-diff-viewer {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.abap-diff-viewer-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.04));
}

.abap-diff-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22));
  background: var(--dsw-alias-bg-layer-1, transparent);
}

.abap-diff-meta-pill.active-ok {
  color: #16a34a;
  border-color: rgba(22, 163, 74, 0.35);
  background: rgba(22, 163, 74, 0.08);
}

.abap-diff-meta-pill.active-warn {
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.35);
  background: rgba(217, 119, 6, 0.08);
}

.abap-diff-code-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.abap-diff-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.abap-diff-ln {
  width: 46px;
  min-width: 46px;
  padding: 0 8px;
  text-align: right;
  user-select: none;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  border-right: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15));
  vertical-align: top;
}

.abap-diff-sign {
  width: 20px;
  min-width: 20px;
  text-align: center;
  user-select: none;
  vertical-align: top;
}

.abap-diff-code-cell {
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-word;
  vertical-align: top;
}

.abap-diff-line-add {
  background: rgba(22, 163, 74, 0.13);
}
.abap-diff-line-add .abap-diff-sign { color: #16a34a; font-weight: 700; }

.abap-diff-line-del {
  background: rgba(220, 38, 38, 0.13);
}
.abap-diff-line-del .abap-diff-sign { color: #dc2626; font-weight: 700; }

.abap-diff-line-empty {
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.05));
}

.abap-diff-gap-row td {
  background: rgba(59, 130, 246, 0.07);
  color: var(--dsw-alias-label-secondary, #6b7280);
  padding: 4px 12px;
  font-size: 11px;
  text-align: center;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.14));
}

.abap-tok-keyword { color: #2563eb; font-weight: 600; }
.abap-tok-comment { color: #6b7280; font-style: italic; }
.abap-tok-string { color: #059669; }
.abap-tok-number { color: #b45309; }

.abap-diff-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #6b7280);
}

.abap-header-pill-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.abap-header-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(128,128,128,0.28));
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.abap-header-pill-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14));
}

.abap-header-pill-btn.recording {
  border-color: rgba(22, 163, 74, 0.45);
  background: rgba(22, 163, 74, 0.11);
  color: #16a34a;
}

.abap-diff-footer-bar {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
`;
function ensureAbapDiffStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// src/client/AbapDiffWorkbench.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function AbapDiffWorkbench() {
  ensureAbapDiffStyles();
  const [snapshot, setSnapshot] = (0, import_react2.useState)(getTrackerSnapshot);
  const [sessions, setSessions] = (0, import_react2.useState)([]);
  const [selectedSessionId, setSelectedSessionId] = (0, import_react2.useState)(null);
  const [sessionDetail, setSessionDetail] = (0, import_react2.useState)(null);
  const [groupMode, setGroupMode] = (0, import_react2.useState)("turns");
  const [filterText, setFilterText] = (0, import_react2.useState)("");
  const [selection, setSelection] = (0, import_react2.useState)(null);
  const [diffDetail, setDiffDetail] = (0, import_react2.useState)(null);
  const [diffLoading, setDiffLoading] = (0, import_react2.useState)(false);
  const [diffError, setDiffError] = (0, import_react2.useState)(null);
  const [busyAction, setBusyAction] = (0, import_react2.useState)(false);
  const [copiedRepo, setCopiedRepo] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
    setSnapshot(getTrackerSnapshot());
    return subscribeTrackerState(() => {
      setSnapshot(getTrackerSnapshot());
    });
  }, []);
  const state = snapshot.state;
  const version = state?.version ?? 0;
  const reloadSessions = (0, import_react2.useCallback)(async () => {
    try {
      const res = await abapDiffApi.listSessions();
      setSessions(res.sessions);
      setSelectedSessionId((prev) => {
        if (prev && res.sessions.some((s) => s.id === prev)) return prev;
        return state?.activeSessionId ?? res.sessions[0]?.id ?? null;
      });
    } catch {
    }
  }, [state?.activeSessionId]);
  (0, import_react2.useEffect)(() => {
    void reloadSessions();
  }, [version, reloadSessions]);
  (0, import_react2.useEffect)(() => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      return;
    }
    let cancelled = false;
    void abapDiffApi.getSession(selectedSessionId).then((res) => {
      if (!cancelled) setSessionDetail(res.session);
    }).catch(() => {
      if (!cancelled) setSessionDetail(null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, version]);
  (0, import_react2.useEffect)(() => {
    if (!sessionDetail) {
      setSelection(null);
      return;
    }
    if (groupMode === "session") {
      const exists = selection && selection.turn === "all" && sessionDetail.files.some((f) => f.filePath === selection.filePath);
      if (!exists) {
        const first = sessionDetail.files[0];
        setSelection(first ? { filePath: first.filePath, turn: "all" } : null);
      }
    } else {
      const turnsDesc = [...sessionDetail.turns].reverse();
      const exists = selection && selection.turn !== "all" && turnsDesc.some(
        (t) => String(t.turnIndex) === selection.turn && t.files.some((f) => f.filePath === selection.filePath)
      );
      if (!exists) {
        for (const t of turnsDesc) {
          if (t.files.length > 0) {
            setSelection({ filePath: t.files[0].filePath, turn: String(t.turnIndex) });
            return;
          }
        }
        const first = sessionDetail.files[0];
        setSelection(first ? { filePath: first.filePath, turn: "all" } : null);
      }
    }
  }, [sessionDetail, groupMode]);
  (0, import_react2.useEffect)(() => {
    if (!selectedSessionId || !selection) {
      setDiffDetail(null);
      setDiffError(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    void abapDiffApi.getDiff(selectedSessionId, selection.filePath, selection.turn).then((res) => {
      if (!cancelled) {
        setDiffDetail(res.diff);
        setDiffLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setDiffError(err instanceof Error ? err.message : String(err));
        setDiffLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, selection?.filePath, selection?.turn, version]);
  const handleToggleTracking = async () => {
    setBusyAction(true);
    try {
      if (state?.recording) {
        const res = await abapDiffApi.stopSession();
        if (res.session) setSelectedSessionId(res.session.id);
      } else {
        const res = await abapDiffApi.startSession();
        setSelectedSessionId(res.session.id);
      }
      await refreshTrackerState();
      await reloadSessions();
    } finally {
      setBusyAction(false);
    }
  };
  const handleDeleteSession = async () => {
    if (!sessionDetail || sessionDetail.status === "recording") return;
    setBusyAction(true);
    try {
      await abapDiffApi.deleteSession(sessionDetail.id);
      setSelectedSessionId(null);
      await refreshTrackerState();
      await reloadSessions();
    } finally {
      setBusyAction(false);
    }
  };
  const matchesFilter = (0, import_react2.useCallback)(
    (f) => {
      const q = filterText.trim().toLowerCase();
      if (!q) return true;
      return f.objectName.toLowerCase().includes(q) || f.objectType.toLowerCase().includes(q) || f.serverName.toLowerCase().includes(q) || f.filePath.toLowerCase().includes(q) || (f.transport?.toLowerCase().includes(q) ?? false);
    },
    [filterText]
  );
  const selectedRecord = (0, import_react2.useMemo)(() => {
    if (!sessionDetail || !selection) return null;
    if (selection.turn !== "all") {
      const turn = sessionDetail.turns.find((t) => String(t.turnIndex) === selection.turn);
      const found = turn?.files.find((f) => f.filePath === selection.filePath);
      if (found) return found;
    }
    return sessionDetail.files.find((f) => f.filePath === selection.filePath) ?? null;
  }, [sessionDetail, selection]);
  const serverGroups = (0, import_react2.useMemo)(() => {
    if (!sessionDetail) return [];
    const map = /* @__PURE__ */ new Map();
    for (const f of sessionDetail.files) {
      if (!matchesFilter(f)) continue;
      const list = map.get(f.serverName) ?? [];
      list.push(f);
      map.set(f.serverName, list);
    }
    return [...map.entries()];
  }, [sessionDetail, matchesFilter]);
  const turnGroups = (0, import_react2.useMemo)(() => {
    if (!sessionDetail) return [];
    return [...sessionDetail.turns].reverse().map((t) => ({
      ...t,
      files: t.files.filter(matchesFilter)
    })).filter((t) => t.files.length > 0);
  }, [sessionDetail, matchesFilter]);
  const totalAdds = sessionDetail?.files.reduce((s, f) => s + f.additions, 0) ?? 0;
  const totalDels = sessionDetail?.files.reduce((s, f) => s + f.deletions, 0) ?? 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-toolbar-left", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "ABAP \u4EE3\u7801\u53D8\u66F4\u8FFD\u8E2A" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: `abap-diff-status-badge ${state?.recording ? "recording" : "idle"}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `abap-diff-dot ${state?.recording ? "pulse" : ""}` }),
            state?.recording ? "\u8FFD\u8E2A\u4E2D" : "\u672A\u542F\u52A8"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            disabled: busyAction,
            className: `abap-diff-btn ${state?.recording ? "danger" : "primary"}`,
            onClick: () => void handleToggleTracking(),
            children: state?.recording ? "\u5173\u95ED\u8FFD\u8E2A" : "\u542F\u52A8\u8FFD\u8E2A"
          }
        ),
        sessions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "select",
          {
            className: "abap-diff-select",
            value: selectedSessionId ?? "",
            onChange: (e) => setSelectedSessionId(e.target.value || null),
            title: "\u5207\u6362\u67E5\u770B\u5F53\u524D\u6216\u5386\u53F2\u8FFD\u8E2A\u4F1A\u8BDD",
            children: sessions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: s.id, children: [
              s.status === "recording" ? "\u25CF " : "",
              s.title,
              " (",
              s.filesCount,
              " \u5BF9\u8C61, +",
              s.additions,
              "/-",
              s.deletions,
              ")"
            ] }, s.id))
          }
        ),
        sessionDetail && sessionDetail.status === "closed" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            disabled: busyAction,
            className: "abap-diff-btn",
            onClick: () => void handleDeleteSession(),
            title: "\u5220\u9664\u6B64\u5386\u53F2\u8BB0\u5F55",
            children: "\u5220\u9664\u8BB0\u5F55"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-toolbar-right", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-segmented", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: `abap-diff-seg-btn ${groupMode === "turns" ? "active" : ""}`,
              onClick: () => setGroupMode("turns"),
              children: "\u6309\u8F6E\u6B21 (Turn)"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: `abap-diff-seg-btn ${groupMode === "session" ? "active" : ""}`,
              onClick: () => setGroupMode("session"),
              children: "\u6309\u6574\u6B21\u4F1A\u8BDD"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "abap-diff-btn",
            onClick: () => {
              void refreshTrackerState();
              void reloadSessions();
            },
            children: "\u5237\u65B0"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-sidebar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-sidebar-top", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              type: "text",
              className: "abap-diff-search",
              placeholder: "\u641C\u7D22\u5BF9\u8C61\u540D / \u7CFB\u7EDF / TR...",
              value: filterText,
              onChange: (e) => setFilterText(e.target.value)
            }
          ),
          sessionDetail && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              sessionDetail.turns.length,
              " \u8F6E\u5BF9\u8BDD \xB7 ",
              sessionDetail.files.length,
              " \u4E2A\u5BF9\u8C61"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-stats", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-stat-add", children: [
                "+",
                totalAdds
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-stat-del", children: [
                "-",
                totalDels
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-tree", children: [
          !sessionDetail ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-empty", style: { padding: 20 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6682\u65E0\u8FFD\u8E2A\u4F1A\u8BDD" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 12 }, children: "\u70B9\u51FB\u5DE6\u4E0A\u89D2\u300C\u542F\u52A8\u8FFD\u8E2A\u300D\u540E\u8BA9 AI \u4FEE\u6539 ABAP \u4EE3\u7801\u5373\u53EF\u5728\u6B64\u67E5\u770B Diff\u3002" })
          ] }) : groupMode === "turns" ? turnGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "abap-diff-empty", style: { padding: 20 }, children: sessionDetail.status === "recording" ? "\u8FFD\u8E2A\u5DF2\u5F00\u542F\uFF0C\u7B49\u5F85 AI \u6267\u884C ABAP \u5199\u64CD\u4F5C\u2026" : "\u672C\u6B21\u4F1A\u8BDD\u672A\u6355\u83B7\u5230 ABAP \u4EE3\u7801\u4FEE\u6539\u3002" }) : turnGroups.map((turn) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-group-header", title: turn.promptSummary, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-group-prompt", children: [
                "Turn #",
                turn.turnIndex,
                ": ",
                turn.promptSummary
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: turn.files.length })
            ] }),
            turn.files.map((f) => {
              const isSel = selection?.filePath === f.filePath && selection?.turn === String(turn.turnIndex);
              return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                FileRow,
                {
                  record: f,
                  selected: isSel,
                  onSelect: () => setSelection({ filePath: f.filePath, turn: String(turn.turnIndex) })
                },
                `${turn.turnIndex}:${f.filePath}`
              );
            })
          ] }, turn.turnIndex)) : serverGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "abap-diff-empty", style: { padding: 20 }, children: sessionDetail.status === "recording" ? "\u8FFD\u8E2A\u5DF2\u5F00\u542F\uFF0C\u7B49\u5F85 AI \u6267\u884C ABAP \u5199\u64CD\u4F5C\u2026" : "\u672C\u6B21\u4F1A\u8BDD\u672A\u6355\u83B7\u5230 ABAP \u4EE3\u7801\u4FEE\u6539\u3002" }) : serverGroups.map(([srv, files]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-group-header", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: srv }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: files.length })
            ] }),
            files.map((f) => {
              const isSel = selection?.filePath === f.filePath && selection?.turn === "all";
              return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                FileRow,
                {
                  record: f,
                  selected: isSel,
                  onSelect: () => setSelection({ filePath: f.filePath, turn: "all" })
                },
                f.filePath
              );
            })
          ] }, srv)),
          sessionDetail && sessionDetail.failedCalls.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "10px 12px", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.18))" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: 11, fontWeight: 600, color: "#dc2626", marginBottom: 4 }, children: [
              "\u5931\u8D25\u5199\u5165\u8BB0\u5F55 (",
              sessionDetail.failedCalls.length,
              ")"
            ] }),
            sessionDetail.failedCalls.slice(-5).map((fc, idx) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: 11, opacity: 0.8, marginBottom: 4 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: fc.toolName }),
              " ",
              fc.objectKey,
              ": ",
              fc.error
            ] }, idx))
          ] })
        ] })
      ] }),
      selectedRecord ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        DiffViewer,
        {
          record: selectedRecord,
          diff: diffDetail,
          loading: diffLoading,
          error: diffError
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 15, fontWeight: 600 }, children: state?.recording ? "ABAP \u53D8\u66F4\u8FFD\u8E2A\u8FD0\u884C\u4E2D" : "\u51C6\u5907\u597D\u8FFD\u8E2A AI \u5BF9 SAP ABAP \u7684\u4FEE\u6539" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { maxWidth: 460, lineHeight: 1.6 }, children: state?.recording ? "\u63D2\u4EF6\u6B63\u5728\u53EA\u8BFB\u76D1\u542C\u6240\u6709 abap-adt* MCP \u5199\u64CD\u4F5C\u3002\u6BCF\u5F53 AI \u4FEE\u6539\u3001\u521B\u5EFA\u3001\u5220\u9664\u6216\u6FC0\u6D3B ABAP \u5BF9\u8C61\u65F6\uFF0C\u4F1A\u81EA\u52A8\u62C9\u53D6 SAP \u57FA\u7EBF\u5E76\u751F\u6210\u672C\u5730 Git Diff\u3002" : "\u70B9\u51FB\u300C\u542F\u52A8\u8FFD\u8E2A\u300D\u5F00\u59CB\u5F55\u5236\u3002\u4F60\u53EF\u4EE5\u968F\u65F6\u5173\u95ED\u8FFD\u8E2A\uFF0C\u5E76\u5728\u672C\u5730\u5B89\u5168\u67E5\u770B\u6BCF\u4E00\u8F6E\u5BF9\u8BDD\u3001\u6BCF\u4E00\u4E2A\u5BF9\u8C61\u7684\u7CBE\u786E\u4EE3\u7801\u6539\u52A8\u5BF9\u6BD4\u3002" }),
        !state?.recording && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "abap-diff-btn primary",
            onClick: () => void handleToggleTracking(),
            children: "\u7ACB\u5373\u542F\u52A8\u8FFD\u8E2A"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-footer-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { whiteSpace: "nowrap" }, children: [
        "\u5DF2\u8BC6\u522B MCP:",
        " ",
        state?.serversDetected?.length ? state.serversDetected.join(", ") : "\u7B49\u5F85 abap-adt \u5DE5\u5177\u6CE8\u518C"
      ] }) }),
      state?.repoPath && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }, children: [
          "\u672C\u5730\u5F71\u5B50 Git: ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: state.repoPath })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "abap-diff-btn",
            style: { height: 22, padding: "0 8px", fontSize: 11 },
            onClick: () => {
              void navigator.clipboard?.writeText(state.repoPath).then(() => {
                setCopiedRepo(true);
                setTimeout(() => setCopiedRepo(false), 1500);
              });
            },
            children: copiedRepo ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u8DEF\u5F84"
          }
        )
      ] })
    ] })
  ] });
}
function FileRow({
  record,
  selected,
  onSelect
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      className: `abap-diff-file-row ${selected ? "selected" : ""}`,
      onClick: onSelect,
      title: record.filePath,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `abap-diff-kind-tag abap-diff-kind-${record.changeKind}`, children: record.changeKind }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-file-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-file-name", children: [
            record.objectName,
            record.includeType ? `.${record.includeType}` : ""
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "abap-diff-file-sub", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: record.objectType }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: record.serverName }),
            record.active === false && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "#d97706" }, children: "\xB7 \u672A\u6FC0\u6D3B" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-stats", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-stat-add", children: [
            "+",
            record.additions
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "abap-diff-stat-del", children: [
            "-",
            record.deletions
          ] })
        ] })
      ]
    }
  );
}

// src/client/HeaderPill.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function HeaderPill({ onOpenPanel }) {
  ensureAbapDiffStyles();
  const [snapshot, setSnapshot] = (0, import_react3.useState)(getTrackerSnapshot);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
    setSnapshot(getTrackerSnapshot());
    return subscribeTrackerState(() => {
      setSnapshot(getTrackerSnapshot());
    });
  }, []);
  const state = snapshot.state;
  const recording = Boolean(state?.recording);
  const count = state?.activeSummary?.filesCount ?? 0;
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (recording) {
        await abapDiffApi.stopSession();
      } else {
        await abapDiffApi.startSession();
      }
      await refreshTrackerState();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "abap-header-pill-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        disabled: busy,
        className: `abap-header-pill-btn ${recording ? "recording" : ""}`,
        onClick: () => void toggle(),
        title: recording ? "\u70B9\u51FB\u5173\u95ED ABAP \u4EE3\u7801\u53D8\u66F4\u8FFD\u8E2A" : "\u70B9\u51FB\u542F\u52A8 ABAP \u4EE3\u7801\u53D8\u66F4\u8FFD\u8E2A",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `abap-diff-dot ${recording ? "pulse" : ""}` }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: recording ? `ABAP\u8FFD\u8E2A\u4E2D (${count})` : "ABAP\u8FFD\u8E2A: \u5173" })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "abap-header-pill-btn",
        onClick: onOpenPanel,
        title: "\u6253\u5F00 ABAP Diff \u5BF9\u6BD4\u9762\u677F",
        children: "Diff"
      }
    )
  ] });
}

// src/client/index.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var name = "abap-diff";
var inject = ["slots"];
var PANEL_ID = "abap-diff";
function AbapDiffNavIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "4", cy: "4", r: "1.75" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "4", cy: "12", r: "1.75" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "12", cy: "6", r: "1.75" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M4 5.75v4.5M12 7.75c0 2.5-2.5 2.75-8 2.75" })
      ]
    }
  );
}
function apply(ctx) {
  const openWorkbench = () => {
    try {
      ctx.get?.("layout")?.selectPanel?.(PANEL_ID);
    } catch (err) {
      console.warn("[dsh-plugin-abap-diff] Failed to open panel:", err);
    }
  };
  ctx.effect(() => {
    return ctx.slots.inject(
      "main",
      () => ctx.slots.register(
        {
          name: "main",
          key: PANEL_ID
        },
        () => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(AbapDiffWorkbench, {})
      )
    );
  }, "abap-diff: main panel");
  ctx.effect(() => {
    return ctx.slots.inject(
      "sidebar.panellist",
      () => ctx.slots.register(
        {
          name: "sidebar.panellist",
          id: PANEL_ID,
          order: 45,
          label: () => "ABAP Diff"
        },
        (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(AbapDiffNavIcon, { size: props?.size ?? 16 })
      )
    );
  }, "abap-diff: sidebar entry");
  ctx.effect(() => {
    return ctx.slots.inject(
      "conversation.session.header.utilities",
      () => ctx.slots.register(
        {
          name: "conversation.session.header.utilities",
          id: "abap-diff-header",
          order: -10
        },
        () => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(HeaderPill, { onOpenPanel: openWorkbench })
      )
    );
  }, "abap-diff: header utility");
}

    return module.exports;
  }
});
