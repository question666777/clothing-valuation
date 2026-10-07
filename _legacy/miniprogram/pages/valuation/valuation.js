const valuation = require('../../core/valuation/index.js');

const app = getApp();

const PART_LABELS = [
  { key: 'materialCost', label: '材料成本', hint: '原材料本身的价值' },
  { key: 'processingCost', label: '加工成本', hint: '制造与工艺环节' },
  { key: 'brandPremium', label: '品牌溢价', hint: '品牌带来的附加价值' },
  { key: 'overflow', label: '允许溢出价值', hint: '运费、人工、销售费用' }
];

Page({
  data: {
    itemName: '',
    result: null,
    parts: []
  },

  onLoad: function () {
    const item = app.globalData.pendingItem;
    if (!item) {
      wx.showToast({ title: '没有待估价的物品', icon: 'none' });
      return;
    }

    const result = valuation.estimate(item);

    this.setData({
      itemName: item.name || '未命名物品',
      result: result,
      parts: buildParts(result.breakdown)
    });
  },

  onBack: function () {
    wx.navigateBack();
  }
});

function buildParts(breakdown) {
  const total = breakdown.total || 1;

  return PART_LABELS.map(function (part) {
    const value = breakdown[part.key] || 0;
    return {
      key: part.key,
      label: part.label,
      hint: part.hint,
      value: Math.round(value),
      percent: Math.round((value / total) * 100)
    };
  });
}
