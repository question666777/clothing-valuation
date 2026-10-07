const config = require('../../config/index.js');

const app = getApp();

Page({
  data: {
    itemName: '',
    categories: config.listCategories(),
    categoryIndex: 0,
    brandTiers: config.listBrandTiers(),
    brandIndex: 1,
    materialPrice: ''
  },

  onNameInput: function (e) {
    this.setData({ itemName: e.detail.value });
  },

  onCategoryChange: function (e) {
    this.setData({ categoryIndex: Number(e.detail.value) });
  },

  onBrandChange: function (e) {
    this.setData({ brandIndex: Number(e.detail.value) });
  },

  onPriceInput: function (e) {
    this.setData({ materialPrice: e.detail.value });
  },

  onEstimate: function () {
    const unitPrice = parseFloat(this.data.materialPrice);
    if (!unitPrice || unitPrice <= 0) {
      wx.showToast({ title: '请先填写材料成本', icon: 'none' });
      return;
    }

    app.globalData.pendingItem = {
      name: this.data.itemName.trim(),
      category: this.data.categories[this.data.categoryIndex].key,
      brandTier: this.data.brandTiers[this.data.brandIndex].key,
      material: { unitPrice: unitPrice, amount: 1 }
    };

    wx.navigateTo({ url: '/pages/valuation/valuation' });
  },

  onScan: function () {
    wx.showToast({ title: '拍照识别待接入', icon: 'none' });
  }
});
