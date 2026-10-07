#!/usr/bin/env node
/**
 * 把项目根的平台无关层单向同步进 miniprogram/。
 *
 * 单一真源永远是项目根：config/ core/ services/ 手写在项目根，src/theme.js 也手写在 /src/，
 * miniprogram/ 下的对应文件全是**产物**，禁止手工编辑（改了会被下次同步覆盖）。
 * 方向永远只有一条：项目根 → miniprogram/，绝不反向写回。
 *
 * 为什么必须同步：
 *   微信小程序只能引用自己目录内的文件，无法 require miniprogram/ 之外的模块。
 *
 * 为什么保持目录层级：
 *   core/valuation/index.js 里写的是 require('../../config/index.js')。
 *   只要 miniprogram/core/valuation/ 与 miniprogram/config/ 的相对关系与项目根一致，
 *   这些 require 路径原样成立，不必改成小程序专用写法，也不会产生第二份公式。
 *
 * 生成两份主题产物，真源都是 /src/theme.js：
 *   styles/theme.wxss  —— CSS 自定义属性，供 WXSS 用 var(--color-primary)
 *   styles/theme.js    —— CommonJS 模块，供页面 JS 取色（行内样式用），避免 JS 里写死色值
 *
 * 用法：
 *   node scripts/sync-miniprogram.js           写入并报告
 *   node scripts/sync-miniprogram.js --check   只检查是否漂移，漂移则退出码 1
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_ROOT = path.join(ROOT, 'miniprogram');

// 逐目录同步，源目录名与目标目录名相同（层级必须一致，见文件头说明）
const SYNC_DIRS = ['config', 'core', 'services'];

const THEME_SOURCE = path.join(ROOT, 'src', 'theme.js');
const THEME_WXSS = path.join(TARGET_ROOT, 'styles', 'theme.wxss');
const THEME_JS = path.join(TARGET_ROOT, 'styles', 'theme.js');

const BANNER_JS = [
  '// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。',
  '// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js'
].join('\n');

const BANNER_WXSS = [
  '/* [auto-generated] 由 scripts/sync-miniprogram.js 从 src/theme.js 生成，勿手改。',
  ' * 真源在 /src/theme.js，改真源后重跑：node scripts/sync-miniprogram.js */'
].join('\n');

function kebab(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function hexToRgba(hex, opacity) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + opacity + ')';
}

function readThemeSource(ctx) {
  const src = fs.readFileSync(THEME_SOURCE, 'utf8');
  const wanted = ['colors', 'font', 'spacing', 'radius', 'shadow'];
  const objects = {};

  wanted.forEach(function (name) {
    const re = new RegExp('export\\s+const\\s+' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\n\\});');
    const m = src.match(re);
    if (!m) {
      ctx.problems.push('无法从 src/theme.js 解析出 ' + name + ' —— 解析失败比生成空文件好，请检查导出写法');
      return;
    }
    objects[name] = new Function('return (' + m[1] + ');')();
    if (Object.keys(objects[name]).length === 0) {
      ctx.problems.push('src/theme.js 的 ' + name + ' 解析结果为空');
    }
  });

  // alpha 辅助函数原文照搬，避免在生成器里再实现一遍（那就是第二份真源了）
  const alphaMatch = src.match(/export\s+function\s+alpha\s*\([\s\S]*?\n\}/);
  if (!alphaMatch) {
    ctx.problems.push('无法从 src/theme.js 解析出 alpha 函数');
  }
  const alphaSrc = alphaMatch ? alphaMatch[0].replace(/^export\s+/, '') : '';

  return { objects: objects, alphaSrc: alphaSrc };
}

