/**
 * 登录 / 欢迎页。
 *
 * 与 AGENTS.md 第 6 节的关系：该节写明「不做云端账号体系与云同步」。
 * 因此本页**只呈现交互与视觉**，提交走演示路径，不发短信、不注册、不上传任何数据。
 * 后端阶段接入真实鉴权前，登录按钮不做真实请求。
 *
 * 设计依据（2026-09-26 调研）：品牌前置 / 主按钮置于拇指区 / 字段未合法前禁用 /
 * 错误内联到字段下方 / 协议未勾选不放行 / 验证码倒计时。
 */

const PHONE_RE = /^1[3-9]\d{9}$/;

Page({
  data: {
    phone: '',
    code: '',
    agreed: false,
    countdown: 0,
    error: '',
    loading: false,
    phoneValid: false,
    canSendCode: false,
    canSubmit: false,
    codeBtnText: '获取验证码'
  },

  onUnload: function () {
    this.clearTimer();
  },

  // 所有输入都走这里，派生状态（能否提交 / 能否发码）集中算一次，避免各处判断不一致
  applyPatch: function (patch) {
    const merged = Object.assign({}, this.data, patch);
    const phoneValid = PHONE_RE.test(merged.phone);
    const codeValid = merged.code.length === 6;

    this.setData(Object.assign({}, patch, {
      phoneValid: phoneValid,
      canSendCode: phoneValid && merged.countdown === 0,
      canSubmit: phoneValid && codeValid && merged.agreed && !merged.loading,
      codeBtnText: merged.countdown > 0 ? merged.countdown + 's 后重发' : '获取验证码'
    }));
  },

  onPhoneInput: function (e) {
    this.applyPatch({ phone: e.detail.value.replace(/\D/g, '').slice(0, 11), error: '' });
  },

  onCodeInput: function (e) {
    this.applyPatch({ code: e.detail.value.replace(/\D/g, '').slice(0, 6), error: '' });
  },

  onToggleAgree: function () {
    this.applyPatch({ agreed: !this.data.agreed });
  },

  onSendCode: function () {
    if (!this.data.canSendCode) return;
    // 后端未接入：不真发短信，只走倒计时，界面行为与真流程一致
    this.applyPatch({ error: '', countdown: 60 });
    this.startTimer();
  },

  startTimer: function () {
    const self = this;
    this.clearTimer();
    this.timer = setInterval(function () {
      const next = self.data.countdown - 1;
      if (next <= 0) {
        self.clearTimer();
        self.applyPatch({ countdown: 0 });
        return;
      }
      self.applyPatch({ countdown: next });
    }, 1000);
  },

  clearTimer: function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  onSubmit: function () {
    if (!this.data.canSubmit) return;
    const self = this;
    this.applyPatch({ error: '', loading: true });

    setTimeout(function () {
      self.applyPatch({ loading: false });
      self.enter();
    }, 700);
  },

  onGuestEnter: function () {
    this.enter();
  },

  enter: function () {
    // 登录页不是 tabBar 页，进 tabBar 必须用 switchTab
    wx.switchTab({ url: '/pages/index/index' });
  },

  onOpenAgreement: function () {
    wx.showModal({
      title: '协议说明',
      content: '账号体系与云同步当前未接入，本页仅作界面演示。数据全部留在本机，不会上传。',
      showCancel: false
    });
  }
});
