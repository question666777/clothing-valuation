/**
 * 官方价格源探测结论总账（2026-09-27 实测）。
 *
 * 为什么把"探测结论"也当成数据放在代码里：
 *   下一轮再想动价格源时，不用重新摸一遍哪条路通、哪条路死。
 *   每条都带实测证据（状态码 / 报错 / 接口地址），不是印象。
 *
 * status 取值：
 *   ready        —— 已实现自动抓取
 *   partial      —— 接口已打通，但拿到的不是价格（或缺映射），需继续定位
 *   js-rendered  —— 页面靠 JS 异步加载，HTML 里无数据，接口未定位
 *   unreachable  —— 网络层不通（非反爬）
 */

module.exports = {
  verifiedAt: '2026-09-27',
  sources: [
    {
      key: 'cottonchina',
      label: '中国棉花信息网 · CC Index / 纱线指数',
      url: 'https://www.cottonchina.org.cn/',
      status: 'ready',
      note: '首页静态 HTML 直接带当日全套指数（GBK 编码），无需登录、无需接口。' +
        '已实现自动抓取，覆盖棉三档 + 粘胶/涤纶短纤共 5 条。'
    },
    {
      key: 'shaoxing',
      label: '绍兴e价通 · 中国轻纺城畅销面料排行榜',
      url: 'https://jgjg.sx.gov.cn/qf_prod_list.aspx?id=15517',
      status: 'unreachable',
      note: 'curl 与 Node 均报 CONNECT tunnel failed, response 502；主站 jgjg.sx.gov.cn 同样不通。' +
        '是网络层不可达，不是反爬 —— 换网络环境（自有服务器/云函数出口）应重测。'
    },
    {
      key: 'cfd',
      label: '中国羽绒信息网',
      url: 'https://www.cfd.com.cn/index.php?s=/Web/Market/data.html',
      status: 'partial',
      note: '已打通 JSON 接口 /Web/Market/iaedatalist.html，但它返回的是「羽绒原毛/寝具/服装的' +
        '进出口量」统计，不是价格。价格类页面未定位，需继续找。'
    },
    {
      key: 'esilk',
      label: '中国茧丝绸交易市场（金蚕网）',
      url: 'https://www.esilk.net/jqindex.aspx',
      status: 'partial',
      note: '公开 JSON API 已打通：jqadmin.esilk.net/api/publication-results/?id=N ' +
        '（前端 loadAllIndexData(id) 调用）。但 id=1 返回的是「景气指数」（0~100 的情绪指标），' +
        '不是生丝元/吨价格 —— 生丝价对应的 id 待逐个试出。'
    },
    {
      key: 'mofcom',
      label: '商务部商务预报 · 指数中心（柯桥纺织指数）',
      url: 'https://cif.mofcom.gov.cn/cif/html/indexCenter2021/index.html',
      status: 'js-rendered',
      note: '首页是 UA 跳转脚本（1151 字节）；指数中心 34KB 但正文靠 JS 加载，HTML 内无数字。' +
        '接口未定位。'
    }
  ]
};
