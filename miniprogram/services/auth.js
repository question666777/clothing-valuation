// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js

/**
 * 微信登录（前端界面 + 后端接口占位）。
 *
 * 口径（AGENTS.md 第 6 节，2026-09-27 更新）：
 * - **登录是可选项，不设门槛**：小程序启动仍直接进估价页，登录只在「我的」页里作为可选动作。
 * - 当前只做**前端界面**：`login()` 用 wx.getUserProfile 拿头像昵称，存本机缓存并显示。
 *   这**不发短信、不建真实账号、不上传任何用户数据**。
 * - **后端接口留占位**：`loginWithWxCode()` 拿到 wx.login 的 code，但**当前不调用**任何服务端，
 *   只把 code 暂存下来。将来要「真正识别谁是谁 / 存记录 / 多设备同步」时，才在这里接服务端
 *   换 openid（云开发免备案，或自建后端 + 备案），那是后端阶段单独拍板的事。
 *
 * 关键边界：wx.getUserProfile 只能拿到头像昵称，**拿不到 openid**。
 * openid 必须 wx.login 拿 code → 服务端 code2session 换，而那是网络调用，
 * 与本项目「运行时零联网」冲突 —— 所以**现在不做**，只留接口位。
 */

var AUTH_KEY = 'kgg.auth';

// 后端换 openid 的占位：当前阶段不联网，仅存 code 供将来接入
var pendingCode = null;

/**
 * 取当前登录态。只读，不改缓存。
 * @returns {{ loggedIn: boolean, nickName: string, avatarUrl: string }}
 */
function getState() {
  var saved = null;
  try {
    saved = wx.getStorageSync(AUTH_KEY);
  } catch (err) {
    // 读不到缓存按未登录处理
  }
  if (saved && typeof saved === 'object' && saved.nickName) {
    return {
      loggedIn: true,
      nickName: saved.nickName,
      avatarUrl: saved.avatarUrl || ''
    };
  }
  return { loggedIn: false, nickName: '', avatarUrl: '' };
}

/**
 * 前端登录：弹微信授权拿头像昵称，写本机缓存。
 * 返回 Promise，成功 resolve({ nickName, avatarUrl })，拒绝/失败 reject(Error)。
 */
function login() {
  return new Promise(function (resolve, reject) {
    // 基础库 >= 2.21.2 才有 wx.getUserProfile；旧基础库 / 开发工具缺省时如实告知
    if (typeof wx.getUserProfile !== 'function') {
      reject(new Error('当前微信版本不支持授权登录'));
      return;
    }

    wx.getUserProfile({
      desc: '用于在「我的」页显示你的微信头像和昵称',
      success: function (res) {
        var info = (res && res.userInfo) || {};
        var nickName = info.nickName || '';
        var avatarUrl = info.avatarUrl || '';
        if (!nickName) {
          reject(new Error('未获取到昵称，请重试'));
          return;
        }
        var state = { nickName: nickName, avatarUrl: avatarUrl, at: Date.now() };
        try {
          wx.setStorageSync(AUTH_KEY, state);
        } catch (err) {
          // 写缓存失败不阻塞：登录态仍可显示，只是下次启动会掉
        }
        // 同时把昵称写进偏好，让「我的」页显示一致
        try {
          var app = getApp();
          if (app && typeof app.savePrefs === 'function') {
            app.savePrefs({ userName: nickName, userAvatar: avatarUrl });
          }
        } catch (err) {
          // 偏好写入失败不影响登录本身
        }
        resolve({ nickName: nickName, avatarUrl: avatarUrl });
      },
      fail: function () {
        reject(new Error('已取消授权'));
      }
    });
  });
}

/**
 * 退出登录：只清本机登录态，没有任何云端数据可退。
 * 同时把登录时写进偏好的 userName / userAvatar 一并清掉，
 * 否则「我的」页顶部会残留登录时的昵称（loggedIn 已是 false，但名字没换回「游客」）。
 */
function logout() {
  try {
    wx.removeStorageSync(AUTH_KEY);
  } catch (err) {
    // 清不掉也不影响下次启动
  }
  try {
    var app = getApp();
    if (app && typeof app.savePrefs === 'function') {
      app.savePrefs({ userName: null, userAvatar: null });
    }
  } catch (err) {
    // 偏好清理失败不影响退出本身
  }
  pendingCode = null;
}

/**
 * 后端换 openid 的占位（当前不联网，永不调用）。
 * 将来接服务端时：把 code 发到「你自己的后端」，由后端拿 appid+secret 调 code2session。
 * **appsecret 绝不能进小程序包**，所以这一步必须服务端中转，这里只负责把 code 交出去。
 */
function loginWithWxCode() {
  return new Promise(function (resolve, reject) {
    if (typeof wx.login !== 'function') {
      reject(new Error('wx.login 不可用'));
      return;
    }
    wx.login({
      success: function (res) {
        if (res.code) {
          pendingCode = res.code;
          resolve(res.code);
        } else {
          reject(new Error('未取得登录 code'));
        }
      },
      fail: function () {
        reject(new Error('wx.login 失败'));
      }
    });
  });
}

module.exports = {
  getState: getState,
  login: login,
  logout: logout,
  loginWithWxCode: loginWithWxCode
};
