/**
 * HTML → 文本 / 表格 的最小工具集。
 *
 * 只覆盖这些政府站的实际需要：去标签、解实体、把 <table> 拍平成行。
 * 不做完整 HTML 解析 —— 不引第三方库（理由见 lib/http.js 头部）。
 */

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&apos;': "'", '&#39;': "'"
};

function decodeEntities(s) {
  let out = String(s).replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, function (m) {
    return ENTITIES[m] !== undefined ? ENTITIES[m] : m;
  });
  out = out.replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(Number(d)); });
  out = out.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  return out;
}

/** 去掉 script/style/标签，压缩空白；保留换行结构（</tr> </p> <br> 视为换行） */
function toText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<\/(tr|p|div|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(function (l) { return l.replace(/[ \t\u00a0]+/g, ' ').trim(); })
    .filter(function (l) { return l.length > 0; })
    .join('\n');
}

/** 把整段文本压成一行（跨行匹配用） */
function toLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** 解析 <table>：返回行数组，每行是单元格文本数组 */
function parseTables(html) {
  const tables = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[0])) !== null) {
      const cells = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[0])) !== null) {
        cells.push(toText(cm[1]).replace(/\n/g, ' ').trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

/** 找一个标签的属性值，如 attr(html, 'href') —— 返回第一个匹配 */
function firstAttr(html, tag, attr) {
  const re = new RegExp('<' + tag + '[^>]*\\b' + attr + '\\s*=\\s*["\']([^"\']+)["\']', 'i');
  const m = re.exec(html);
  return m ? m[1] : null;
}

/** 数字清洗：'17,368.00' / '17368 元/吨' → 17368.00 */
function toNumber(s) {
  if (s === null || s === undefined) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

module.exports = {
  decodeEntities: decodeEntities,
  toText: toText,
  toLine: toLine,
  parseTables: parseTables,
  firstAttr: firstAttr,
  toNumber: toNumber
};
