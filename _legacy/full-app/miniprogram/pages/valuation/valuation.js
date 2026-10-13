const config = require('../../config/index.js');
const valuation = require('../../core/valuation/index.js');
const theme = require('../../styles/theme.js');

const C = theme.colors;

const PART_META = [
  { key: 'materialCost', label: '材料成本', color: C.material, hint: '面料 + 辅料' },
  { key: 'processingCost', label: '加工成本', color: C.processing, hint: '裁剪缝制（按件计）' },
  { key: 'designCost', label: '设计成本', color: C.design, hint: '打版 / 样衣 / 设计' },
  { key: 'brandPremium', label: '品牌溢价', color: C.brand, hint: '牌子本身值多少' },
  { key: 'overflow', label: '允许溢出', color: C.overflow, hint: '运费 / 人工 / 销售' }
];

const GRADE_LABEL = {
  official: '政府公布报价',
  semi: '纺织指数报价',
  estimate: '行业估算 · 数据缺口',
  missing: '未取得价格'
};

const GRADE_CLASS = {
  official: 'tag--official',
  semi: 'tag--semi',
  estimate: 'tag--estimate',
  missing: 'tag--flat'
};

Page({
  data: {
    empty: false,
    itemName: '',
    amount: 0,
    retailPrice: 0,
    materialDetail: {},
    result: { priceRange: {}, breakdown: {}, coefficients: {} },
    parts: [],
    total: 0,
    verdict: null,
    categoryLabel: '',
    brandLabel: '',
    gradeLabel: '',
    gradeClass: 'tag--estimate',
    coeffRows: [],
    overflowPercent: 50,
    // slider 的着色只能走属性，取不到 CSS 变量，故从 theme 取
    overflowColor: C.overflow,
    trackColor: C.line
  },

  onLoad: function () {
    const payload = getApp().globalData.lastEstimate;
    if (!payload) {
      // 没有录入数据就进来看不到东西，说明白而不是显示一个空壳
      this.setData({ empty: true });
      return;
    }

    this.payload = payload;
    const snapshot = config.PRICE_SNAPSHOT || {};
    const sources = snapshot.sources || {};

    // 逐条列出数据源，兑现 AGENTS.md 第 5 节「每条价格必须可追溯到出处」
    const sourceList = Object.keys(sources).map(function (key) {
      const s = sources[key] || {};
      return {
        key: key,
        label: s.label || '',
        publisher: s.publisher || '',
        period: s.period || '',
        url: s.url || ''
      };
    });

    // 逐条用料列出价格与换算依据 —— 比笼统的"官方源清单"有用得多，
    // 也让「元/千克 → 米」这一步换算对用户可见（不然用户不知道克重是怎么来的）
    const materialLines = (payload.materialDetail.lines || []).map(function (l) {
      return {
        part: l.part || '',
        label: l.label || '(未命名)',
        unitPrice: l.unitPrice,
        priceUnit: l.priceUnit || l.unit || '',
        amount: l.amount,
        unit: l.unit || '',
        kg: l.kg,
        cost: l.cost,
        grade: l.grade,
        gradeClass: GRADE_CLASS[l.grade] || 'tag--estimate',
        gradeLabel: GRADE_LABEL[l.grade] || '来源未知',
        source: l.source || '',
        period: l.period || '',
        conversionNote: l.conversionNote || '',
        specNote: l.weightSpec ? l.weightSpec.note : '',
        specAssumed: l.specAssumed === true,
        degraded: l.degraded === true,
        reason: l.reason || ''
      };
    });

    this.setData({
      itemName: payload.item.name,
      amount: payload.amount,
      retailPrice: payload.retailPrice,
      materialDetail: payload.materialDetail,
      materialLines: materialLines,
      sourceList: sourceList,
      snapshotUpdatedAt: snapshot.updatedAt || '',
      gradeLabel: GRADE_LABEL[payload.materialDetail.grade] || GRADE_LABEL.estimate,
      gradeClass: GRADE_CLASS[payload.materialDetail.grade] || 'tag--estimate',
      overflowPercent: Math.round((payload.defaultOverflowRatio || 0) * 100)
    });

    this.recompute();
  },

  onSliderChanging: function (e) {
    this.setData({ overflowPercent: e.detail.value });
    this.recompute();
  },

  onSliderChange: function (e) {
    this.setData({ overflowPercent: e.detail.value });
    this.recompute();
  },

  // 溢出比例由用户决定：改动即原样传给估价核心重算（0 也是合法值）
  recompute: function () {
    const payload = this.payload;
    if (!payload) return;

    const ratio = this.data.overflowPercent / 100;
    const input = Object.assign({}, payload.item, { overflowRatio: ratio });
    const result = valuation.estimate(input);
    const total = result.breakdown.total;

    const parts = PART_META.map(function (meta) {
      const value = result.breakdown[meta.key];
      return {
        key: meta.key,
        label: meta.label,
        color: meta.color,
        hint: meta.hint,
        value: value,
        percent: total > 0 ? Math.round((value / total) * 100) : 0
      };
    });

    const coeff = result.coefficients;
    this.setData({
      result: result,
      parts: parts,
      total: total,
      verdict: buildVerdict(this.data.retailPrice, result.priceRange),
      categoryLabel: coeff.categoryLabel,
      brandLabel: coeff.brandLabel || coeff.brandTierLabel || '',
      brandFound: coeff.brandFound === true,
      premiumFromMargin: coeff.premiumRateSource === 'brand-gross-margin',
      brandPeriod: coeff.brandPeriod || '',
      lineCount: (this.data.materialDetail.lines || []).length,
      coeffRows: [
        { label: '加工费（元/件）', value: coeff.processingFee },
        { label: '设计费率', value: coeff.designRate },
        { label: '品牌溢价率', value: coeff.premiumRate + '（' + premiumSourceLabel(coeff.premiumRateSource) + '）' },
        { label: '允许溢出比例', value: ratio.toFixed(2) + '（你调的）' },
        { label: '区间半宽', value: coeff.spread },
        { label: '用料条数', value: (this.data.materialDetail.lines || []).length + ' 条' }
      ]
    });
  },

  onBack: function () {
    wx.navigateBack({
      fail: function () {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  }
});

function premiumSourceLabel(source) {
  if (source === 'brand-gross-margin') return '来自品牌年报毛利率';
  if (source === 'caller') return '调用方指定';
  if (source === 'tier-fallback') return '档位兜底估算';
  return '未知来源';
}

function buildVerdict(retailPrice, range) {  if (!retailPrice || retailPrice <= 0 || !range || range.mid <= 0) return null;

  const ratio = retailPrice / range.mid;
  const times = '约为真实价值的 ' + ratio.toFixed(1) + ' 倍';

  if (ratio >= 1.15) return { tone: 'warn', title: '售价明显高于真实价值', detail: times };
  if (ratio <= 0.87) return { tone: 'good', title: '售价低于真实价值', detail: times };
  return { tone: 'flat', title: '售价接近真实价值', detail: times };
}
