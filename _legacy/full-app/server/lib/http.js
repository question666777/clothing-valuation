/**
 * 服务端 HTTP 抓取工具 —— 只用 Node 内置模块，**零第三方依赖**。
 *
 * 为什么不引 axios / cheerio：
 *   抓取逻辑将来要跑在云函数里，运行环境要尽量薄；这些政府站页面结构简单，
 *   正则与字符串处理足够，装一套 HTML 解析库不划算。
 *
 * 为什么放在 server/ 而不是 services/：
 *   小程序**不能**跑抓取（wx.request 只认已备案白名单域名），所以抓取代码
 *   永远不能同步进 miniprogram/。用目录划平台边界最省事 ——
 *   scripts/sync-miniprogram.js 的 SYNC_DIRS 只有 config/core/services，
 *   server/ 天然被隔离，不会出现"哪天顺手同步过去"的事故。
 *
 * 抓取礼仪：固定 UA 标识、请求间隔限速、超时、有限重试、失败如实返回。
 * 拿不到就是拿不到，**不许返回假数据**（见 AGENTS.md 第 5 节）。
 */

const https = require('https');
const http = require('http');
const { TextDecoder } = require('util');

const UA = 'KanGuangGuang/0.1 (personal price-snapshot tool; node ' + process.version + ')';

const MIN_INTERVAL_MS = 600;
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

/** 按 Content-Type 判断编码；没声明就按"替换字符数量"试探 */
function decodeBody(buf, contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.indexOf('gbk') >= 0 || ct.indexOf('gb2312') >= 0) {
    try { return new TextDecoder('gbk').decode(buf); } catch (e) { /* 落到下面 */ }
  }
  if (ct.indexOf('utf-8') >= 0 || ct.indexOf('utf8') >= 0) return buf.toString('utf8');

  const asUtf8 = buf.toString('utf8');
  const bad = (asUtf8.match(/\uFFFD/g) || []).length;
  if (bad > 3) {
    try { return new TextDecoder('gbk').decode(buf); } catch (e) { return asUtf8; }
  }
  return asUtf8;
}

/**
 * 抓一个 URL。
 * @returns {Promise<{ok:boolean, status:number, url:string, text?:string, bytes?:number,
 *                    encoding?:string, error?:string}>}
 * 永远 resolve，不 reject —— 调用方按 ok 分支处理，避免一个源挂掉拖垮整轮。
 */
function fetchText(url, options) {
  const opt = options || {};
  const maxRetry = opt.retry === undefined ? 2 : opt.retry;
  const attempt = opt._attempt || 0;

  return (async function () {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);

    const result = await new Promise(function (resolve) {
      let mod;
      try {
        mod = url.indexOf('https:') === 0 ? https : http;
      } catch (e) {
        resolve({ ok: false, status: 0, url: url, error: 'bad-url' });
        return;
      }

      const req = mod.get(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': opt.referer || url
        },
        timeout: opt.timeout || 20000
      }, function (res) {
        // 跟随重定向（政府站常见 301/302）
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let next = res.headers.location;
          if (next.indexOf('http') !== 0) {
            try { next = new URL(next, url).href; } catch (e) { next = null; }
          }
          res.resume();
          if (!next) {
            resolve({ ok: false, status: res.statusCode, url: url, error: 'bad-redirect' });
            return;
          }
          resolve({ redirect: next });
          return;
        }

        const chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          const buf = Buffer.concat(chunks);
          const text = decodeBody(buf, res.headers['content-type']);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            url: url,
            text: text,
            bytes: buf.length,
            encoding: buf.toString('utf8') === text ? 'utf-8' : 'gbk',
            contentType: res.headers['content-type'] || ''
          });
        });
      });

      req.on('error', function (e) { resolve({ ok: false, status: 0, url: url, error: e.code || e.message }); });
      req.on('timeout', function () {
        req.destroy();
        resolve({ ok: false, status: 0, url: url, error: 'timeout' });
      });
    });

    lastRequestAt = Date.now();

    if (result.redirect) {
      return fetchText(result.redirect, Object.assign({}, opt, { _attempt: attempt, referer: url }));
    }
    if (!result.ok && attempt < maxRetry && !opt.noRetry) {
      await sleep(800 * (attempt + 1));
      return fetchText(url, Object.assign({}, opt, { _attempt: attempt + 1 }));
    }
    return result;
  })();
}

module.exports = { fetchText: fetchText, sleep: sleep, UA: UA, MIN_INTERVAL_MS: MIN_INTERVAL_MS };
