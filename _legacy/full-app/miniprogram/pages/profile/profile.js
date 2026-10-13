const config = require('../../config/index.js');
const theme = require('../../styles/theme.js');
const auth = require('../../services/auth.js');

const C = theme.colors;

const GRADE_META = {
  official: { label: '政府公布', color: C.good },
  semi: { label: '指数报价', color: C.design },
  estimate: { label: '行业估算', color: C.warn }
};

const GRADE_ORDER = ['official', 'semi', 'estimate'];

/**
 * 个人面板。
 *
 * 面板上所有数字**全部从 /config/ 实算**，不写占位值（AGENTS.md 第 7 节）。
 * 用户行为类数据（估价次数等）当前无来源，一律用空状态如实呈现。
 */
Page({
  data: {
    loggedIn: false,
    userName: '游客',
    avatarUrl: '',
    fabricCount: 0,
    categoryCount: 0,
    officialCount: 0,
    gradeSegments: [],
    snapshotUpdatedAt: '',
    sourceCount: 0,
    overflowPercent: 50,
    tierLabel: '普通品牌',
    prefRows: [],
    aboutRows: [],
    emptyText: '还没有估价记录',
    emptySub: '拍第一件东西后，这里会留下它的价值拆解',
    disclaimer: '估值仅供参考，不构成购买建议'
  },

  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    const app = getApp();
    const prefs = (app && app.globalData && app.globalData.prefs) || {};

    const fabrics = config.listFabrics();
    const categories = config.listCategories();
    const tiers = config.listBrandTiers();
    const snapshot = config.PRICE_SNAPSHOT || {};
    const sources = snapshot.sources || {};

    const byGrade = { official: 0, semi: 0, estimate: 0 };
    fabrics.forEach(function (f) {
      if (byGrade[f.grade] !== undefined) byGrade[f.grade] += 1;
    });

    const total = fabrics.length || 1;
    const gradeSegments = GRADE_ORDER
      .filter(function (key) { return byGrade[key] > 0; })
      .map(function (key) {
        return {
          key: key,
          label: GRADE_META[key].label,
          color: GRADE_META[key].color,
          count: byGrade[key],
          percent: Math.round((byGrade[key] / total) * 100)
        };
      });

    const tier = tiers.filter(function (t) { return t.key === prefs.brandTier; })[0];
    const overflowPercent = Math.round((prefs.overflowRatio !== undefined ? prefs.overflowRatio : 0.5) * 100);

    // 登录态：auth.getState() 是唯一真源；偏好里的 userName 只作回退显示
    const state = auth.getState();

    this.setData({
      loggedIn: state.loggedIn,
      avatarUrl: state.avatarUrl,
      userName: state.loggedIn ? state.nickName : (prefs.userName || '游客'),
      fabricCount: fabrics.length,
      categoryCount: categories.length,
      officialCount: byGrade.official,
      gradeSegments: gradeSegments,
      snapshotUpdatedAt: snapshot.updatedAt || '',
      sourceCount: Object.keys(sources).length,
      overflowPercent: overflowPercent,
      tierLabel: tier ? tier.label : '普通品牌',
      prefRows: [
        { label: '默认溢出比例', value: overflowPercent + '%' },
        { label: '默认品牌档位', value: tier ? tier.label : '普通品牌' }
      ],
      aboutRows: [
        { key: 'source', label: '数据来源说明', value: sourceSummary(sources), chevron: true },
        { key: 'disclaimer', label: '免责声明', value: '', chevron: true },
        { key: 'version', label: '版本', value: appVersion(), chevron: false }
      ]
    });
  },

  onRowTap: function (e) {
    const key = e.currentTarget.dataset.key;

    if (key === 'source') {
      const snapshot = config.PRICE_SNAPSHOT || {};
      const sources = snapshot.sources || {};
      const lines = Object.keys(sources).map(function (k) {
        const s = sources[k];
        return '· ' + (s.label || k) + (s.publisher ? '（' + s.publisher + '）' : '');
      });
      wx.showModal({
        title: '面料价格数据源',
        content: lines.join('\n') + '\n\n价格表更新：' + (snapshot.updatedAt || '未知'),
        showCancel: false
      });
      return;
    }

    if (key === 'disclaimer') {
      wx.showModal({
        title: '免责声明',
        content: '估值仅供参考，不构成购买建议。所有价格来自公开数据源或行业估算，不是任何商品的真实成交价。',
        showCancel: false
      });
    }
  },

  // 微信登录：只拿头像昵称（前端界面），不建账号、不联网（AGENTS.md 第 6 节）
  onLogin: function () {
    auth.login().then(function () {
      this.refresh();
      wx.showToast({ title: '已登录', icon: 'success' });
    }.bind(this)).catch(function (err) {
      // 用户取消授权是正常路径，不打扰；真失败才提示
      if (err && err.message && err.message.indexOf('取消') < 0) {
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      }
    });
  },

  // 退出登录：只清本机登录态，无云端数据可退
  onLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '仅清除本机的头像昵称，不影响估价使用。',
      success: function (res) {
        if (!res.confirm) return;
        auth.logout();
        this.refresh();
      }.bind(this)
    });
  },

  // 没有账号体系就没有"退出登录"这回事（AGENTS.md 第 6 节）——
  // 这里只清本机偏好，本来也没有任何云端数据可退
  onResetPrefs: function () {
    wx.showModal({
      title: '清空本机偏好',
      content: '重置溢出比例、品牌选择等本机设置。不上传数据，也不影响别处。',
      success: function (res) {
        if (!res.confirm) return;
        try {
          wx.removeStorageSync('cv.prefs');
        } catch (err) {
          // 清不掉也不影响使用，下次启动仍是旧值
        }
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.prefs = { overflowRatio: 0.5, brandTier: 'common', brandKey: null };
        }
        wx.showToast({ title: '已重置', icon: 'success' });
      }
    });
  }
});

function sourceSummary(sources) {
  const n = Object.keys(sources).length;
  return n > 0 ? n + ' 个来源' : '';
}

function appVersion() {
  try {
    const info = wx.getAccountInfoSync();
    if (info && info.miniProgram && info.miniProgram.version) return info.miniProgram.version;
  } catch (err) {
    // 开发工具里取不到版本号，回落为标注开发版
  }
  return '0.1.0（开发版）';
}
