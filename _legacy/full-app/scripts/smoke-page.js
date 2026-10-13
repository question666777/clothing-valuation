#!/usr/bin/env node
/**
 * 页面交互冒烟：在 node 里把 pages/index 的处理函数真的跑一遍。
 *
 * 为什么需要它：小程序页面就是 CommonJS，把 Page / wx / getApp 三个全局桩住就能执行。
 * 静态检查只能查出"绑定名写错"，查不出"函数体里抛异常"——而这两种在界面上
 * **表现完全一样**：点了没反应。所以这里把差异收敛到一个退出码。
 *
 * 用法：node scripts/smoke-page.js            失败则退出码 1
 * 也被 scripts/verify-miniprogram.js 进程内调用 —— 不 spawn 子进程，
 * Windows 下同一 node.exe 嵌套 spawn 会 EBUSY（见 AGENTS.md 踩坑记录）。
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const PAGE = path.join(MP, 'pages', 'index', 'index.js');

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function installStubs() {
  const store = {};
  // 记录跳转调用 —— "占比不齐点提交不许跳走"这条断言需要它
  const calls = { navigateTo: [] };
  // globalData 必须**持久**：提交进估价的载荷存在这里（页面间传参走全局数据）。
  // 每次返回新对象的话，"品牌档位到底有没有传进估价"就没法验了。
  const app = { globalData: {} };
  global.getApp = function () { return app; };
  global.Component = function () {};
  global.wx = {
    getStorageSync: function (k) { return store[k]; },
    setStorageSync: function (k, v) { store[k] = v; },
    removeStorageSync: function (k) { delete store[k]; },
    showToast: function () {},
    navigateTo: function (opt) { calls.navigateTo.push(opt); },
    switchTab: function () {},
    createVKSession: undefined, // 本机没有 VisionKit，验证降级分支
    chooseMedia: function () {}
  };
  return { calls: calls, app: app };
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

/** 模拟一次点击：小程序给的 currentTarget.dataset */
function tap(dataset) {
  return { currentTarget: { dataset: dataset } };
}

