// 通用选项组。options: [{ key, label }]
// 与 RN 侧 src/components/OptionChips.js 行为一致：受控组件，点击只上报，不改自身状态。
Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: null, value: '' }
  },

  methods: {
    onTap: function (e) {
      this.triggerEvent('change', { value: e.currentTarget.dataset.key });
    }
  }
});
