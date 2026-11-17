/* eslint-disable */
/**
 * HGhub 插件协议（HPP）宿主实现，供 MoonTV 的 /api/hghub/* 适配层使用。
 *
 * 只实现插件实际会调用的子集：http / storage / crypto / codec / html /
 * endpoint / settings / log / env，以及 PluginError。
 * 不依赖任何第三方包，Node 20+。
 */

const nodeCrypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROTOCOL_VERSION = '1.0.0';

class PluginError extends Error {
  constructor(code, message, extra) {
    super(message || code);
    this.name = 'PluginError';
    this.code = code || 'INTERNAL';
    if (extra && typeof extra === 'object') {
      for (const key of Object.keys(extra)) this[key] = extra[key];
    }
  }
}

/* ------------------------------- 工具函数 ------------------------------- */

const toBuffer = (value) => {
  if (value == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(String(value), 'utf8');
};

const toBytes = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const joinUrl = (base, query) => {
  const url = new URL(base);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.href;
};

const decodeCharset = (buf, charset) => {
  const name = (charset || 'utf-8').toLowerCase();
  if (name === 'utf-8' || name === 'utf8') return buf.toString('utf8');
  try {
    return new TextDecoder(name).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
};

/* ------------------------------ 持久化存储 ------------------------------ */

const dataRoot = () => {
  const dir = process.env.HGHUB_DATA_DIR || path.join(os.tmpdir(), 'hghub-data');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return dir;
};

const readStore = (pluginId) => {
  const file = path.join(dataRoot(), `${pluginId.replace(/[^\w.-]/g, '_')}.json`);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { storage: {}, cookies: {} };
  } catch {
    return { storage: {}, cookies: {} };
  }
};

const writeStore = (pluginId, state) => {
  const file = path.join(dataRoot(), `${pluginId.replace(/[^\w.-]/g, '_')}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {
    /* 存储失败不影响调用本身 */
  }
};

const restoreValue = (entry) => {
  if (!entry) return undefined;
  if (entry.b64 !== undefined) return toBytes(Buffer.from(entry.b64, 'base64'));
  return entry.v;
};

const packValue = (value) => {
  if (value instanceof Uint8Array) return { b64: Buffer.from(value).toString('base64') };
  return { v: value === undefined ? null : value };
};

/* ------------------------------- 迷你 DOM ------------------------------- */

const parseAttributes = (raw) => {
  const attrs = {};
  const re = /([\w:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase();
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
};

const buildNode = (tag, attrs, inner, children, parent) => {
  const node = {
    tag,
    attrs,
    inner,
    children,
    parent,
    attr: (name) => {
      const key = String(name).toLowerCase();
      return key in attrs ? attrs[key] : null;
    },
    attrsMap: () => ({ ...attrs }),
    html: () => inner,
    text: () => {
      const collect = (n) => {
        let out = '';
        for (const child of n.children) {
          if (typeof child === 'string') out += child;
          else out += collect(child);
        }
        return out;
      };
      return collect(node).replace(/\s+/g, ' ').trim();
    },
    ownText: () =>
      children
        .filter((child) => typeof child === 'string')
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
    select: (selector) => query(node, selector),
    first: (selector) => query(node, selector)[0] || null,
  };
  return node;
};

const parseSelector = (selector) => {
  const parts = String(selector || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const tokens = part.split(/\s+/).filter(Boolean);
      return tokens.map((token) => {
        const attrMatches = [...token.matchAll(/\[([\w:@.-]+)(?:=['"]?([^'"\]]*)['"]?)?\]/g)];
        const bare = token.replace(/\[[^\]]*\]/g, '');
        const tagName = (bare.replace(/^[#.]/, '') || '').toLowerCase();
        const isClass = bare.startsWith('.');
        const isId = bare.startsWith('#');
        return {
          tag: isClass || isId ? '' : tagName,
          id: isId ? tagName : '',
          class: isClass ? tagName : '',
          attrs: attrMatches.map((m) => ({ name: m[1].toLowerCase(), value: m[2] })),
        };
      });
    });
  return parts;
};

const matchToken = (node, token) => {
  if (token.tag && node.tag !== token.tag) return false;
  if (token.id && node.attrs.id !== token.id) return false;
  if (token.class) {
    const classes = String(node.attrs.class || '').split(/\s+/);
    if (!classes.includes(token.class)) return false;
  }
  for (const attr of token.attrs) {
    if (!(attr.name in node.attrs)) return false;
    if (attr.value !== undefined && node.attrs[attr.name] !== attr.value) return false;
  }
  return true;
};

const descendants = (node, out = []) => {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    out.push(child);
    descendants(child, out);
  }
  return out;
};

const query = (root, selector) => {
  const groups = parseSelector(selector);
  const all = descendants(root);
  const result = [];
  for (const group of groups) {
    for (const node of all) {
      if (!matchToken(node, group[group.length - 1])) continue;
      // 校验祖先链（简化实现：只要链上任意祖先满足即可）
      let ok = true;
      let cursor = node.parent;
      for (let i = group.length - 2; i >= 0 && ok; i -= 1) {
        let found = false;
        while (cursor) {
          if (matchToken(cursor, group[i])) {
            found = true;
            cursor = cursor.parent;
            break;
          }
          cursor = cursor.parent;
        }
        ok = found;
      }
      if (ok && !result.includes(node)) result.push(node);
    }
  }
  return result;
};

const parseHtml = (html) => {
  const root = buildNode('#document', {}, String(html || ''), [], null);
  const stack = [root];
  const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([\w:-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let lastIndex = 0;
  let match;
  const source = String(html || '');
  const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  const pushText = (text) => {
    if (!text) return;
    stack[stack.length - 1].children.push(text);
  };

  while ((match = tokenRe.exec(source))) {
    pushText(source.slice(lastIndex, match.index));
    lastIndex = tokenRe.lastIndex;
    if (match[0].startsWith('<!--') || match[0].startsWith('<![CDATA[')) continue;
    const isClose = match[0].startsWith('</');
    const tag = String(match[1] || '').toLowerCase();
    const rawAttrs = match[2] || '';
    if (isClose) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack[i].inner = source.slice(0, match.index);
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs = parseAttributes(rawAttrs.replace(/\/$/, ''));
    const parent = stack[stack.length - 1];
    const node = buildNode(tag, attrs, '', [], parent);
    parent.children.push(node);
    const selfClosing = /\/\s*$/.test(match[0]) || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push(node);
  }
  pushText(source.slice(lastIndex));
  return root;
};

/* -------------------------------- 单个插件 ------------------------------- */

const createHost = ({ pluginId, meta, settings, endpoints, endpointId }) => {
  const state = readStore(pluginId);
  if (!state.storage) state.storage = {};
  if (!state.cookies) state.cookies = {};
  const persist = () => writeStore(pluginId, state);
  const httpCache = new Map();

  const settingsValues = (() => {
    const base = {};
    for (const item of meta?.settings || []) {
      if (item && item.key) base[item.key] = item.default;
    }
    const fromEnv = process.env.HGHUB_SETTINGS;
    if (fromEnv) {
      try {
        Object.assign(base, JSON.parse(fromEnv));
      } catch {
        /* ignore */
      }
    }
    return Object.assign(base, settings || {});
  })();

  const listEndpoints = () => {
    if (Array.isArray(endpoints) && endpoints.length) return endpoints;
    return [{ id: 'default', label: '默认线路', url: meta?.homepage || '' }];
  };

  const currentEndpoint = () => {
    const list = listEndpoints();
    return list.find((item) => item.id === endpointId) || list[0];
  };

  const cookieHeader = (url) => {
    const host = new URL(url).hostname;
    const now = Date.now();
    const pairs = [];
    for (const [key, cookie] of Object.entries(state.cookies)) {
      if (cookie.expiresAt && cookie.expiresAt < now) continue;
      if (cookie.domain && !host.endsWith(cookie.domain.replace(/^\./, ''))) continue;
      pairs.push(`${key}=${cookie.value}`);
    }
    return pairs.join('; ');
  };

  const saveSetCookies = (url, setCookies) => {
    if (!setCookies || !setCookies.length) return;
    const host = new URL(url).hostname;
    for (const raw of setCookies) {
      const [pair, ...attrs] = String(raw).split(';');
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const record = { value, domain: host };
      for (const attr of attrs) {
        const [rawKey, rawValue] = attr.split('=');
        const key = rawKey.trim().toLowerCase();
        if (key === 'domain' && rawValue) record.domain = rawValue.trim().toLowerCase();
        if (key === 'max-age' && rawValue) record.expiresAt = Date.now() + Number(rawValue) * 1000;
      }
      state.cookies[name] = record;
    }
    persist();
  };

  const httpFetch = async (request) => {
    const {
      url: rawUrl,
      method = 'GET',
      headers = {},
      query: qs,
      body,
      responseType = 'text',
      charset,
      timeoutMs = 15000,
      redirect = 'follow',
      maxBytes = 2 * 1024 * 1024,
      cache,
      retry = 0,
      credentials = 'include',
      signal,
    } = request || {};
    if (!rawUrl) throw new PluginError('INVALID_ARGUMENT', 'url 不能为空');
    const url = joinUrl(rawUrl, qs);
    if (!/^https?:$/.test(new URL(url).protocol)) {
      throw new PluginError('INVALID_ARGUMENT', '仅支持 http/https');
    }

    const cacheKey = `${method} ${url} ${JSON.stringify(headers)}`;
    if (cache && method === 'GET') {
      const hit = httpCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return { ...hit.response, fromCache: true };
      }
    }

    const buildInit = () => {
      const outHeaders = {};
      for (const [key, value] of Object.entries(headers)) {
        if (value === undefined || value === null) continue;
        outHeaders[String(key).toLowerCase()] = String(value);
      }
      if (!outHeaders['user-agent']) outHeaders['user-agent'] = 'HGhub/1.0 MoonTV-bridge';
      let payload;
      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        if (body && typeof body === 'object' && 'json' in body) {
          payload = JSON.stringify(body.json);
          if (!outHeaders['content-type']) outHeaders['content-type'] = 'application/json';
        } else if (body && typeof body === 'object' && 'form' in body) {
          payload = new URLSearchParams(body.form).toString();
          if (!outHeaders['content-type']) {
            outHeaders['content-type'] = 'application/x-www-form-urlencoded';
          }
        } else if (typeof body === 'string') {
          payload = body;
        } else {
          payload = toBuffer(body);
        }
      }
      if (credentials !== 'omit') {
        const cookie = cookieHeader(url);
        if (cookie) outHeaders['cookie'] = cookie;
      }
      return {
        method,
        headers: outHeaders,
        body: payload,
        redirect: body !== undefined && method !== 'GET' && method !== 'HEAD' ? 'manual' : redirect,
      };
    };

    const attempt = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs || 15000, 60000));
      const onAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      try {
        const response = await fetch(url, { ...buildInit(), signal: controller.signal });
        const buffer = Buffer.from(await response.arrayBuffer());
        const trimmed = buffer.length > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
        let data;
        if (responseType === 'json') {
          try {
            data = JSON.parse(decodeCharset(trimmed, charset));
          } catch {
            throw new PluginError('UPSTREAM_CHANGED', '响应不是合法 JSON');
          }
        } else if (responseType === 'bytes') {
          data = toBytes(trimmed);
        } else {
          data = decodeCharset(trimmed, charset);
        }
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key.toLowerCase()] = value;
        });
        const setCookies =
          typeof response.headers.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : [];
        saveSetCookies(url, setCookies);
        return {
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          url: response.url || url,
          headers: responseHeaders,
          setCookies,
          data,
          fromCache: false,
        };
      } catch (error) {
        if (error instanceof PluginError) throw error;
        if (error?.name === 'AbortError') {
          if (signal?.aborted) throw new PluginError('CANCELLED', '调用已取消');
          throw new PluginError('TIMEOUT', '请求超时');
        }
        throw new PluginError('NETWORK', `网络请求失败: ${error?.message || error}`);
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    };

    let lastError;
    for (let index = 0; index <= (method === 'GET' || method === 'HEAD' ? retry : 0); index += 1) {
      try {
        const response = await attempt();
        if (cache && method === 'GET' && response.ok && cache.ttlSec) {
          httpCache.set(cacheKey, {
            response,
            expiresAt: Date.now() + Math.min(cache.ttlSec, 86400) * 1000,
          });
        }
        return response;
      } catch (error) {
        lastError = error;
        if (!['NETWORK', 'TIMEOUT', 'UPSTREAM_CHANGED'].includes(error?.code)) throw error;
      }
    }
    throw lastError;
  };

  const storage = {
    async get(key) {
      const entry = state.storage[String(key)];
      if (!entry) return undefined;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        delete state.storage[String(key)];
        persist();
        return undefined;
      }
      return restoreValue(entry);
    },
    async set(key, value, options) {
      const entry = packValue(value);
      if (options && options.ttlSec) entry.expiresAt = Date.now() + options.ttlSec * 1000;
      state.storage[String(key)] = entry;
      persist();
    },
    async delete(key) {
      if (String(key) in state.storage) {
        delete state.storage[String(key)];
        persist();
      }
    },
    async keys(prefix) {
      const list = Object.keys(state.storage).filter((key) =>
        prefix ? key.startsWith(String(prefix)) : true
      );
      return list;
    },
    async clear() {
      state.storage = {};
      persist();
    },
  };

  const cryptoModule = {
    digest(algorithm, data) {
      return toBytes(nodeCrypto.createHash(normalizeHash(algorithm)).update(toBuffer(data)).digest());
    },
    hmac(algorithm, key, data) {
      return toBytes(
        nodeCrypto.createHmac(normalizeHash(algorithm), toBuffer(key)).update(toBuffer(data)).digest()
      );
    },
    aesEncrypt(params, data) {
      return aesRun(true, params, data);
    },
    aesDecrypt(params, data) {
      return aesRun(false, params, data);
    },
    rsaEncrypt(params, data) {
      const padding =
        params?.padding === 'oaep-sha1'
          ? nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING
          : params?.padding === 'oaep-sha256'
            ? nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING
            : nodeCrypto.constants.RSA_PKCS1_PADDING;
      return toBytes(
        nodeCrypto.publicEncrypt(
          {
            key: params.publicKey,
            padding,
            oaepHash: params.padding === 'oaep-sha256' ? 'sha256' : 'sha1',
          },
          toBuffer(data)
        )
      );
    },
    randomBytes(length) {
      return toBytes(nodeCrypto.randomBytes(Math.max(0, Math.min(65536, Number(length) || 0))));
    },
    randomUUID() {
      return nodeCrypto.randomUUID();
    },
  };

  const codec = {
    base64Encode(data, options) {
      const text = Buffer.from(toBuffer(data)).toString('base64');
      if (!options || !options.urlSafe) return text;
      const trimmed = options.pad === false ? text.replace(/=+$/, '') : text;
      return trimmed.replace(/\+/g, '-').replace(/\//g, '_');
    },
    base64Decode(text) {
      const normalized = String(text).replace(/-/g, '+').replace(/_/g, '/');
      return toBytes(Buffer.from(normalized, 'base64'));
    },
    hexEncode(data) {
      return Buffer.from(toBuffer(data)).toString('hex');
    },
    hexDecode(text) {
      return toBytes(Buffer.from(String(text), 'hex'));
    },
    utf8Encode(text) {
      return toBytes(Buffer.from(String(text), 'utf8'));
    },
    utf8Decode(data) {
      return Buffer.from(toBuffer(data)).toString('utf8');
    },
    decodeText(data, charset) {
      return decodeCharset(Buffer.from(toBuffer(data)), charset);
    },
  };

  const log = {
    debug: (...args) => console.log(`[hghub:${pluginId}]`, ...args),
    info: (...args) => console.log(`[hghub:${pluginId}]`, ...args),
    warn: (...args) => console.warn(`[hghub:${pluginId}]`, ...args),
    error: (...args) => console.error(`[hghub:${pluginId}]`, ...args),
  };

  const host = {
    PluginError,
    env: {
      protocol: PROTOCOL_VERSION,
      app: { name: 'MoonTV', version: 'hghub-bridge' },
      plugin: { id: pluginId, version: meta?.version || '0.0.0' },
      platform: 'linux',
      locale: 'zh-CN',
      features: [],
      media: { codecs: ['h264', 'hevc'] },
    },
    endpoint: {
      get current() {
        return currentEndpoint();
      },
      list() {
        return listEndpoints();
      },
    },
    http: { fetch: httpFetch },
    cookies: {
      async get({ url }) {
        const host2 = new URL(url).hostname;
        return Object.entries(state.cookies)
          .filter(([, cookie]) => !cookie.domain || host2.endsWith(cookie.domain.replace(/^\./, '')))
          .map(([name, cookie]) => ({ name, value: cookie.value, domain: cookie.domain }));
      },
      async set({ url, cookie }) {
        state.cookies[cookie.name] = {
          value: cookie.value,
          domain: cookie.domain || new URL(url).hostname,
          expiresAt: cookie.expiresAt,
        };
        persist();
      },
      async clear(params) {
        if (params?.url) {
          const host2 = new URL(params.url).hostname;
          for (const [name, cookie] of Object.entries(state.cookies)) {
            if (!cookie.domain || host2.endsWith(cookie.domain.replace(/^\./, ''))) {
              delete state.cookies[name];
            }
          }
        } else {
          state.cookies = {};
        }
        persist();
      },
    },
    storage,
    crypto: cryptoModule,
    codec,
    html: {
      parse: (html) => wrapRoot(parseHtml(html)),
    },
    settings: {
      get(key) {
        return settingsValues[key];
      },
      all() {
        return { ...settingsValues };
      },
    },
    log,
  };

  return host;
};

const wrapRoot = (root) => ({
  tag: '#document',
  select: (selector) => query(root, selector),
  first: (selector) => query(root, selector)[0] || null,
  text: () => root.text(),
  attr: () => null,
  attrs: () => ({}),
  html: () => '',
});

const normalizeHash = (algorithm) => {
  const name = String(algorithm || 'sha256').toLowerCase();
  if (name === 'md5' || name === 'sha1' || name === 'sha256' || name === 'sha512') return name;
  throw new PluginError('INVALID_ARGUMENT', `不支持的摘要算法: ${algorithm}`);
};

const aesRun = (encrypt, params, data) => {
  const mode = String(params?.mode || 'cbc').toLowerCase();
  const key = toBuffer(params?.key);
  const iv = toBuffer(params?.iv);
  const padding = params?.padding === 'none' ? null : 'pkcs7';
  const algorithm = `aes-${key.length * 8}-${mode}`;
  try {
    if (encrypt) {
      const cipher = nodeCrypto.createCipheriv(algorithm, key, mode === 'ecb' ? null : iv);
      if (padding) cipher.setAutoPadding(true);
      else cipher.setAutoPadding(false);
      return toBytes(Buffer.concat([cipher.update(toBuffer(data)), cipher.final()]));
    }
    const decipher = nodeCrypto.createDecipheriv(algorithm, key, mode === 'ecb' ? null : iv);
    if (padding) decipher.setAutoPadding(true);
    else decipher.setAutoPadding(false);
    return toBytes(Buffer.concat([decipher.update(toBuffer(data)), decipher.final()]));
  } catch (error) {
    throw new PluginError('INVALID_ARGUMENT', `AES 处理失败: ${error?.message || error}`);
  }
};

module.exports = { createHost, PluginError, PROTOCOL_VERSION };
