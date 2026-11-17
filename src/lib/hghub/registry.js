/* eslint-disable */
/**
 * HGhub 插件加载与实例缓存。
 *
 * 插件是 ESM 单文件（export const meta / export default factory），
 * 因此这里把它当作 .mjs 动态 import，再把 hg 宿主对象注入工厂函数。
 * 插件目录默认 public/hghub-plugins，可通过 HGHUB_PLUGINS_DIR 覆盖。
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { createHost } = require('./host');

const dynamicImport = new Function('specifier', 'return import(specifier)');

const pluginDir = () =>
  process.env.HGHUB_PLUGINS_DIR || path.join(process.cwd(), 'public', 'hghub-plugins');

const cache = new Map();

const readMetaOnly = (file) => {
  try {
    const source = fs.readFileSync(file, 'utf8');
    const metaMatch = source.match(/export\s+const\s+meta\s*=\s*\{[\s\S]*?\n\};/);
    if (!metaMatch) return {};
    // 用 Function 求值 meta 字面量，避免整套解析
    const literal = metaMatch[0]
      .replace(/^export\s+const\s+meta\s*=\s*/, '')
      .replace(/;\s*$/, '');
    return new Function(`return (${literal});`)();
  } catch {
    return {};
  }
};

const listPluginFiles = () => {
  const dir = pluginDir();
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /\.(mjs|js)$/i.test(name))
    .map((name) => path.join(dir, name));
};

const loadPlugin = async (id) => {
  if (cache.has(id)) return cache.get(id);

  const files = listPluginFiles();
  let target = null;
  for (const file of files) {
    const meta = readMetaOnly(file);
    if (meta && meta.id === id) {
      target = { file, meta };
      break;
    }
    if (path.basename(file).replace(/\.(mjs|js)$/i, '') === id) {
      target = { file, meta };
    }
  }
  if (!target) throw new Error(`未找到插件: ${id}`);

  const module = await dynamicImport(pathToFileURL(target.file).href);
  const meta = module.meta || target.meta || { id };
  const host = createHost({ pluginId: id, meta });
  const instance = typeof module.default === 'function' ? module.default(host) : module.default;
  const record = { id, meta, host, instance };
  cache.set(id, record);
  return record;
};

const listPlugins = () => {
  return listPluginFiles().map((file) => {
    const meta = readMetaOnly(file);
    return {
      id: meta.id || path.basename(file).replace(/\.(mjs|js)$/i, ''),
      name: meta.name || path.basename(file),
      version: meta.version,
      mature: !!meta.mature,
      file: path.basename(file),
    };
  });
};

/**
 * 统一的调用入口：插件方法可能挂在 plugin.media / plugin.search 等能力对象上。
 */
const callPlugin = async (id, abilityPath, params, timeoutMs = 40000) => {
  const plugin = await loadPlugin(id);
  const segments = abilityPath.split('.');
  let target = plugin.instance;
  for (const segment of segments) {
    target = target?.[segment];
  }
  if (typeof target !== 'function') {
    throw Object.assign(new Error(`插件 ${id} 未实现 ${abilityPath}`), { code: 'UNSUPPORTED' });
  }
  const ctx = {
    signal: AbortSignal.timeout(timeoutMs),
    plugin,
  };
  return target.call(resolveThis(plugin.instance, segments), params, ctx);
};

const resolveThis = (instance, segments) => {
  let target = instance;
  for (const segment of segments.slice(0, -1)) {
    target = target?.[segment];
  }
  return target || instance;
};

module.exports = { loadPlugin, listPlugins, callPlugin, pluginDir };
