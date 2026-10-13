// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js

/**
 * 五段式价值模型：
 *   真实价值 = 材料成本 + 加工成本 + 设计成本 + 品牌溢价 + 允许溢出价值
 *
 * 本文件只做纯计算，不读配置、不碰网络，便于单独验证。
 *
 * 材料支持**多条用料**（见 AGENTS.md 1.3）：一件衣服通常是
 * 面料 + 里料 + 填充 + 辅料 + 五金，每条各自有单价与用量。
 * 传进来的 line 应当是**已经定好价**的（{ unitPrice, amount }）——
 * 定价是配置层的事，本层不查价格表。
 */

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toNumber(value) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return typeof num === 'number' && isFinite(num) && num >= 0 ? num : 0;
}

function normalizeMaterial(material) {
  const source = material || {};
  const unitPrice = toNumber(source.unitPrice);
  const amount = toNumber(source.amount) || 1;
  return { unitPrice: unitPrice, amount: amount };
}

/**
 * 归一化用料清单。
 * 兼容两种输入：
 *   itemInfo.materials = [ { unitPrice, amount }, ... ]   多部位
 *   itemInfo.material  = { unitPrice, amount }            旧单条写法
 * 两者都给时以 materials 为准。
 */
function normalizeMaterials(itemInfo) {
  const source = itemInfo || {};
  if (Array.isArray(source.materials) && source.materials.length > 0) {
    return source.materials.map(normalizeMaterial);
  }
  return [normalizeMaterial(source.material)];
}

function computeBreakdown(itemInfo, coefficients) {
  const lines = normalizeMaterials(itemInfo).map(function (m) {
    return {
      unitPrice: m.unitPrice,
      amount: m.amount,
      cost: round2(m.unitPrice * m.amount)
    };
  });

  let materialSum = 0;
  lines.forEach(function (l) { materialSum += l.cost; });
  const materialCost = round2(materialSum);

  // 加工费按件计，与材料成本无关
  const processingCost = round2(coefficients.processingFee);

  const designCost = round2((materialCost + processingCost) * coefficients.designRate);

  const brandPremium = round2(
    (materialCost + processingCost + designCost) * coefficients.premiumRate
  );

  const overflow = round2(
    (materialCost + processingCost + designCost + brandPremium) * coefficients.overflowRatio
  );

  return {
    materialCost: materialCost,
    materialLines: lines,
    materialLineCount: lines.length,
    processingCost: processingCost,
    designCost: designCost,
    brandPremium: brandPremium,
    overflow: overflow,
    total: round2(materialCost + processingCost + designCost + brandPremium + overflow)
  };
}

function toRange(breakdown, spread) {
  const mid = Math.round(breakdown.total);
  return {
    mid: mid,
    low: Math.round(mid * (1 - spread)),
    high: Math.round(mid * (1 + spread))
  };
}

module.exports = {
  computeBreakdown: computeBreakdown,
  toRange: toRange,
  normalizeMaterials: normalizeMaterials
};
