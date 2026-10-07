/**
 * 数据源适配器：中国棉花信息网（cottonchina.org.cn）
 *
 * 来源性质：国家级棉花行业信息机构，CC Index 是行业基准价（official）。
 * 抓取方式：**首页的静态 HTML 里就带全套当日指数**，不需要登录、不需要调接口。
 *           页面是 GBK 编码，由 lib/http.js 自动识别。
 *
 * 为什么要单独一个文件：
 *   「解析」与「网络」分开 —— fetch() 负责取页，parse() 是纯函数（输入 HTML 文本、
 *   输出记录数组），所以能用固定 fixture 离线断言，不依赖网络是否可用。
 *
 * 覆盖的目标档位（与 config/fabric.js 的 key 一一对应）：
 *   CC Index 3128B  → cotton.grade_3128B
 *   CC Index 2227B  → cotton.grade_2227B
 *   CC Index 2129B  → cotton.grade_2129B
 *   粘胶短纤        → viscose.staple_fiber
 *   涤纶短纤        → polyester.staple_fiber
 */

const { fetchText } = require('../lib/http.js');
const H = require('../lib/html.js');

const URL = 'https://www.cottonchina.org.cn/';
const SOURCE_LABEL = '中国棉花信息网 · CC Index / 纱线指数';
const SOURCE_URL = URL;

/** 页面上某个指标的取数规则。label 是页面上出现的中文名，必须精确。 */
const RULES = [
  { fiber: 'cotton', tier: 'grade_3128B', label: 'CC Index 3128B', kind: 'ccindex' },
  { fiber: 'cotton', tier: 'grade_2227B', label: 'CC Index 2227B', kind: 'ccindex' },
  { fiber: 'cotton', tier: 'grade_2129B', label: 'CC Index 2129B', kind: 'ccindex' },
  { fiber: 'viscose', tier: 'staple_fiber', label: '粘胶短纤', kind: 'fiber' },
  { fiber: 'polyester', tier: 'staple_fiber', label: '涤纶短纤', kind: 'fiber' }
];

/**
 * 纯解析函数：输入页面 HTML，输出标准记录。
 * 不联网、不改全局，可离线用 fixture 断言。
 *
 * @returns {{records: Array, missing: Array}} missing 里是没解析到的指标（如实列出，不补假值）
 */
function parse(html) {
  const flat = H.toLine(H.toText(html));
  const records = [];
  const missing = [];

  RULES.forEach(function (rule) {
    // CC Index 形如：CC Index 3128B 更多 2026-09-24 17368 元/吨 -48
    // 短纤形如：涤纶短纤 2026-09-24 8630 元/吨 +150（日期可能缺失）
    const esc = rule.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      esc + '[\\s\\S]{0,40}?(?:(\\d{4}-\\d{2}-\\d{2})[\\s\\S]{0,20}?)?(\\d[\\d,]*(?:\\.\\d+)?)\\s*元\\/吨',
      ''
    );
    const m = re.exec(flat);
    if (!m) {
      missing.push({ label: rule.label, reason: '页面结构与预期不符，未匹配到「' + rule.label + ' … 元/吨」' });
      return;
    }
    const raw = H.toNumber(m[2]);
    if (raw === null) {
      missing.push({ label: rule.label, reason: '匹配到了但不是数字' });
      return;
    }
    records.push({
      sourceKey: 'cottonchina',
      fiber: rule.fiber,
      tier: rule.tier,
      label: rule.label,
      rawValue: raw,
      rawUnit: '元/吨',
      unitPrice: Math.round((raw / 1000) * 1000) / 1000, // 元/吨 → 元/千克
      unit: '千克',
      period: m[1] || null,
      source: SOURCE_LABEL,
      sourceUrl: SOURCE_URL,
      grade: 'official'
    });
  });

  return { records: records, missing: missing };
}

async function fetch() {
  const r = await fetchText(URL);
  if (!r.ok) {
    return {
      key: 'cottonchina',
      label: SOURCE_LABEL,
      url: URL,
      ok: false,
      error: r.error || ('HTTP ' + r.status),
      records: [],
      missing: []
    };
  }
  const parsed = parse(r.text);
  return {
    key: 'cottonchina',
    label: SOURCE_LABEL,
    url: URL,
    ok: parsed.records.length > 0,
    bytes: r.bytes,
    encoding: r.encoding,
    records: parsed.records,
    missing: parsed.missing,
    error: parsed.records.length > 0 ? null : '页面取到了但一条都没解析出来'
  };
}

module.exports = {
  key: 'cottonchina',
  label: SOURCE_LABEL,
  url: URL,
  parse: parse,
  fetch: fetch,
  RULES: RULES
};
