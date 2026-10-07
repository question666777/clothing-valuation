// profile 页 + auth 服务的交互冒烟。
// 真跑：登录（getUserProfile 成功/取消）、退出、登录态读写、头像昵称进偏好。
// 与 smoke-page.js 一样：小程序页面是 CommonJS，桩 Page/wx/getApp 即可在 node 里真跑。

const path = require('path');

const MP = path.join(__dirname, '..', 'miniprogram');
const PAGE = path.join(MP, 'pages', 'profile', 'profile.js');
const AUTH = path.join(MP, 'services', 'auth.js');

function rel(p) {
  return p.replace(path.join(__dirname, '..') + path.sep, '').replace(/\\/g, '/');
}

function installStubs() {
  const store = {};
  const toasts = [];
  const modals = [];
  // getUserProfile 默认走"成功"，返回一个可配置的 userInfo；可被单测覆盖为 fail
  let profileMode = 'ok';
  const userInfo = { nickName: '寒烟客', avatarUrl: 'https://example.com/avatar.png' };

  const app = {
    globalData: { prefs: {} },
    savePrefs: function (patch) {
      this.globalData.prefs = Object.assign({}, this.globalData.prefs, patch);
      return this.globalData.prefs;
    }
  };
  global.getApp = function () { return app; };
  global.Component = function () {};

  global.wx = {
    getStorageSync: function (k) { return store[k]; },
    setStorageSync: function (k, v) { store[k] = v; },
    removeStorageSync: function (k) { delete store[k]; },
    showToast: function (o) { toasts.push(o); },
    showModal: function (o) {
      modals.push(o);
      // 默认视为"确认"
      if (o && typeof o.success === 'function') o.success({ confirm: true, cancel: false });
    },
    getAccountInfoSync: function () {
      return { miniProgram: { version: '0.1.0' } };
    },
    getUserProfile: function (o) {
      if (profileMode === 'ok') {
        o.success({ userInfo: userInfo });
      } else {
        o.fail({ errMsg: 'getUserProfile:fail auth deny' });
      }
    }
  };

  return {
    store: store,
    app: app,
    toasts: toasts,
    modals: modals,
    userInfo: userInfo,
    setProfileMode: function (m) { profileMode = m; }
  };
}

function makeInstance(pageCfg) {
  const inst = {};
  Object.keys(pageCfg).forEach(function (k) { inst[k] = pageCfg[k]; });
  inst.data = JSON.parse(JSON.stringify(pageCfg.data));
  inst.setData = function (patch, cb) {
    Object.keys(patch).forEach(function (k) { inst.data[k] = patch[k]; });
    if (typeof cb === 'function') cb.call(inst);
    else if (typeof cb === 'string' && typeof inst[cb] === 'function') inst[cb].call(inst);
  };
  return inst;
}

function run() {
  const stubs = installStubs();

  let pageCfg = null;
  global.Page = function (cfg) { pageCfg = cfg; };

  delete require.cache[require.resolve(PAGE)];
  delete require.cache[require.resolve(AUTH)];
  require(PAGE);

  if (!pageCfg) {
    return Promise.resolve({
      checks: [{ ok: false, label: '能加载 ' + rel(PAGE), detail: 'Page() 未被调用' }],
      passed: 0,
      failed: 1
    });
  }

  const checks = [];
  // 冲刷微任务：onLogin 里的 auth.login().then(...) 需要微任务才落地
  function tick() {
    return new Promise(function (res) { setTimeout(res, 0); });
  }
  function it(label, ok) {
    checks.push(ok === true ? { ok: true, label: label } : { ok: false, label: label, detail: typeof ok === 'string' ? ok : String(ok) });
  }

  function fresh() {
    const p = makeInstance(pageCfg);
    p.onLoad && p.onLoad();
    p.onShow && p.onShow();
    return p;
  }

  // 每条测试前清空共享 store，避免相互踩踏（前一条写的登录态污染后一条的初始态）
  function resetStore() {
    Object.keys(stubs.store).forEach(function (k) { delete stubs.store[k]; });
    stubs.app.globalData.prefs = {};
  }

  return (async function () {
    resetStore();
    let p = fresh();
    it('初始是未登录态，显示「游客」',
      p.data.loggedIn === false && p.data.userName === '游客');

    resetStore();
    p = fresh();
    p.onLogin();
    await tick();
    it('登录成功后进入已登录态，头像昵称写进 data',
      p.data.loggedIn === true && p.data.userName === '寒烟客'
        && p.data.avatarUrl === 'https://example.com/avatar.png');

    resetStore();
    p = fresh(); p.onLogin();
    await tick();
    it('登录后昵称也写进偏好（savePrefs 被调用）',
      stubs.app.globalData.prefs.userName === '寒烟客'
        && stubs.app.globalData.prefs.userAvatar === 'https://example.com/avatar.png');

    resetStore();
    p = fresh(); p.onLogin();
    await tick();
    const p2 = fresh();
    it('登录态持久化：重新加载页面后仍是已登录',
      p2.data.loggedIn === true && p2.data.userName === '寒烟客');

    resetStore();
    stubs.setProfileMode('deny');
    const before = stubs.toasts.length;
    p = fresh();
    p.onLogin();
    await tick();
    stubs.setProfileMode('ok');
    it('用户取消授权：不进登录态，且不弹错误提示',
      p.data.loggedIn === false && stubs.toasts.length === before);

    resetStore();
    p = fresh(); p.onLogin();
    await tick();
    p.onLogout();
    it('退出登录后回到未登录态，缓存被清',
      p.data.loggedIn === false && p.data.userName === '游客');

    const failed = checks.filter(function (c) { return !c.ok; }).length;
    return { checks: checks, passed: checks.length - failed, failed: failed };
  }());
}

module.exports = { run: run, rel: rel, PAGE: PAGE };

if (require.main === module) {
  console.log('登录/「我的」页冒烟（' + rel(PAGE) + '）\n');
  run().then(function (r) {
    r.checks.forEach(function (c) {
      console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.label + (c.detail ? '  → ' + c.detail : ''));
    });
    console.log('\n' + (r.failed === 0
      ? '全部通过（' + r.passed + ' 项）'
      : r.failed + ' 项未通过（通过 ' + r.passed + ' 项）'));
    process.exit(r.failed === 0 ? 0 : 1);
  });
}
