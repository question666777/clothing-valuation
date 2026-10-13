// 全局状态。账号口径见 AGENTS.md 第 6 节：不做云端账号与云同步，
// 这里的偏好只写本机缓存，不上传、不发短信、不做真实鉴权。

const PREF_KEY = 'kgg.prefs';

const DEFAULT_PREFS = {
  overflowRatio: 0.5,
  brandTier: 'common',
  brandKey: null
};

App({
  globalData: {
    prefs: Object.assign({}, DEFAULT_PREFS)
  },

  onLaunch: function () {
    try {
      const saved = wx.getStorageSync(PREF_KEY);
      if (saved && typeof saved === 'object') {
        this.globalData.prefs = Object.assign({}, DEFAULT_PREFS, saved);
      }
    } catch (err) {
      // 读缓存失败不影响启动，直接用默认值
    }
  },

  // 偏好一律经这里写入，保证本机缓存与内存一致
  savePrefs: function (patch) {
    this.globalData.prefs = Object.assign({}, this.globalData.prefs, patch);
    try {
      wx.setStorageSync(PREF_KEY, this.globalData.prefs);
    } catch (err) {
      // 写缓存失败不回滚内存值，下次启动回落默认值
    }
    return this.globalData.prefs;
  }
});
