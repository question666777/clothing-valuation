/**
 * 官方价格源同步 · 主入口
 *
 * 用法：
 *   node server/fetch-prices.js            抓取并打印报告
 *   node server/fetch-prices.js --json     以 JSON 输出（供程序消费）
 *
 * 【重要】本脚本**只报告，不修改任何配置**。
 *   改价格必须同时改 source 与 period（AGENTS.md 第 4 节硬规则），
 *   而且"价格必须来自官方源、不许凭常识填" —— 所以自动改 config 是不对的，
 *   人看过之后手工落进去。脚本的作用是把"值和期次"准确摆到人面前。
 *
 * 跑在哪儿：现在只能在本机跑（node）。要让它定时自动跑，需要一个能常驻、
 *   能发 HTTP 的地方 —— 那是云函数/服务器的职责，本文件保持平台无关。
 */

const catalog = require('./source-catalog.js');
const cottonchina = require('./sources/cottonchina.js');

// 已实现自动抓取的源（其余见 source-catalog.js 的探测结论）
const ACTIVE_SOURCES = [cottonchina];

const CONFIG = require('../config/fabric.js');

function pct(a, b) {
  if (!b) return null;
  return ((a - b) / b) * 100;
}

function fmtPct(v) {
  if (v === null) return '—';
  const s = (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  return s;
}

/** 拿配置里对应档位的现值，用于对拍 */
function configValueOf(rec) {
  const fiber = CONFIG.FIBERS[rec.fiber];
  if (!fiber || !fiber.tiers || !fiber.tiers[rec.tier]) return null;
  return fiber.tiers[rec.tier];
}

async function run() {
  const results = [];
  for (let i = 0; i < ACTIVE_SOURCES.length; i += 1) {
    results.push(await ACTIVE_SOURCES[i].fetch());
  }
  return results;
}

function buildReport(results) {
  const lines = [];
  const stamp = new Date().toISOString().slice(0, 10);
  lines.push('官方价格源同步报告 · ' + stamp);
  lines.push('探测结论基准日：' + catalog.verifiedAt + '（详见 server/source-catalog.js）');
  lines.push('');

  let totalRecords = 0;
  let matched = 0;
  let drift = 0;

  lines.push('【可自动抓取】');
  results.forEach(function (r) {
    if (!r.ok) {
      lines.push('  ✗ ' + r.label);
      lines.push('      失败：' + r.error);
      return;
    }
    totalRecords += r.records.length;
    lines.push('  ✓ ' + r.label);
    lines.push('      HTTP 200 · ' + r.bytes + ' 字节 · ' + r.encoding + ' · ' + r.records.length + ' 条');
    r.records.forEach(function (rec) {
      const cur = configValueOf(rec);
      const curPrice = cur ? cur.unitPrice : null;
      const d = curPrice === null ? null : pct(rec.unitPrice, curPrice);
      if (curPrice !== null && Math.abs(d) < 0.05) matched += 1;
      if (curPrice !== null && Math.abs(d) >= 0.05) drift += 1;

      const arrow = curPrice === null ? ''
        : (Math.abs(d) < 0.05 ? '  与配置一致'
          : '  ← 配置现值 ' + curPrice + '（差 ' + fmtPct(d) + '）');

      lines.push('      ' + (rec.fiber + '.' + rec.tier).padEnd(26) +
        String(rec.unitPrice).padStart(9) + ' 元/千克' +
        '  (' + (rec.period || '页面未标日期') + ')' + arrow);
    });
    if (r.missing && r.missing.length) {
      lines.push('      未解析到（如实列出，不补值）：');
      r.missing.forEach(function (m) { lines.push('        · ' + m.label + ' —— ' + m.reason); });
    }
  });

  lines.push('');
  lines.push('【已探测、当前不可用或未实现】');
  catalog.sources.forEach(function (s) {
    const isActive = ACTIVE_SOURCES.some(function (a) { return a.key === s.key; });
    if (isActive) return;
    const mark = s.status === 'unreachable' ? '✗' : (s.status === 'partial' ? '⚠' : '○');
    lines.push('  ' + mark + ' ' + s.label + '  [' + s.status + ']');
    lines.push('      ' + s.note);
  });

  lines.push('');
  lines.push('【结论】');
  lines.push('  抓到 ' + totalRecords + ' 条；与配置现值一致 ' + matched + ' 条；有出入 ' + drift + ' 条。');
  if (totalRecords > 0 && drift === 0) {
    lines.push('  → 抓取器与配置现值完全对得上，说明抓取正确、映射正确。');
  }
  lines.push('  → 本脚本不改任何配置。要更新价格，请人工确认后改 config/fabric.js，');
  lines.push('     并同步更新该条的 source 与 period（硬规则）。');

  return lines.join('\n');
}

module.exports = { run: run, buildReport: buildReport, ACTIVE_SOURCES: ACTIVE_SOURCES };

if (require.main === module) {
  run().then(function (results) {
    if (process.argv.indexOf('--json') >= 0) {
      console.log(JSON.stringify({ results: results, catalog: catalog }, null, 2));
      return;
    }
    console.log(buildReport(results));
  }).catch(function (e) {
    console.error('同步失败：' + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  });
}