function run() {
  const stubs = installStubs();
  const calls = stubs.calls;
  const app = stubs.app;

  let pageCfg = null;
  global.Page = function (cfg) { pageCfg = cfg; };

  // 允许重复调用：模块顶层就调了 Page()，清掉缓存才会重新执行
  delete require.cache[require.resolve(PAGE)];
  require(PAGE);

  if (!pageCfg) {
    return {
      checks: [{ ok: false, label: '能加载 ' + rel(PAGE), detail: 'Page() 未被调用' }],
      passed: 0,
      failed: 1
    };
  }

  const checks = [];
  function it(label, fn) {
    try {
      const r = fn();
      if (r === true) checks.push({ ok: true, label: label });
      else checks.push({ ok: false, label: label, detail: typeof r === 'string' ? r : String(r) });
    } catch (err) {
      checks.push({ ok: false, label: label, detail: '抛异常：' + err.message });
    }
  }

  function fresh() {
    const p = makeInstance(pageCfg);
    p.onLoad();
    return p;
  }

  it('onLoad 能跑完并算出材料成本', function () {
    const p = fresh();
    return p.data.lines.length === 1 && p.data.material && p.data.material.materialCost > 0
      ? true : 'lines=' + p.data.lines.length;
  });

  it('点「＋ 添加成分」（dataset.li 是数字）→ 真的多一条且新行有显示名', function () {
    const p = fresh();
    p.onAddFiber(tap({ li: 0 }));
    const rows = p.data.lines[0].fiberRows;
    if (rows.length !== 2) return '条数还是 ' + rows.length;
    return rows[1].label ? true : '新行 label 是 ' + rows[1].label;
  });

  it('点「＋ 添加成分」（dataset.li 是字符串 "0"）→ 同样生效', function () {
    const p = fresh();
    p.onAddFiber(tap({ li: '0' }));
    const rows = p.data.lines[0].fiberRows;
    return rows.length === 2 ? true : '条数还是 ' + rows.length;
  });

  it('连点到 3 条后停下并给提示，不抛异常', function () {
    const p = fresh();
    p.onAddFiber(tap({ li: 0 }));
    p.onAddFiber(tap({ li: 0 }));
    p.onAddFiber(tap({ li: 0 }));
    const n = p.data.lines[0].fiberRows.length;
    return n === 3 ? true : '条数 ' + n;
  });

  it('切成分档位后，界面上的显示名跟着变（不是只剩 optIndex 变了）', function () {
    const p = fresh();
    const before = p.data.lines[0].fiberRows[0].label;
    p.onFiberChange({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: 20 } });
    const after = p.data.lines[0].fiberRows[0].label;
    return after && after !== before ? true : '切前 "' + before + '" → 切后 "' + after + '"';
  });

  // ------------------------------------------------ 用户只答一个问题：面料成分
  // 这组守两件事：① 界面里不该出现第二个部位（用户不知道，问了只会瞎填）；
  // ② 用户不知道的部位**必须仍然进了估价** —— 漏组成项会被逐级放大成系统性低估。

  it('界面只有一处可填：面料。没有"第 N 种用料"，也没有部位板块', function () {
    const p = fresh();
    if (p.data.lines.length !== 1) return 'lines=' + p.data.lines.length;
    if (p.data.lines[0].part !== 'shell') return '第一条是 ' + p.data.lines[0].part;
    if (typeof p.onAddLine !== 'undefined') return '还能新增用料行';
    if (typeof p.onPartChange !== 'undefined') return '还能改部位';
    if (typeof p.onTabTap !== 'undefined' || typeof p.onPanelTouchEnd !== 'undefined') {
      return '部位板块还挂在页面上';
    }
    return true;
  });

  it('T 恤这类没有里料的衣服：不凭空多出部位，也不多算钱', function () {
    const p = fresh(); // 默认品类 apparel_knit
    return p.data.autoParts.length === 0 && p.data.autoCost === 0
      ? true : 'autoParts=' + JSON.stringify(p.data.autoParts);
  });

  it('羽绒服：里料 + 填充由系统按品类补齐，逐条报出金额与依据', function () {
    const p = fresh();
    const before = p.data.material.materialCost;
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    const parts = p.data.autoParts.map(function (x) { return x.part; });
    if (parts.indexOf('lining') < 0) return '没补里料';
    if (parts.indexOf('filling') < 0) return '没补填充（羽绒服的填充才是成本大头）';
    if (!(p.data.autoCost > 0)) return '自动计入的金额是 0';
    if (!(p.data.material.materialCost > before)) {
      return '补了部位却没进估价：' + before + ' → ' + p.data.material.materialCost;
    }
    // 每条都要说得出依据 —— 不说清"钱从哪来"，用户没法判断这个数可不可信
    const noBasis = p.data.autoParts.filter(function (x) { return !x.basisNote; });
    return noBasis.length === 0 ? true : '有部位没给依据';
  });

  it('水洗标写了里料 → 用标签的（法定标注），不用行业常见值', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    const before = p.data.autoParts.filter(function (x) { return x.part === 'lining'; })[0];
    if (before.fromLabel) return '一开始就标成照水洗标（不该）';
    p.onLabelTextInput({ detail: { value: '面料 聚酯纤维100%\n里料 粘胶纤维100%' } });
    p.onParseLabelText();
    const after = p.data.autoParts.filter(function (x) { return x.part === 'lining'; })[0];
    return after && after.fromLabel === true
      ? true : '里料没改成标签口径：' + JSON.stringify(after);
  });

  it('用量默认收起；收起态要报出系统替用户填的值，且能展开', function () {
    const p = fresh();
    if (p.data.lines[0].showAmount !== false) return '用量默认是展开的';
    if (!p.data.lines[0].amountNote) return '收起态没说清系统替他填了什么';
    p.onToggleAmount(tap({ li: 0 }));
    if (p.data.lines[0].showAmount !== true) return '展不开';
    p.onToggleAmount(tap({ li: 0 }));
    return p.data.lines[0].showAmount === false ? true : '收不回去';
  });

  it('默认成分尚未核对时会被标出来；改过成分之后就撤掉提示', function () {
    const p = fresh();
    // 填写成本越低，越容易被直接采纳 —— 所以"这还是猜的"必须能被界面判定出来
    if (p.data.lines[0].fibersTouched !== false) return '初始就标成已核对';
    p.onFiberChange({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: 5 } });
    return p.data.lines[0].fibersTouched === true ? true : '改过成分后没标成已核对';
  });

  it('拍水洗标回填的成分直接算已核对（法定标注，权威性最高）', function () {
    const p = fresh();
    p.onLabelTextInput({ detail: { value: '面料 羊毛80% 涤纶20%' } });
    p.onParseLabelText();
    const shell = p.data.lines.filter(function (l) { return l.part === 'shell'; })[0];
    return shell && shell.fibersTouched === true ? true : '水洗标回填后没标成已核对';
  });

  it('切换「按面料名（元/米）」：单位跟着换，切回成分法时克数自动还原', function () {
    const p = fresh();
    p.onModeChange(tap({ li: 0, mode: 'fabric' }));
    if (p.data.lines[0].mode !== 'fabric') return 'mode=' + p.data.lines[0].mode;
    // 按面料名是元/米。单位不跟着换，界面显示的"克"和定价的口径就不是一件事
    if (p.data.lines[0].unit !== '米') return '按米计价却显示单位 ' + p.data.lines[0].unit;
    p.onModeChange(tap({ li: 0, mode: 'fiber' }));
    const l = p.data.lines[0];
    if (l.mode !== 'fiber') return '切不回来';
    return l.unit === '克' && parseFloat(l.amountText) > 0
      ? true : 'unit=' + l.unit + ' amount=' + l.amountText;
  });

  it('换品类、换品牌、换系列都能重算', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    p.onBrandChange({ detail: { value: 1 } });
    p.onSeriesChange({ detail: { value: 0 } });
    return p.data.category === 'apparel_down' && !!p.data.brandInfo ? true : 'brandInfo 为空';
  });

  // ------------------------------------------------ 只做衣物：鞋与包要如实告知
  // 2026-09-27 把品类收窄到衣物。删掉鞋包的数据只是第一步 —— 如果识别层对
  // "运动鞋"静默什么都不做，用户分不清是「没识别出来」还是「本来就不做」，
  // 他会反复换词重试。所以要守的是**有回应**，不是"表里没有了"。

  it('输入「耐克运动鞋」→ 明确告知暂不支持，不预填任何成分、也不改品类', function () {
    const p = fresh();
    p.onNameInput({ detail: { value: '耐克运动鞋' } });
    const catBefore = p.data.category;
    const fibersBefore = JSON.stringify(p.data.lines[0].fiberRows);
    p.onNameBlur();
    if (!/不支持/.test(p.data.hint)) return '没有任何回应，用户会以为是识别失败：hint=' + p.data.hint;
    if (p.data.category !== catBefore) return '竟按鞋改了品类 → ' + p.data.category;
    if (JSON.stringify(p.data.lines[0].fiberRows) !== fibersBefore) {
      return '顺着"鞋"把成分也预填了 —— 这是通往错数的静默通道';
    }
    return true;
  });

  it('输入衣物名照常识别预填，且预填的成分仍标着"未核对"', function () {
    const p = fresh();
    p.onNameInput({ detail: { value: '羊绒大衣' } });
    p.onNameBlur();
    if (/不支持/.test(p.data.hint)) return '衣物被误判成不支持的品类';
    if (p.data.category !== 'apparel_outerwear') return '品类没识别成外套：' + p.data.category;
    const fb = p.data.lines[0].fiberRows[0];
    if (!/羊绒/.test(fb.label)) return '成分没预填成羊绒：' + fb.label;
    // 商品名推出的是**推测**，不是水洗标读到的 —— 不许预先标成已核对
    if (p.data.lines[0].fibersTouched) return '推测出的成分被标成已核对';
    return true;
  });

  it('OCR 不可用时拍照入口走降级（提示手动输入），不静默失败', function () {
    const p = fresh();
    p.onPickLabel();
    // wx.chooseMedia 被桩成空函数，所以只验证"不抛异常"；
    // 真正的降级分支由「手动输入文字 → 解析回填」这条覆盖
    p.onToggleManualInput();
    if (p.data.showManualInput !== true) return '手动输入区没展开';
    p.onLabelTextInput({ detail: { value: '面料 羊毛80% 涤纶20%' } });
    p.onParseLabelText();
    return !!p.data.recognizeNote ? true : '解析后没有给任何反馈文案';
  });

  // ------------------------------------------------ 成分占比 100% 校验
  // 这组必须**真跑页面函数**才算数：占比是否合格是三个地方算的
  // （界面实时提示、提交拦截、配置层定价），静态检查只能证明"这三行代码都在"，
  // 证明不了它们判的是同一件事。这里跑的就是用户点下去的那条路径。

  it('成分占比初始为 100% → 界面标为合格', function () {
    const p = fresh();
    const l = p.data.lines[0];
    return l.pctBalanced === true && l.pctSum === 100
      ? true : 'pctBalanced=' + l.pctBalanced + ' sum=' + l.pctSum;
  });

  it('占比改成 80% → 立刻标为不合格，并说清当前合计', function () {
    const p = fresh();
    p.onFiberPctInput({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: '80' } });
    const l = p.data.lines[0];
    return l.pctBalanced === false && /80%/.test(l.pctNote) ? true : 'note=' + l.pctNote;
  });

  it('占比不齐时点「估算真实价值」→ 拦住不跳转，且指得出该改哪里', function () {
    const p = fresh();
    p.onFiberPctInput({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: '80' } });
    const before = calls.navigateTo.length;
    p.onSubmit();
    if (calls.navigateTo.length !== before) return '竟然跳走了';
    return /100%/.test(p.data.hint) && /面料/.test(p.data.hint) ? true : 'hint=' + p.data.hint;
  });

  it('占比凑成 100% 后点提交 → 正常跳转（证明拦截不会误伤）', function () {
    const p = fresh();
    const before = calls.navigateTo.length;
    p.onSubmit();
    return calls.navigateTo.length === before + 1 ? true : '没跳转（hint=' + p.data.hint + '）';
  });

  it('点「＋ 添加成分」自动把原成分 100%→80%，合计直接是 100%', function () {
    const p = fresh();
    p.onAddFiber(tap({ li: 0 }));
    const l = p.data.lines[0];
    return l.fiberRows.length === 2 && l.pctBalanced === true && l.pctSum === 100
      ? true : 'rows=' + l.fiberRows.length + ' sum=' + l.pctSum;
  });

  it('删成分删到只剩一种 → 占比自动回到 100%', function () {
    const p = fresh();
    p.onAddFiber(tap({ li: 0 })); // 80 / 20
    p.onRemoveFiber({ currentTarget: { dataset: { li: 0, fi: 1 } } });
    const l = p.data.lines[0];
    return l.fiberRows.length === 1 && l.pctBalanced === true
      ? true : 'rows=' + l.fiberRows.length + ' sum=' + l.pctSum;
  });

  it('「其他纤维」在选项里选得到，且能把差额补到 100%', function () {
    const p = fresh();
    const otherIdx = p.data.fiberOptions.map(function (o) { return o.fiber; }).indexOf('__other__');
    if (otherIdx < 0) return '选项表里没有「其他纤维」—— 水洗标写"其他纤维 5%"时用户无路可走';
    p.onFiberPctInput({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: '95' } });
    p.onAddFiber(tap({ li: 0 }));
    p.onFiberChange({ currentTarget: { dataset: { li: 0, fi: 1 } }, detail: { value: otherIdx } });
    p.onFiberPctInput({ currentTarget: { dataset: { li: 0, fi: 1 } }, detail: { value: '5' } });
    const l = p.data.lines[0];
    return l.pctBalanced === true && l.pctSum === 100 ? true : 'sum=' + l.pctSum + ' note=' + l.pctNote;
  });

  it('占比不齐时材料成本不再按缺失比例打折（配置层也跟着降级）', function () {
    const p = fresh();
    p.onFiberPctInput({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: '80' } });
    const m = p.data.material;
    return m.degraded === true && m.materialCost === 0
      ? true : 'materialCost=' + m.materialCost + ' degraded=' + m.degraded;
  });

  // ------------------------------------------------ 识别出的信息必须真的走进估价
  // 这组守的是「识别结果被界面悄悄丢掉」：静态检查能证明那几行代码还在，
  // 证明不了它真的影响了算出来的数。所以这里跑完整链路，最后去看提交载荷。

  it('每条有价成分都带得出单价与出处，且出处含数据期', function () {
    const p = fresh();
    const row = p.data.lines[0].fiberRows[0];
    if (!row.priceText) return '没有单价：' + JSON.stringify(row.priceText);
    if (!row.srcText) return '没有出处';
    // 只有机构名不够 —— 官方报价是变动的，用户得知道这是哪一期的数
    return /\d{4}-\d{2}/.test(row.srcText) ? true : '出处里没有数据期：' + row.srcText;
  });

  it('查不到档位的纤维：如实说"暂无权威报价"，不假装有价', function () {
    const p = fresh();
    const otherIdx = p.data.fiberOptions.map(function (o) { return o.fiber; }).indexOf('__other__');
    if (otherIdx < 0) return '选项表里没有「其他纤维」';
    p.onFiberChange({ currentTarget: { dataset: { li: 0, fi: 0 } }, detail: { value: otherIdx } });
    const row = p.data.lines[0].fiberRows[0];
    return /暂无权威报价/.test(row.priceText) ? true : 'priceText=' + JSON.stringify(row.priceText);
  });

  it('输入「爱马仕羊绒大衣」→ 预选品牌，且明说这是预选、要核对', function () {
    const p = fresh();
    p.onNameInput({ detail: { value: '爱马仕羊绒大衣' } });
    p.onNameBlur();
    if (!p.data.brandInfo) return '没预选品牌';
    if (!/爱马仕/.test(p.data.brandInfo.label)) return '选中的不是爱马仕：' + p.data.brandInfo.label;
    return /核对/.test(p.data.hint) ? true : '预选了却不说，用户会当成是我们照他写的算的';
  });

  it('输入「古驰大衣」→ 库里没这家公司，改走奢侈档估算，并如实说明', function () {
    const p = fresh();
    p.onNameInput({ detail: { value: '古驰大衣' } });
    p.onNameBlur();
    if (p.data.brandInfo) return '竟然从品牌库里找到了古驰（库里只有具名的 20 家）';
    if (p.data.brandTierGuess !== 'luxury') {
      return '档位没接住：' + JSON.stringify(p.data.brandTierGuess);
    }
    // 说"这是按档位估的"与不说，用户对同一个数字的信任程度完全不同
    return /奢侈/.test(p.data.tierNotice) ? true : 'tierNotice=' + JSON.stringify(p.data.tierNotice);
  });

  it('奢侈档真的进了估价载荷（不进的话设计费率按普通档算，差 5 倍）', function () {
    const p = fresh();
    p.onNameInput({ detail: { value: '古驰大衣' } });
    p.onNameBlur();
    p.onSubmit();
    const payload = app.globalData.lastEstimate;
    if (!payload) return '没生成估价载荷';
    return payload.item.brandTier === 'luxury'
      ? true : 'item.brandTier=' + JSON.stringify(payload.item.brandTier);
  });

  it('没识别到品牌档位时不乱塞档位（老老实实走默认档）', function () {
    const p = fresh();
    p.onNameInput({ detail: { value: '全棉纱卡工装外套' } });
    p.onNameBlur();
    p.onSubmit();
    const payload = app.globalData.lastEstimate;
    if (!payload) return '没生成估价载荷';
    return !payload.item.brandTier ? true : '莫名传了 ' + payload.item.brandTier;
  });

  it('识别出品类时典型克数跟着换（不许停在上一品类的数上）', function () {
    const p = fresh();
    const before = p.data.lines[0].amountText; // 针织衫 200 克
    p.onNameInput({ detail: { value: '羊绒大衣' } });
    p.onNameBlur();
    if (p.data.category !== 'apparel_outerwear') return '品类没识别成外套：' + p.data.category;
    const after = p.data.lines[0].amountText; // 外套 400 克
    return after !== before ? true : '品类换了、克数还是 ' + after + '（上一品类的值）';
  });

  it('手动切品类 与 识别出品类，克数结果完全一致（两条路径不许各写一遍）', function () {
    const a = fresh();
    a.onCategoryChange({ detail: { value: 'apparel_down' } });
    const b = fresh();
    b.onNameInput({ detail: { value: '羽绒服' } });
    b.onNameBlur();
    if (b.data.category !== 'apparel_down') return '识别路径的品类是 ' + b.data.category;
    return a.data.lines[0].amountText === b.data.lines[0].amountText
      ? true
      : '手动切 = ' + a.data.lines[0].amountText + '，识别出 = ' + b.data.lines[0].amountText;
  });

  it('用户自己称过的克数，不许被换品类/识别覆盖', function () {
    const p = fresh();
    p.onAmountInput({ currentTarget: { dataset: { li: 0 } }, detail: { value: '333' } });
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    return p.data.lines[0].amountText === '333'
      ? true : '实测值被行业常见值盖掉了：' + p.data.lines[0].amountText;
  });

  // ------------------------------------------------ 整件衣服重量 · 按品类分列
  // 守两件事：① 用户填的是"整件有多重"（他能称），系统换算成各部位克数；
  // ② 换品类时用户选的品牌/面料不许被悄悄换掉（列表重排了，下标不能沿用）。

  it('整件重量填 650 克 → 面料、里料、填充的克数都跟着变', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    const beforeShell = p.data.lines[0].amountText;
    const beforeAuto = p.data.autoParts.map(function (x) { return x.weightText; }).join(',');

    p.onTotalWeightInput({ detail: { value: '650' } });
    const afterShell = p.data.lines[0].amountText;
    const afterAuto = p.data.autoParts.map(function (x) { return x.weightText; }).join(',');

    if (afterShell === beforeShell) return '面料克数没动：' + afterShell;
    if (afterAuto === beforeAuto) return '里料 / 填充没跟着变：' + afterAuto;
    // 羽绒服基准 520 克（220+120+180），650/520 = 1.25 → 面料 220 × 1.25 = 275
    return afterShell === '275' ? true : '面料 ' + afterShell + '，应为 275';
  });

  it('换算依据写在界面上（用户要看得见这个克数从哪来）', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    p.onTotalWeightInput({ detail: { value: '650' } });
    const note = p.data.totalWeightNote || '';
    return note.indexOf('650') >= 0 && note.indexOf('520') >= 0
      ? true : '说明是「' + note + '」';
  });

  it('整件重量清空 → 回落本类常见值，不报错也不留个 0', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    p.onTotalWeightInput({ detail: { value: '650' } });
    p.onTotalWeightInput({ detail: { value: '' } });
    return p.data.lines[0].amountText === '220'
      ? true : '清空后是 ' + p.data.lines[0].amountText + '，应为该品类典型值 220';
  });

  it('填了整件重量再换品类：重量留着，各部位按新品类重新换算', function () {
    const p = fresh();
    p.onTotalWeightInput({ detail: { value: '600' } });
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    // 衣服还是那件，重量不该因为换了个品类就变
    if (p.data.totalWeightText !== '600') return '整件重量被清掉了：' + p.data.totalWeightText;
    // 600/520 = 1.1538 → 面料 220 × 1.1538 ≈ 253.8
    return p.data.lines[0].amountText === '253.8'
      ? true : '面料 ' + p.data.lines[0].amountText + '，应为 253.8';
  });

  it('换品类不会把用户选的品牌悄悄换掉（下标按 key 搬，搬不到就展开范围）', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    const idx = p.data.brandOptions.findIndex(function (o) { return o.key === 'bosideng'; });
    if (idx < 0) return '羽绒服类里找不到波司登';
    p.onBrandChange({ detail: { value: idx } });

    // 换到裤装：波司登不在「适合本类」里，但**不许静默丢掉用户的选择**
    p.onCategoryChange({ detail: { value: 'apparel_pants' } });
    const sel = p.data.brandOptions[p.data.brandIndex];
    return sel && sel.key === 'bosideng'
      ? true : '换品类后选中项变成了「' + (sel ? sel.label : '？') + '」';
  });

  it('品牌列表按品类分列：羽绒服类里波司登在列、耐克不在本类里', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    const keys = p.data.brandOptions.map(function (o) { return o.key; });
    if (keys.indexOf('bosideng') < 0) return '波司登不在羽绒服类的列表里';
    if (keys.indexOf('nike') >= 0) return '耐克混进了羽绒服的「适合本类」（它主营运动）';
    return true;
  });

  it('一键展开全部品牌后，选中的还是原来那家（展开前后下标不是一回事）', function () {
    const p = fresh();
    p.onCategoryChange({ detail: { value: 'apparel_down' } });
    const idx = p.data.brandOptions.findIndex(function (o) { return o.key === 'bosideng'; });
    p.onBrandChange({ detail: { value: idx } });

    p.onToggleBrandScope();
    const sel = p.data.brandOptions[p.data.brandIndex];
    return sel && sel.key === 'bosideng'
      ? true : '展开后选中项漂到了「' + (sel ? sel.label : '？') + '」';
  });

  const failed = checks.filter(function (c) { return !c.ok; }).length;
  return { checks: checks, passed: checks.length - failed, failed: failed };
}

module.exports = { run: run, rel: rel, PAGE: PAGE };

if (require.main === module) {
  console.log('页面交互冒烟（' + rel(PAGE) + '）\n');
  const r = run();
  r.checks.forEach(function (c) {
    console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.label + (c.detail ? '  → ' + c.detail : ''));
  });
  console.log('\n' + (r.failed === 0
    ? '全部通过（' + r.passed + ' 项）'
    : r.failed + ' 项未通过（通过 ' + r.passed + ' 项）'));
  process.exit(r.failed === 0 ? 0 : 1);
}
