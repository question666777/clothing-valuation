/**
 * 全量系数表。这是唯一允许出现系数的位置，业务代码不得再写死任何数值。
 *
 * MVP 范围：服装服饰（见 AGENTS.md 第 1 节）。
 *
 * 【数据等级】本文件里的数值分两类，改的时候必须分清：
 *   official  —— 有政府/官方出处（材料价格在 fabric.js 里）
 *   estimate  —— 行业经验估算，无官方逐条来源，**属于已知数据缺口**
 * 加工费与设计费率目前全部是 estimate，不要当成事实使用。
 *
 * 口径（五段模型）：
 *   材料成本 = 面料单价 × 用量（+ 辅料，见 fabric.js）
 *   加工成本 = processingFee，元/件（不是材料比例 —— 服装加工按件计费）
 *   设计成本 = (材料成本 + 加工成本) × designRate
 *   品牌溢价 = (材料成本 + 加工成本 + 设计成本) × premiumRate
 *   允许溢出 = 前四项之和 × overflowRatio   ← 该系数由用户自行决定，见界面滑块
 *   真实价值 = 五项之和；展示区间 = 总价 × (1 ± spread)
 */

const DEFAULT_COEFFICIENTS = {
  processingFee: 15,
  overflowRatio: 0.50,
  spread: 0.20
};

/**
 * MVP 开放品类：**只做衣物**（2026-09-27 收窄）。
 *
 * 鞋与包**已移出开放品类**（原 apparel_shoes / apparel_bag 已删）：
 * 它们的成本大头不是面料，而是鞋底/模具/五金/版型开发，用「面料价 × 用量」
 * 推出来的数会严重偏离 —— 与其给一个看着像样的错数，不如明确不做。
 * 识别到鞋包时界面如实告知"暂不支持"，不许静默无反应（见 recognize.js）。
 *
 * processingFee 为「元/件」的基础加工费，取决于工序数量与工时，
 * 与面料贵贱无关 —— 羊绒大衣和涤纶大衣的缝制工时差不多。
 * 数值为行业经验估算，待接入代工厂报价数据后校正。
 */
const CATEGORY_COEFFICIENTS = {
  apparel_knit: {
    label: '针织类（T恤 / 卫衣 / 毛衣）',
    processingFee: 8,
    overflowRatio: 0.50,
    spread: 0.20
  },
  apparel_shirt: {
    label: '衬衫',
    processingFee: 15,
    overflowRatio: 0.55,
    spread: 0.20
  },
  apparel_pants: {
    label: '裤装',
    processingFee: 14,
    overflowRatio: 0.50,
    spread: 0.20
  },
  apparel_outerwear: {
    label: '外套 / 夹克',
    processingFee: 45,
    overflowRatio: 0.55,
    spread: 0.20
  },
  apparel_down: {
    label: '羽绒服',
    processingFee: 70,
    overflowRatio: 0.60,
    spread: 0.22
  },
  apparel_dress: {
    label: '裙装',
    processingFee: 22,
    overflowRatio: 0.55,
    spread: 0.20
  },
  apparel_suit: {
    label: '西装',
    processingFee: 180,
    overflowRatio: 0.60,
    spread: 0.25
  },
  apparel_accessory: {
    label: '配饰（帽 / 围巾 / 腰带）',
    processingFee: 6,
    overflowRatio: 0.60,
    spread: 0.22
  }
};

/**
 * 后续品类，MVP 不开放，仅保留结构便于扩展（AGENTS.md 第 3 节"留扩展空间"）。
 * 不在 listCategories() 中返回，界面上也不会出现。
 */
const RESERVED_CATEGORIES = {
  digital: { label: '手机数码', processingFee: 60, overflowRatio: 0.15 },
  appliance: { label: '家用电器', processingFee: 80, overflowRatio: 0.18 },
  furniture: { label: '家具家居', processingFee: 120, overflowRatio: 0.30 },
  daily: { label: '日用百货', processingFee: 8, overflowRatio: 0.40 }
};

/**
 * 品牌档位。
 *
 * premiumRate 品牌溢价率
 * designRate  设计费率 = (材料 + 加工) × designRate
 *   —— 白牌多为抄款/买版，设计投入极低；奢侈与设计师品牌的设计本身就是核心价值。
 */
const BRAND_TIERS = {
  none: { label: '无品牌 / 白牌', premiumRate: 0.0, designRate: 0.03 },
  common: { label: '普通品牌', premiumRate: 0.15, designRate: 0.12 },
  known: { label: '知名品牌', premiumRate: 0.60, designRate: 0.25 },
  luxury: { label: '奢侈品牌', premiumRate: 1.80, designRate: 0.60 }
};

const DEFAULT_BRAND_TIER = 'common';

module.exports = {
  DEFAULT_COEFFICIENTS,
  CATEGORY_COEFFICIENTS,
  RESERVED_CATEGORIES,
  BRAND_TIERS,
  DEFAULT_BRAND_TIER
};
