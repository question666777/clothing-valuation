// 五段拆解卡片。parts: [{ key, label, value, percent, color, hint }]
// 条形宽度与颜色都是数据驱动的，颜色由页面从 styles/theme.js 取，组件内不写死色值。
Component({
  properties: {
    parts: { type: Array, value: [] },
    total: { type: null, value: 0 }
  }
});