function buildThemeWxss(theme) {
  const o = theme.objects;
  if (!o.colors || !o.font || !o.spacing || !o.radius) return null;

  const lines = [];
  lines.push(BANNER_WXSS);
  lines.push('');
  lines.push('page {');

  Object.keys(o.colors).forEach(function (k) {
    lines.push('  --color-' + kebab(k) + ': ' + o.colors[k] + ';');
  });
  Object.keys(o.font.size).forEach(function (k) {
    lines.push('  --font-size-' + kebab(k) + ': ' + o.font.size[k] + 'px;');
  });
  Object.keys(o.font.weight).forEach(function (k) {
    lines.push('  --font-weight-' + kebab(k) + ': ' + o.font.weight[k] + ';');
  });
  Object.keys(o.font.lineHeight).forEach(function (k) {
    lines.push('  --line-height-' + kebab(k) + ': ' + o.font.lineHeight[k] + ';');
  });
  Object.keys(o.spacing).forEach(function (k) {
    lines.push('  --space-' + kebab(k) + ': ' + o.spacing[k] + 'px;');
  });
  Object.keys(o.radius).forEach(function (k) {
    lines.push('  --radius-' + kebab(k) + ': ' + o.radius[k] + 'px;');
  });
  if (o.shadow) {
    Object.keys(o.shadow).forEach(function (k) {
      const s = o.shadow[k];
      if (!s || !s.shadowOffset) return;
      lines.push('  --shadow-' + kebab(k) + ': ' +
        s.shadowOffset.width + 'px ' + s.shadowOffset.height + 'px ' +
        s.shadowRadius + 'px ' + hexToRgba(s.shadowColor, s.shadowOpacity) + ';');
    });
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function buildThemeJs(theme) {
  const o = theme.objects;
  if (!o.colors || !theme.alphaSrc) return null;

  const lines = [];
  lines.push(BANNER_JS);
  lines.push('// 供页面 JS 取色用（行内样式的动态色），WXSS 侧请改用 styles/theme.wxss 的 CSS 变量。');
  lines.push('');
  ['colors', 'font', 'spacing', 'radius'].forEach(function (name) {
    if (o[name]) lines.push('const ' + name + ' = ' + JSON.stringify(o[name], null, 2) + ';');
    lines.push('');
  });
  if (o.shadow) {
    lines.push('const shadow = ' + JSON.stringify(o.shadow, null, 2) + ';');
    lines.push('');
  }
  lines.push(theme.alphaSrc);
  lines.push('');
  lines.push('module.exports = {');
  lines.push('  colors: colors,');
  lines.push('  alpha: alpha,');
  lines.push('  font: font,');
  lines.push('  spacing: spacing,');
  lines.push('  radius: radius,');
  lines.push('  shadow: shadow');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function listJs(dir, base) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const rel = base ? base + '/' + entry.name : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.charAt(0) === '.') return;
      out.push.apply(out, listJs(full, rel));
    } else if (entry.name.slice(-3) === '.js') {
      out.push(rel);
    }
  });
  return out;
}

function emit(ctx, targetPath, content, label) {
  if (ctx.checkOnly) {
    let current = null;
    try {
      current = fs.readFileSync(targetPath, 'utf8');
    } catch (err) {
      current = null;
    }
    if (current !== content) {
      ctx.problems.push(label + ' 与真源不一致（跑 node scripts/sync-miniprogram.js 重新生成）');
    }
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
  ctx.written.push(label);
}

/**
 * 执行同步或漂移检查。
 *
 * 返回结果而不是直接 process.exit —— 校验脚本要在**同一个进程内**调用它。
 * 早先的做法是 spawn 一个子进程跑 `--check`，在 Windows 上会偶发
 * `spawnSync node.exe EBUSY`（同一个可执行文件被重复拉起时的文件锁竞争），
 * 导致校验结果时对时错。进程内调用把这个不确定性彻底去掉。
 */
function run(options) {
  const ctx = {
    checkOnly: !!(options && options.checkOnly),
    problems: [],
    written: []
  };

  SYNC_DIRS.forEach(function (dirName) {
    const srcDir = path.join(ROOT, dirName);
    if (!fs.existsSync(srcDir)) {
      ctx.problems.push('源目录不存在：' + dirName);
      return;
    }
    const files = listJs(srcDir, '');
    if (files.length === 0) {
      ctx.problems.push('源目录 ' + dirName + ' 下没有 .js 文件，同步等于清空，已中止');
      return;
    }
    files.forEach(function (rel) {
      const src = fs.readFileSync(path.join(srcDir, rel), 'utf8');
      emit(ctx, path.join(TARGET_ROOT, dirName, rel), BANNER_JS + '\n\n' + src, dirName + '/' + rel);
    });
  });

  const theme = readThemeSource(ctx);
  const wxss = buildThemeWxss(theme);
  if (wxss) emit(ctx, THEME_WXSS, wxss, 'styles/theme.wxss');
  const themeJs = buildThemeJs(theme);
  if (themeJs) emit(ctx, THEME_JS, themeJs, 'styles/theme.js');

  return ctx;
}

module.exports = { run: run };

if (require.main === module) {
  const ctx = run({ checkOnly: process.argv.indexOf('--check') >= 0 });

  if (ctx.problems.length > 0) {
    console.error(ctx.checkOnly ? '同步产物已漂移：' : '同步未完成：');
    ctx.problems.forEach(function (p) { console.error('  - ' + p); });
    process.exit(1);
  }

  if (ctx.checkOnly) {
    console.log('小程序同步产物与真源一致（config/ core/ services/ styles/theme.{wxss,js}）');
  } else {
    console.log('已同步 ' + ctx.written.length + ' 个文件到 miniprogram/：');
    ctx.written.forEach(function (w) { console.log('  - ' + w); });
  }
}
