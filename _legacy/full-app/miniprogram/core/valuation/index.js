// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js

const { resolveCoefficients } = require('../../config/index.js');
const { computeBreakdown, toRange } = require('./model.js');

const DISCLAIMER = '估值仅供参考，不构成购买建议';

/**
 * 估价模块唯一对外入口。
 *
 * @param {object} itemInfo
 *   category      品类 key（见 /config/coefficients.js）
 *   brandTier     品牌档位 key（旧用法，兜底）
 *   brandKey      品牌库 key（见 /config/brands.js），优先于 brandTier
 *   material      { unitPrice, amount } 单条用料（旧写法）
 *   materials     [ { unitPrice, amount }, ... ] 多部位用料（见 AGENTS.md 1.3）
 *   processingFee / designRate / overflowRatio / premiumRate / spread  可选，显式覆盖配置
 * @returns {{ priceRange, breakdown, coefficients, degraded, disclaimer, currency }}
 */
function estimate(itemInfo) {
  const input = itemInfo || {};
  const coefficients = resolveCoefficients(input);
  const breakdown = computeBreakdown(input, coefficients);

  // 材料成本为 0、或任一用料取不到价，都算降级：
  // 此时仍返回结构完整的结果，但不许让调用方以为是有效估价
  const unpricedLines = (breakdown.materialLines || []).filter(function (l) {
    return !(l.unitPrice > 0);
  }).length;
  const degraded = breakdown.materialCost === 0 || unpricedLines > 0;

  return {
    priceRange: toRange(breakdown, coefficients.spread),
    breakdown: breakdown,
    coefficients: coefficients,
    degraded: degraded,
    unpricedLineCount: unpricedLines,
    // 品牌溢价率来自官方毛利率时，与"允许溢出"存在重复计算风险（AGENTS.md 9.1）
    doubleCountWarning: coefficients.doubleCountRisk === true,
    currency: 'CNY',
    disclaimer: DISCLAIMER
  };
}

module.exports = { estimate: estimate };
