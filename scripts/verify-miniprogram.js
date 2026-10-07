#!/usr/bin/env node
/**
 * 小程序侧校验。没有微信开发者工具也要能跑，覆盖这些会静默出错的问题：
 *
 *   1. 工程完整性：app.json 声明的页面文件是否齐全、启动页是否是估价页
 *   2. 组件引用：WXML 里用到的自定义组件是否在页面 json 的 usingComponents 里声明
 *   3. 样式契约：WXSS 里 var(--x) 是否有定义；有没有绕过主题写死色值
 *   4. 同步与等价：miniprogram/ 下的同步产物是否与真源一致，且估值结果与项目根完全相同
 *   5. 水洗标成分解析：OCR / 手动输入共用的那条解析链路
 *   6. 识别与价格表不脱节：识别产出的 key 必须都能查得到价
 *   7. 可点热区：挂了 bindtap 的元素估算高度 ≥ 40px（太小 = 点不中 = "点了没反应"）
 *   8. 页面交互冒烟：把事件处理函数真跑一遍（抛异常同样表现成"点了没反应"）
 *   9. 占比口径单一真源：成分合计容差只能有一份，不许各处写死
 *  10. 事件绑定名：wxml 绑的函数必须在同名 js 里真实存在（"点了没反应"的第三种成因）
 *  11. 用料价格可溯源：有价就必须带出处与数据期，且**界面真的渲染了出来**
 *  12. 品牌识别：商品名里的品牌要认得出、更要真的走进估价（档位差 5 倍）
 *
 * 用法：node scripts/verify-miniprogram.js     失败则退出码 1
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

let passed = 0;
let failed = 0;

function check(ok, label, detail) {
  if (ok) {
    passed += 1;
    console.log('  PASS  ' + label);
  } else {
    failed += 1;
    console.log('  FAIL  ' + label + (detail ? '  → ' + detail : ''));
  }
}

function group(name) {
  console.log('\n' + name);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch (err) {
    return false;
  }
}

// WXML 里带短横线的内置组件，除这些之外带短横线的标签都当作自定义组件
const BUILTIN_DASHED = [
  'scroll-view', 'swiper-item', 'movable-view', 'movable-area', 'cover-view', 'cover-image',
  'rich-text', 'web-view', 'open-data', 'functional-page-navigator', 'official-account',
  'match-media', 'page-container', 'share-element', 'keyboard-accessory', 'root-portal',
  'voip-room', 'native-component', 'page-meta', 'navigation-bar', 'picker-view',
  'picker-view-column', 'checkbox-group', 'radio-group', 'ad-custom', 'live-player',
  'live-pusher', 'channel-live', 'channel-video', 'inline-payment-panel'
];

function listFiles(dir, ext, out) {
  const acc = out || [];
  if (!exists(dir)) return acc;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, ext, acc);
    } else if (!ext || entry.name.slice(-ext.length) === ext) {
      acc.push(full);
    }
  });
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

// ---------------------------------------------------------------- 1. 工程完整性

function checkProject() {
  group('1. 工程完整性');

  const appJsonPath = path.join(MP, 'app.json');
  if (!exists(appJsonPath)) {
    check(false, 'miniprogram/app.json 存在');
    return [];
  }
  check(true, 'miniprogram/app.json 存在');

  const app = readJson(appJsonPath);
  const pages = app.pages || [];

  check(pages.length > 0, 'app.json 声明了页面', 'pages 为空');

  let missing = [];
  pages.forEach(function (page) {
    ['.js', '.json', '.wxml', '.wxss'].forEach(function (ext) {
      const p = path.join(MP, page + ext);
      if (!exists(p)) missing.push(page + ext);
    });
  });
  check(missing.length === 0, '每个页面的 js/json/wxml/wxss 四件套齐全', '缺 ' + missing.join(', '));

  const tabList = ((app.tabBar || {}).list || []).map(function (t) { return t.pagePath; });
  const badTab = tabList.filter(function (p) { return pages.indexOf(p) < 0; });
  check(badTab.length === 0, 'tabBar 指向的页面都已在 pages 中声明', '未声明 ' + badTab.join(', '));

  const entry = pages[0];
  check(!!entry, '第一个页面（启动页）非空');
  // 打开即用：启动页必须是估价页，不能是登录页（账号体系留到后端阶段，见 AGENTS.md 第 6 节）
  check(entry === 'pages/index/index',
    '启动页是估价页，打开就能用（不挡登录）',
    '实际启动页 ' + entry);
  check(pages.indexOf('pages/login/login') < 0,
    '登录页已移出 pages（无账号体系时它不该存在）');

  return pages;
}

// ---------------------------------------------------------------- 2. 组件引用

function checkComponents(pages) {
  group('2. 组件引用');

  const wxmls = listFiles(MP, '.wxml');
  const undeclared = [];

  wxmls.forEach(function (wxmlPath) {
    const jsonPath = wxmlPath.replace(/\.wxml$/, '.json');
    let declared = [];
    if (exists(jsonPath)) {
      const cfg = readJson(jsonPath);
      declared = Object.keys(cfg.usingComponents || {});
    }

    const src = fs.readFileSync(wxmlPath, 'utf8');
    const tags = {};
    const re = /<([a-zA-Z][a-zA-Z0-9-]*)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const tag = m[1];
      if (tag.indexOf('-') < 0) continue;
      if (tag.slice(0, 3) === 'wx-') continue;
      if (BUILTIN_DASHED.indexOf(tag) >= 0) continue;
      tags[tag] = true;
    }

    Object.keys(tags).forEach(function (tag) {
      if (declared.indexOf(tag) < 0) {
        undeclared.push(rel(wxmlPath) + ' 用了 <' + tag + '> 但未在 json 里声明');
      }
    });
  });

  check(undeclared.length === 0, 'WXML 里用到的自定义组件都已在 usingComponents 中声明',
    undeclared.join(' | '));

  // 反向：声明了但目录不存在
  const brokenRefs = [];
  pages.concat(['components/option-chips', 'components/breakdown-card']).forEach(function (page) {
    const jsonPath = path.join(MP, page + '.json');
    if (!exists(jsonPath)) return;
    const cfg = readJson(jsonPath);
    const using = cfg.usingComponents || {};
    Object.keys(using).forEach(function (name) {
      const target = using[name].charAt(0) === '/'
        ? path.join(MP, using[name])
        : path.resolve(path.dirname(jsonPath), using[name]);
      if (!exists(target + '.js')) brokenRefs.push(page + ' → ' + name + '（' + using[name] + '）');
    });
  });
  check(brokenRefs.length === 0, 'usingComponents 指向的组件文件都真实存在', brokenRefs.join(' | '));
}

// ---------------------------------------------------------------- 3. 样式契约

const ALLOWED_HEX = ['#FFFFFF', '#FFF', '#000000', '#000'];

function checkStyles() {
  group('3. 样式契约');

  const themeWxss = path.join(MP, 'styles', 'theme.wxss');
  if (!exists(themeWxss)) {
    check(false, 'miniprogram/styles/theme.wxss 存在（需先跑同步脚本）');
    return;
  }
  const themeSrc = fs.readFileSync(themeWxss, 'utf8');

  const defined = {};
  const defRe = /(--[a-zA-Z0-9-]+)\s*:/g;
  let dm;
  while ((dm = defRe.exec(themeSrc)) !== null) defined[dm[1]] = true;
  check(Object.keys(defined).length > 0, 'theme.wxss 定义了 CSS 变量',
    '解析到 ' + Object.keys(defined).length + ' 个');

  const wxssFiles = listFiles(MP, '.wxss');
  const undef = [];
  const hardcoded = [];

  wxssFiles.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8');
    const name = rel(f);
    // theme.wxss 本身是**变量定义文件**，它是 WXSS 侧的真源，写死色值正是它的职责
    const isTokenFile = name === 'miniprogram/styles/theme.wxss';

    const useRe = /var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g;
    let um;
    while ((um = useRe.exec(src)) !== null) {
      if (!defined[um[1]]) undef.push(name + ' 用了未定义的 ' + um[1]);
    }

    if (isTokenFile) return;

    // 写死色值检查：允许 #FFF/#000（纯白纯黑）与 rgba()，其余十六进制一律视为绕过主题
    src.split('\n').forEach(function (line, i) {
      const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
      let hm;
      while ((hm = hexRe.exec(line)) !== null) {
        const hex = hm[0].toUpperCase();
        if (ALLOWED_HEX.indexOf(hex) >= 0) continue;
        hardcoded.push(name + ':' + (i + 1) + ' 写死 ' + hm[0]);
      }
    });
  });

  check(undef.length === 0, 'WXSS 里引用的 CSS 变量都有定义', undef.join(' | '));
  check(hardcoded.length === 0, 'WXSS 里没有绕过主题写死的色值（纯白/纯黑除外）',
    hardcoded.join(' | '));
}

// ---------------------------------------------------------------- 4. 同步与等价

function checkSyncAndParity() {
  group('4. 同步与等价');

  // 在**同一进程内**跑漂移检查，不起子进程 ——
  // Windows 下 spawn 同一个 node.exe 会偶发 EBUSY（文件锁竞争），
  // 那会让这条断言时对时错，是最难查的一类假失败
  const sync = require(path.join(ROOT, 'scripts', 'sync-miniprogram.js'));
  const drift = sync.run({ checkOnly: true });
  check(drift.problems.length === 0,
    'miniprogram/ 同步产物与真源一致（config/ core/ services/ styles/）',
    drift.problems.join(' | '));

  // 用 node 的 CommonJS 环境直接跑小程序侧同步产物 —— 小程序运行时就是 CommonJS，
  // 这等于在没有开发者工具的情况下验证了 require 链路与计算等价
  let mpEstimate = null;
  let rootEstimate = null;
  let mpConfig = null;
  let rootConfig = null;
  let requiredOk = true;
  let errMsg = '';
  try {
    mpEstimate = require(path.join(MP, 'core', 'valuation', 'index.js')).estimate;
    rootEstimate = require(path.join(ROOT, 'core', 'valuation', 'index.js')).estimate;
    mpConfig = require(path.join(MP, 'config', 'index.js'));
    rootConfig = require(path.join(ROOT, 'config', 'index.js'));
  } catch (err) {
    requiredOk = false;
    errMsg = err.message;
  }
  check(requiredOk, 'miniprogram/core/valuation 能被 require（require 路径成立）', errMsg);

  if (requiredOk) {
    // 走界面层真实调用路径：先用 config 定好价，再把定价结果交给 core
    // （core 是纯计算层，明确不查价格表，见 core/valuation/model.js 文件头）
    const materials = [
      {
        part: 'shell',
        amount: 1.6,
        unit: '米',
        fibers: [
          { fiber: 'cotton', tier: 'grade_3128B', pct: 70 },
          { fiber: 'polyester', tier: 'staple_fiber', pct: 30 }
        ]
      },
      { part: 'lining', amount: 1, unit: '米', fabricKey: 'cotton_twill' }
    ];

    const mpMaterial = mpConfig.estimateMaterialCost({ materials: materials, category: 'apparel_shirt' });
    const rootMaterial = rootConfig.estimateMaterialCost({ materials: materials, category: 'apparel_shirt' });

    check(mpMaterial.materialCost === rootMaterial.materialCost,
      '混纺 + 多部位用料的定价两侧一致',
      '小程序 ' + mpMaterial.materialCost + ' vs 项目根 ' + rootMaterial.materialCost);

    check(mpMaterial.materialCost > 0 && !mpMaterial.degraded,
      '混纺（棉 70% + 涤 30%）能算出有效材料成本，未降级',
      'materialCost=' + mpMaterial.materialCost + ' degraded=' + mpMaterial.degraded);

    check(mpMaterial.lineCount === 2,
      '两条用料都被计入（多部位没有被合并或漏算）',
      'lineCount=' + mpMaterial.lineCount);

    // 单位口径：纤维按千克计价，用量填米，必须有克重桥 —— 两侧都要有，且结果一致
    const mpConv = mpConfig.convertAmountToKg(1.6, '米', { gsm: 180, width: 1.5 });
    const rootConv = rootConfig.convertAmountToKg(1.6, '米', { gsm: 180, width: 1.5 });
    check(mpConv.kg === rootConv.kg && mpConv.kgPerMeter === 0.27,
      '小程序侧也有单位换算桥（元/千克 ↔ 米），且与项目根一致',
      '小程序 ' + JSON.stringify(mpConv) + ' vs 项目根 ' + JSON.stringify(rootConv));

    check(mpMaterial.lines[0].kg > 0 && mpMaterial.lines[0].priceUnit === '千克',
      '纤维条用料已换算成千克后计价，不是把「米」直接乘「元/千克」',
      'kg=' + mpMaterial.lines[0].kg + ' cost=' + mpMaterial.lines[0].cost);

    check(mpMaterial.lines[0].specAssumed === true,
      '估算克重被标记为假设（界面据此提示用户可改实测值）');

    // 品牌粒度：必须能落到系列，不能只到品牌
    const bd = mpConfig.getBrand('bosideng');
    const mainSeries = (bd.series || []).filter(function (s) { return s.key === 'main'; })[0];
    const xzf = (bd.series || []).filter(function (s) { return s.key === 'xuezhongfei'; })[0];
    check(mainSeries && xzf && mainSeries.grossMargin !== xzf.grossMargin,
      '品牌库支持「品牌 × 系列」粒度（波司登主牌 ≠ 雪中飞）',
      '主牌 ' + (mainSeries && mainSeries.grossMargin) + ' / 雪中飞 ' + (xzf && xzf.grossMargin));

    const brandLevel = mpConfig.resolveCoefficients({ category: 'apparel_down', brandKey: 'bosideng' });
    const seriesLevel = mpConfig.resolveCoefficients({
      category: 'apparel_down', brandKey: 'bosideng', seriesKey: 'xuezhongfei'
    });
    check(seriesLevel.premiumRate < brandLevel.premiumRate,
      '选雪中飞时溢价率低于品牌整体口径（系列差异真的生效了）',
      '雪中飞 ' + seriesLevel.premiumRate + ' vs 品牌整体 ' + brandLevel.premiumRate);

    const item = {
      category: 'apparel_shirt',
      brandKey: 'bosideng',
      material: { unitPrice: rootMaterial.materialCost, amount: 1 },
      processingFee: 45,
      overflowRatio: 0.5
    };

    const a = mpEstimate(item);
    const b = rootEstimate(item);

    check(JSON.stringify(a.priceRange) === JSON.stringify(b.priceRange),
      '小程序侧与项目根估值结果完全相同',
      '小程序 ' + JSON.stringify(a.priceRange) + ' vs 项目根 ' + JSON.stringify(b.priceRange));

    check(a.priceRange.mid > 0 && !a.degraded,
      '定价后的用料能算出有效结果（未降级）',
      'degraded=' + a.degraded + ' mid=' + a.priceRange.mid);

    // 契约：core 不查价格表。未定价的用料必须判降级，而不是被静默当成 0 算过
    const raw = mpEstimate({
      category: 'apparel_shirt',
      materials: [{ part: 'shell', amount: 1.6, fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 100 }] }]
    });
    check(raw.degraded === true,
      'core 层不自行查价格表：未定价的用料必须判为降级，不许静默按 0 算过');

    check(typeof a.coefficients.brandLabel === 'string' && a.coefficients.brandLabel.length > 0,
      '品牌标签订位到具体品牌（不是档位兜底）',
      String(a.coefficients.brandLabel));

    check(a.coefficients.premiumRateSource === 'brand-gross-margin',
      '品牌溢价率来自官方毛利率派生');

    check(a.doubleCountWarning === true,
      '品牌溢价与允许溢出的重复计算风险被如实标记');

    check(a.disclaimer === '估值仅供参考，不构成购买建议', '免责声明随结果返回');
  }

  // services/ 也必须能被 require（识别入口）
  let rec = null;
  try {
    rec = require(path.join(MP, 'services', 'recognize.js'));
  } catch (err) {
    rec = null;
  }
  check(!!rec && typeof rec.recognizeByText === 'function'
    && typeof rec.recognizeByImage === 'function'
    && typeof rec.parseFiberLabelText === 'function',
    'miniprogram/services/recognize.js 契约完整（三个函数都在）');

  if (rec) {
    checkLabelParsing(rec);
    checkFabricHints(rec);
  }
}

// ---------------------------------------------------------------- 5. 水洗标成分解析

/**
 * 守"拍水洗标 → 解析成分"这条链路最容易静默出错的地方。
 * 重点是单字纤维名：正则写成 {2,} 会把「棉」整个漏掉，而棉恰恰是最常见的那种。
 */
function checkLabelParsing(rec) {
  group('5. 水洗标成分解析');

  const two = rec.parseFiberLabelText('面料：羊毛80% 涤纶20%\n里料：聚酯纤维100%');
  check(two.ok && two.parts.length === 2,
    '标准两行写法解析出两个部位',
    'parts=' + two.parts.length);
  check(two.parts[0] && two.parts[0].fibers.length === 2
    && two.parts[0].fibers[0].fiber === 'wool' && two.parts[0].fibers[0].pct === 80,
    '面料解析为 羊毛80% + 涤纶20%',
    JSON.stringify(two.parts[0] && two.parts[0].fibers));
  const lining = two.parts.filter(function (p) { return p.part === 'lining'; })[0];
  check(!!lining && lining.fibers[0].fiber === 'polyester',
    '里料归到 lining 部位，没有和面料混在一起');

  const single = rec.parseFiberLabelText('面料：棉100%');
  check(single.ok && single.parts[0].fibers[0].fiber === 'cotton'
    && single.parts[0].fibers[0].pct === 100,
    '单字纤维名「棉」能解析（正则写 {2,} 会把它整个漏掉）',
    JSON.stringify(single.parts[0] && single.parts[0].fibers));

  const marketing = rec.parseFiberLabelText('面料：云朵棉100%');
  check(!marketing.ok && marketing.rejected.indexOf('云朵棉') >= 0,
    '营销词「云朵棉」被拒绝，不会被当成棉',
    'ok=' + marketing.ok + ' rejected=' + JSON.stringify(marketing.rejected));

  const down = rec.parseFiberLabelText('填充：白鹅绒（含绒量95%）');
  const downFiber = down.parts.length ? down.parts[0].fibers[0] : null;
  check(!!downFiber && downFiber.fiber === 'down' && downFiber.tier === 'white_goose_95',
    '羽绒解析到「白鹅绒 95%」→ white_goose_95 档（百分比是含绒量，不是成分占比）',
    JSON.stringify(downFiber));

  const partial = rec.parseFiberLabelText('面料：棉70%');
  check(partial.ok && partial.parts[0].balanced === false && partial.parts[0].pctSum === 70,
    '成分合计 70% 时如实标出，不做静默补齐',
    'pctSum=' + (partial.parts[0] && partial.parts[0].pctSum));

  const garbage = rec.parseFiberLabelText('这件是纯棉的挺厚实');
  check(!garbage.ok && garbage.warnings.length > 0,
    '非国标写法明确失败并给填写示例，不瞎猜');
}

// ---------------------------------------------------------------- 6. 识别与价格表不脱节

/**
 * 守一个已经真实发生过、而且没人发现的根因：
 * 识别规则给出的东西必须**在价格表里落得下来**。
 *
 * 老实现里 FABRIC_RULES 产出 16 个面料档 key，10 个在 FABRICS 里不存在，
 * 而落空的恰好全是商品名中最常见的词（牛仔、棉、涤纶、卫衣…）——
 * 等于识别命中反而等于没识别。加个界面提示只是治症状，这里是治因：
 *   ① 静态：线索表里的 fabricKey / fiber 必须都能在配置层找到（或有登记）
 *   ② 动态：真实商品名跑一遍，产出的 key 全部可解析
 *   ③ 反向：推不出成分时必须给理由，不许静默返回空
 */
function checkFabricHints(rec) {
  group('6. 识别与价格表不脱节');

  const cfg = require(path.join(MP, 'config', 'index.js'));
  const pending = require(path.join(MP, 'config', 'fabric.js')).PENDING_FIBERS || {};

  const hints = rec.FABRIC_HINTS;
  check(Array.isArray(hints) && hints.length > 0,
    '识别层导出面料线索表（静态校验的前提）');
  if (!Array.isArray(hints)) return;

  // ① 静态
  const pricedFibers = cfg.listFibers().map(function (f) { return f.key; });
  const ghostFabrics = [];
  const ghostFibers = [];
  hints.forEach(function (h) {
    if (h.fabricKey && !cfg.getFabric(h.fabricKey)) ghostFabrics.push(h.fabricKey);
    (h.fibers || []).forEach(function (f) {
      if (pricedFibers.indexOf(f.fiber) < 0 && !pending[f.fiber]) ghostFibers.push(f.fiber);
    });
  });

  check(ghostFabrics.length === 0,
    '线索表里的面料档全部真实存在于 FABRICS（没有查不到价的幽灵 key）',
    '查不到：' + ghostFabrics.join('、'));
  check(ghostFibers.length === 0,
    '线索表里的纤维要么有价、要么已在 PENDING_FIBERS 登记"暂无权威出处"',
    '既无价也没登记：' + ghostFibers.join('、'));

  // ② 动态：真实商品名
  const cases = [
    { text: '牛仔外套', want: 'cotton' },
    { text: '摇粒绒卫衣', want: 'polyester' },
    { text: '纯棉T恤', want: 'cotton' },
    { text: '雪纺衬衫', want: 'polyester' },
    { text: '帆布外套', want: 'cotton' },
    { text: '真丝连衣裙', want: 'silk' },
    { text: '羊绒大衣', want: 'cashmere' },
    { text: '羽绒服', want: 'down' }
  ];
  const bad = [];
  const ghostKeys = [];
  cases.forEach(function (c) {
    const r = rec.recognizeByText(c.text);
    const got = r.fiberHints.map(function (h) { return h.fiber; });
    if (got.indexOf(c.want) < 0) bad.push(c.text + ' → 期望 ' + c.want + '，实得 ' + (got.join(',') || '(空)'));
    if (r.fabricKey && !cfg.getFabric(r.fabricKey)) ghostKeys.push(c.text + ' → ' + r.fabricKey);
  });
  check(bad.length === 0,
    '常见商品名都能落到有价的纤维上（牛仔≈棉、摇粒绒≈涤纶、雪纺≈涤纶…）',
    bad.join(' | '));
  check(ghostKeys.length === 0,
    '识别返回的 fabricKey 一定是价格表里存在的档（否则界面会静默落空）',
    ghostKeys.join(' | '));

  // ③ 反向：不猜也得说话
  const silent = ['针织衫', '加厚卫衣', '棉涤混纺夹克'].filter(function (t) {
    const r = rec.recognizeByText(t);
    return r.fiberHints.length === 0 && !r.hintNote;
  });
  check(silent.length === 0,
    '推不出成分的词必须给出理由（针织是织法、混纺没给比例…），不许静默返回空',
    silent.join('、'));

  // 羽绒的档位不确定要如实点出来 —— 70% 与 95% 差 167%
  check(/含绒量/.test(rec.recognizeByText('羽绒服').hintNote),
    '羽绒只识别到纤维、判不出含绒量时，如实提示档位价差',
    rec.recognizeByText('羽绒服').hintNote);

  // 识别结果必须能算价：把推测出的成分直接交给配置层，不能降级
  const priced = cfg.estimateMaterialCost({
    category: 'apparel_knit',
    materials: [{
      part: 'shell', amount: 200, unit: '克',
      fibers: rec.recognizeByText('牛仔外套').fiberHints.map(function (h) {
        return { fiber: h.fiber, tier: cfg.getDefaultTierKey(h.fiber), pct: h.pct };
      })
    }]
  });
  check(priced.materialCost > 0 && priced.degraded !== true,
    '识别推测出的成分能直接算出材料成本（端到端不留断头路）',
    'materialCost=' + priced.materialCost + ' degraded=' + priced.degraded);

  // ④ 不做的品类（鞋 / 包）：同步进小程序的那份也必须"如实告知且不漏线索"。
  // 直接读产物，防止"改了真源忘了 sync:mp"让小程序还是老行为。
  const blocked = rec.recognizeByText('真皮运动鞋');
  check(!!blocked.unsupportedNote,
    '小程序里的识别层同样会为鞋 / 包给出"暂不支持"的说明',
    JSON.stringify(blocked));
  check(blocked.fiberHints.length === 0 && !blocked.category,
    '小程序里的识别层不会为鞋 / 包漏出成分线索（否则会顺着衣物表单算出像样的错数）',
    JSON.stringify({ fibers: blocked.fiberHints, category: blocked.category }));
}

// ---------------------------------------------------------------- 7. 可点热区

/**
 * 可点元素的热区下限。
 *
 * 这一类缺陷**没有任何报错**：样式写对了、事件绑定也对、逻辑跑起来完全正常，
 * 但元素只有十几像素高（一行 font-size: 11px 的文字 + 零 padding），
 * 开发者工具把 375px 宽的模拟器缩放显示后，它在屏幕上只有十来个像素 —— 就是点不中。
 * 表现成"有些东西点不了"，而静态检查完全看不出来。
 *
 * 所以这里按 WXSS 声明估算每个可点元素的盒子高度，卡一个下限。
 * 估算规则（保守）：h = max(height/min-height, 行高 + 上下 padding 各一份)
 */
const MIN_TAP_HEIGHT = 40;

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function cssVarMap() {
  const theme = stripCssComments(fs.readFileSync(path.join(MP, 'styles', 'theme.wxss'), 'utf8'));
  const map = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(theme))) map[m[1]] = m[2].trim();
  return map;
}

function resolvePx(value, vars) {
  if (value === undefined || value === null) return null;
  let v = String(value).trim();
  const varRef = v.match(/^var\((--[a-z0-9-]+)(?:\s*,\s*([^)]+))?\)$/);
  if (varRef) v = String(vars[varRef[1]] !== undefined ? vars[varRef[1]] : (varRef[2] || '')).trim();
  let px = v.match(/^(-?[\d.]+)px$/);
  if (px) return parseFloat(px[1]);
  px = v.match(/^(-?[\d.]+)rpx$/);
  if (px) return parseFloat(px[1]) / 2; // 750rpx 对应 375px
  return null;
}

function cssDeclMap() {
  const out = {};
  const files = [path.join(MP, 'app.wxss')]
    .concat(listFiles(path.join(MP, 'pages'), '.wxss'))
    .concat(listFiles(path.join(MP, 'components'), '.wxss'));
  files.forEach(function (f) {
    const css = stripCssComments(fs.readFileSync(f, 'utf8'));
    css.split('}').forEach(function (chunk) {
      const brace = chunk.indexOf('{');
      if (brace < 0) return;
      const selector = chunk.slice(0, brace).split('\n').pop().trim();
      const decls = {};
      chunk.slice(brace + 1).split(';').forEach(function (d) {
        const i = d.indexOf(':');
        if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
      });
      selector.split(',').forEach(function (sel) {
        const hit = sel.trim().match(/^\.([a-zA-Z0-9_-]+)/);
        if (hit) out[hit[1]] = Object.assign(out[hit[1]] || {}, decls);
      });
    });
  });
  return out;
}

function estimateBoxHeight(decls, vars) {
  let explicit = 0;
  ['height', 'min-height'].forEach(function (k) {
    const v = resolvePx(decls[k], vars);
    if (v !== null && v > explicit) explicit = v;
  });

  let pad = 0;
  const padTop = resolvePx(decls['padding-top'], vars);
  if (padTop !== null) pad = Math.abs(padTop);
  else if (decls.padding !== undefined) {
    const first = resolvePx(String(decls.padding).trim().split(/\s+/)[0], vars);
    if (first !== null) pad = Math.abs(first);
  }

  let content;
  const lhPx = resolvePx(decls['line-height'], vars);
  if (lhPx !== null) content = lhPx;
  else {
    const fs = resolvePx(decls['font-size'], vars);
    let lh = parseFloat(decls['line-height']);
    if (isNaN(lh)) lh = 1.5;
    content = (fs === null ? 15 : fs) * lh; // 15px 是 app.wxss 里 page 的默认字号
  }

  return Math.max(explicit, content + pad * 2);
}

/** 挂了 bindtap / catchtap 的元素，取它的第一个静态类名 */
function tappableClasses() {
  const files = listFiles(path.join(MP, 'pages'), '.wxml')
    .concat(listFiles(path.join(MP, 'components'), '.wxml'));
  const out = {};
  files.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8')
      .replace(/\{\{[\s\S]*?\}\}/g, 'X') // 先把绑定表达式换成占位，避免里面的 > 截断标签
      .replace(/\s+/g, ' ');
    (src.match(/<[a-z][a-z0-9-]*\b[^>]*>/g) || []).forEach(function (tag) {
      if (!/\bbindtap=|\bcatchtap=/.test(tag)) return;
      const cm = tag.match(/class="([^"]*)"/);
      if (!cm) return;
      const first = cm[1].trim().split(/\s+/)[0];
      if (first && first.indexOf('X') < 0) out[first] = rel(f);
    });
  });
  return out;
}

function checkTapTargets() {
  group('7. 可点热区');

  const vars = cssVarMap();
  const rules = cssDeclMap();
  const targets = tappableClasses();
  const names = Object.keys(targets);

  // 先确认扫描器真的扫到了东西 —— 匹配不到任何元素就"全过"是假绿灯
  check(names.length >= 10,
    '扫描器扫到全部可点元素（' + names.length + ' 个：' + names.join('、') + '）',
    '只扫到 ' + names.length + ' 个，扫描逻辑可能失效');

  ['fiber-add', 'fiber-row__del', 'alt', 'fold__edit', 'camera', 'btn'].forEach(function (key) {
    check(names.indexOf(key) >= 0, '可点元素 .' + key + ' 在扫描范围内');
  });

  const noRule = names.filter(function (n) { return !rules[n]; });
  check(noRule.length === 0, '每个可点元素都有样式规则', noRule.join('、'));

  const tooSmall = names.filter(function (n) {
    return rules[n] && estimateBoxHeight(rules[n], vars) < MIN_TAP_HEIGHT;
  }).map(function (n) {
    return '.' + n + '≈' + Math.round(estimateBoxHeight(rules[n], vars)) + 'px';
  });
  check(tooSmall.length === 0,
    '可点元素估算高度都 ≥ ' + MIN_TAP_HEIGHT + 'px（点不中会表现成"点了没反应"）',
    tooSmall.join('、'));
}

// ---------------------------------------------------------------- 8. 页面交互冒烟

/**
 * 把页面的事件处理函数真跑一遍。
 *
 * 第 7 组管"热区太小点不中"，这一组管另一半：**点了但函数抛异常**。
 * 两者在界面上表现完全一样（点了没反应），静态检查也都看不出来。
 * 逻辑在 scripts/smoke-page.js，这里进程内调用（不 spawn，Windows 下会 EBUSY）。
 */
function checkPageSmoke() {
  group('8. 页面交互冒烟');
  const smoke = require(path.join(__dirname, 'smoke-page.js'));
  smoke.run().checks.forEach(function (c) {
    check(c.ok, c.label, c.detail);
  });
}

// ---------------------------------------------------------------- 9. 占比口径单一真源

/**
 * "成分够不够 100%"这件事有三个地方要判：配置层定价、界面实时提示、提交拦截。
 * 容差数字必须**只有一份**（config.PCT_TOLERANCE）—— 各处写死的话，改了一处
 * 另两处不知道，就会出现"界面说合格、配置层判不合格"这种幽灵问题：
 * 用户看到的是"明明填对了却算不出钱"。所以这里守的是"口径来源唯一"。
 */
function checkPctSingleSource() {
  group('9. 成分占比口径单一真源');

  const cfg = require(path.join(MP, 'config', 'index.js'));
  check(typeof cfg.PCT_TOLERANCE === 'number' && cfg.PCT_TOLERANCE > 0,
    '配置层导出成分合计容差（界面从它取，不写死数字）',
    '实际 ' + cfg.PCT_TOLERANCE);
  check(!!(cfg.OTHER_FIBER && cfg.OTHER_FIBER.key && cfg.OTHER_FIBER.label),
    '配置层导出「其他纤维」占位，供界面渲染成可选项');

  const pageSrc = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.js'), 'utf8');
  check(/config\.PCT_TOLERANCE/.test(pageSrc),
    '界面用的容差取自 config.PCT_TOLERANCE（没有另写一个 ±1）');
  check(/成分占比必须合计 100%/.test(pageSrc),
    '提交拦截有明确文案，用户知道该改什么');

  const wxml = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.wxml'), 'utf8');
  check(/fiber-sum/.test(wxml) && /pctNote/.test(wxml),
    '每条用料都渲染成分合计（用户边填边看得见）');
  check(/pctWarnings/.test(wxml),
    '结果区渲染"有成分没价 → 单价偏低"的警示，不静默');
}

// ---------------------------------------------------------------- 10. 事件绑定名

/**
 * wxml 里绑的每个处理函数，必须在同目录同名 js 里真实存在。
 *
 * 这是"点了没反应"的第三种成因（前两种是热区太小、函数抛异常）：
 * 绑定名写错、或方法被删掉而 wxml 没跟着改，**静态看一切正常、点下去毫无反应**。
 * 本轮把「第 N 种用料 + 添加一种用料」改造成部位 tab 时正好有这个风险
 * （按钮删了方法还在、或反过来），所以这条得由脚本守。
 */
function checkEventHandlers() {
  group('10. 事件绑定名');

  const wxmls = listFiles(path.join(MP, 'pages'), '.wxml');
  const missing = [];
  let scanned = 0;

  wxmls.forEach(function (wxmlPath) {
    const jsPath = wxmlPath.replace(/\.wxml$/, '.js');
    if (!exists(jsPath)) return;
    const js = fs.readFileSync(jsPath, 'utf8');
    const src = fs.readFileSync(wxmlPath, 'utf8')
      .replace(/\{\{[\s\S]*?\}\}/g, 'X') // 绑在表达式里的不算静态绑定
      .replace(/\s+/g, ' ');

    (src.match(/<[a-z][a-z0-9-]*\b[^>]*>/g) || []).forEach(function (tag) {
      // 覆盖 bindtap / catchtouchstart / bind:change 三种写法
      const re = /\b(?:bind|catch)[:a-z]*\s*=\s*"([^"{}\s]+)"/g;
      let m;
      while ((m = re.exec(tag)) !== null) {
        const fn = m[1];
        if (fn.indexOf('X') >= 0) continue;
        scanned += 1;
        // 页面 js 里是对象字面量写法：`onFoo: function () {}`
        if (!new RegExp('(^|[^\\w.])' + fn + '\\s*:').test(js)) {
          missing.push(rel(wxmlPath) + ' → ' + fn + '()');
        }
      }
    });
  });

  // 扫不到任何绑定就是扫描器失效，不能算通过
  check(scanned >= 10, '扫到 wxml 里的事件绑定（' + scanned + ' 处）',
    '只扫到 ' + scanned + ' 处，扫描逻辑可能失效');
  check(missing.length === 0,
    '每个绑定的处理函数都能在同名 js 里找到',
    missing.join('、'));
}

// ---------------------------------------------------------------- 11. 用料价格可溯源

/**
 * 这个项目最硬的一条口径是「材料价必须说得出来源」。
 *
 * 但数据齐全 ≠ 用户看得见：纤维的价格与出处一直躺在 options 的 `sub` 字段里，
 * 而 picker 只渲染 `label` —— 那个 sub 从头到尾没有任何模板引用过。
 * 数据层全绿、界面上却一处都查不到价格来源。所以这里两层都守：
 *   数据层：有价就必须带 source + period（谁发布的、哪一期）
 *   界面层：这两项必须真的被渲染出来
 */
function checkPriceTraceability() {
  group('11. 用料价格可溯源');

  const cfg = require(path.join(MP, 'config', 'index.js'));

  const noSource = [];
  let priced = 0;
  cfg.listFibers().forEach(function (f) {
    f.tiers.forEach(function (t) {
      if (t.unitPrice === null) return;
      priced += 1;
      if (!t.source || !t.period) noSource.push(f.label + ' / ' + t.label);
    });
  });
  check(priced > 0, '纤维价格表里存在有价档（' + priced + ' 条）',
    '一条有价的都没扫到，探测逻辑可能已经失效');
  check(noSource.length === 0, '每条有价纤维档都带出处与数据期', noSource.join('、'));

  const noSourceFabric = cfg.listFabrics().filter(function (f) {
    return !f.source || !f.period;
  }).map(function (f) { return f.label; });
  check(noSourceFabric.length === 0, '每条面料都带出处与数据期', noSourceFabric.join('、'));

  const wxml = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.wxml'), 'utf8');
  check(/fiber-line__meta/.test(wxml) && /fb\.priceText/.test(wxml) && /fb\.srcText/.test(wxml),
    '成分行把单价与出处渲染了出来（只塞进 picker 选项里等于没写）');
  check(/item\.fabricSrcText/.test(wxml) && /item\.fabricPriceText/.test(wxml),
    '按面料名的模式同样渲染了价格与出处');
}

// ---------------------------------------------------------------- 12. 品牌识别

/**
 * 商品名里读到的品牌信息，必须真的走进估价 —— 而且要读对。
 *
 * 两件事都不能错：
 *   ① 读错：别名拿去子串匹配会串味。aliases 里有 "HLA"，而 "ralphlauren" 恰好
 *      含 "hla"（ra-lp**hla**-uren）—— "Ralph Lauren 衬衫"会被认成海澜之家。
 *      这是项目踩过的坑，所以只匹配品牌正名。
 *   ② 读了不用：品牌档位决定设计费率（奢侈 60% / 普通 12%，差 5 倍）。
 *      界面把 brandTier 丢掉的话，一条奢侈品牌的估价会按普通品牌算出来。
 */
function checkBrandRecognition() {
  group('12. 品牌识别落到估价');

  const cfg = require(path.join(MP, 'config', 'index.js'));

  const hit = cfg.findBrandMention('爱马仕羊绒大衣');
  check(!!hit && hit.key === 'hermes', '商品名里出现品牌正名，能认出来',
    hit ? '实际 ' + hit.key : '实际 null');

  const rl = cfg.findBrandMention('Ralph Lauren 衬衫');
  check(!!rl && rl.key === 'ralphlauren', '英文品牌按正名匹配到正确的品牌',
    rl ? '实际 ' + rl.key : '实际 null');

  const hla = cfg.findBrandMention('HLA 2019 款外套');
  check(!hla, '短别名不参与匹配（"HLA" 不许把不相干的词认成海澜之家）',
    hla ? '实际 ' + hla.key : '');

  const none = cfg.findBrandMention('全棉纱卡工装外套');
  check(!none, '没提到品牌就不许猜一个出来', none ? '实际 ' + none.key : '');

  const luxury = cfg.resolveCoefficients({ category: 'apparel_knit', brandTier: 'luxury' });
  const common = cfg.resolveCoefficients({ category: 'apparel_knit', brandTier: 'common' });
  check(luxury.designRate === 0.6, '没指定品牌时，显式传入的档位会真的生效',
    '实际 designRate ' + luxury.designRate);
  check(luxury.designRate > common.designRate * 2,
    '档位差别是量级级的（奢侈 ' + luxury.designRate + ' / 普通 ' + common.designRate + '）—— 丢了它就低估');

  const pageSrc = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.js'), 'utf8');
  check(/brandTier:\s*this\.data\.brandTierGuess/.test(pageSrc),
    '提交估价时把识别到的品牌档位一起传下去');
  check(/brandTierGuess/.test(pageSrc) && /tierNotice/.test(pageSrc),
    '用档位估算时界面如实说明，不让人以为是按品牌年报算的');

  const wxml = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.wxml'), 'utf8');
  check(/tierNotice/.test(wxml), '这句说明真的渲染出来了，不是算完就丢');

  // 换品类要刷各部位克数：手动点 / 识别出品类，两条路径必须共用一份实现。
  // 各写一遍必然漂移 —— 识别那条就曾经忘了刷，克数还停在上一个品类。
  // 现在两处都走 planCategoryChange（克数 + 选项重排 + 下标搬迁，三件事一起做）。
  check(/function syncTypicalWeights/.test(pageSrc), '换品类刷克数收在一个函数里');
  check(/function planCategoryChange/.test(pageSrc), '换品类的完整计划收在一个函数里');
  check(/planCategoryChange\(\s*guessed\.category/.test(pageSrc),
    '识别出品类时也走同一个计划（不许自己写一份）');
  check(/planCategoryChange\(\s*e\.detail\.value/.test(pageSrc),
    '手动切品类走同一个计划');
}

// ---------------------------------------------------------------- 13. 整件重量 · 按品类分列

function checkTotalWeightAndCategory() {
  group('13. 整件重量换算 · 按品类分列');

  const cfg = require(path.join(MP, 'config', 'index.js'));
  const pageSrc = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(MP, 'pages', 'index', 'index.wxml'), 'utf8');

  // —— 整件衣服重量：用户称得出整件，称不出"这件衣服的面料单独多少克" ——
  check(typeof cfg.distributeByTotalWeight === 'function'
    && typeof cfg.resolvePartWeight === 'function',
    '配置层提供「整件重量 → 各部位用料」的换算入口');

  const d = cfg.distributeByTotalWeight('apparel_down', 650);
  check(!!d && !!d.weights, '填了整件重量就该算得出各部位');

  const typFilling = cfg.resolveTypicalWeight('apparel_down', 'filling').g;
  check(d && d.weights.filling === Math.round(typFilling * d.scale * 10) / 10,
    '各部位按**同一比例**缩放，不是只动面料、里料填充不动',
    d ? ('填充 ' + d.weights.filling + '（典型 ' + typFilling + ' × ' + d.scale + '）') : '');

  const a = cfg.distributeByTotalWeight('apparel_outerwear', 300);
  const b = cfg.distributeByTotalWeight('apparel_outerwear', 600);
  check(a && b && Math.abs(b.weights.shell - a.weights.shell * 2) < 0.15,
    '总重翻倍 → 各部位克数也翻倍（等比，不是"差不多"）',
    a && b ? (a.weights.shell + ' → ' + b.weights.shell) : '');

  check(cfg.distributeByTotalWeight('apparel_down', 0) === null
    && cfg.distributeByTotalWeight('apparel_down', '') === null,
    '不填整件重量 → 不产生换算，回落本类常见值（与加这一项之前行为一致）');

  check(!!d && d.note.indexOf(String(d.base)) >= 0,
    '换算说明里带上基准克数（否则界面只能甩一个光秃秃的数字）');

  const fallback = cfg.resolvePartWeight('apparel_outerwear', 'shell', 0);
  check(fallback.fromTotal === false, '没填重量时如实标出"这是常见值、不是你的数"',
    'fromTotal=' + fallback.fromTotal);
  const fed = cfg.resolvePartWeight('apparel_outerwear', 'shell', 480);
  check(fed.fromTotal === true && fed.source.indexOf('480') >= 0,
    '填了重量时说的出来源（哪个数换算的）', fed.source);

  // autoMaterialInputs 必须把整件重量吃进去，否则里料/填充还按固定值走，与面料对不上
  const auto = cfg.autoMaterialInputs('apparel_down', {}, 650);
  const autoFed = auto.filter(function (x) { return x.weightFromTotal === true; });
  check(autoFed.length === auto.length && auto.length > 0,
    '系统补齐的里料 / 填充也走整件重量（否则面料跟着变、里料还钉着老值）',
    autoFed.length + '/' + auto.length);

  // —— 按品类分列 ——
  const fabrics = cfg.listFabrics();
  const brands = cfg.listBrands();

  const noCatF = fabrics.filter(function (f) { return !Array.isArray(f.categories); });
  check(noCatF.length === 0, '每条面料都登记了适用品类（漏登记的会被当全品类，等于白分）',
    noCatF.map(function (f) { return f.label; }).join('、'));

  const noFocusB = brands.filter(function (b) { return !b.focus; });
  check(noFocusB.length === 0, '每家品牌都写了业务构成 —— "有些牌子只做别的"要能看出来',
    noFocusB.map(function (b) { return b.label; }).join('、'));

  let lostTotal = 0;
  cfg.listCategories().forEach(function (c) {
    const gf = cfg.groupByCategory(fabrics, c.key);
    const gb = cfg.groupByCategory(brands, c.key);
    lostTotal += (fabrics.length - gf.primary.length - gf.others.length)
      + (brands.length - gb.primary.length - gb.others.length);
  });
  check(lostTotal === 0, '八个品类分组后，面料与品牌**一个选项都不丢**（丢了就是静默少给选项）',
    '共丢 ' + lostTotal + ' 项');

  const down = cfg.groupByCategory(brands, 'apparel_down');
  check(down.primary.some(function (x) { return x.key === 'bosideng'; }),
    '羽绒服一类里，波司登排在「适合本类」那一组');
  check(!down.primary.some(function (x) { return x.key === 'nike'; }),
    '同一类里耐克不混进「适合本类」（它主营运动，不是羽绒服）');

  // —— 换品类不许悄悄换掉用户选的东西 ——
  check(/function indexOfKey/.test(pageSrc)
    && !/BRAND_OPTIONS\[this\.data\.brandIndex\]/.test(pageSrc),
    '品牌 / 面料的选中项按 key 搬，不跨列表沿用下标（沿用 = 悄悄换成别人家）');
  check(/selectBrandByKey:\s*function/.test(pageSrc)
    && /scopeOnly = false;/.test(pageSrc),
    '识别到的品牌不在默认范围里时，会展开全部再找（不许当成没识别到）');
  check(/scopeOnly/.test(pageSrc) && /onToggleBrandScope/.test(pageSrc),
    '提供「只看本类 / 显示全部」切换而不是硬过滤（硬过滤会让用户找不到自己的牌子）');

  const planFn = (pageSrc.match(/function planCategoryChange[\s\S]*?\n\}/) || [''])[0];
  check(planFn.length > 0 && planFn.indexOf('totalWeightText') < 0,
    '换品类不覆盖用户填的整件重量（衣服还是那件，重量不会因为换品类就变）');

  // —— 界面上真的看得见 ——
  check(/bindinput="onTotalWeightInput"/.test(wxml), '整件重量是界面上的输入项');
  check(/totalWeightNote/.test(wxml),
    '换算依据真的渲染出来（算完就丢 = 用户不知道那个克数从哪来）');
  check(/bindtap="onToggleBrandScope"/.test(wxml) && /bindtap="onToggleFabricScope"/.test(wxml),
    '两处「显示全部」的入口都渲染了');
  check(/group-head/.test(wxml) && /group-head/.test(fs.readFileSync(
    path.join(MP, 'pages', 'index', 'index.wxss'), 'utf8')),
    '按数据类型分组的版面真的落地了（不是只在文档里说）');
}

// ---------------------------------------------------------------- 跑

console.log('小程序侧校验（' + rel(MP) + '）');

const pages = checkProject();
checkComponents(pages);
checkStyles();
checkSyncAndParity();
checkTapTargets();
checkPageSmoke();
checkPctSingleSource();
checkEventHandlers();
checkPriceTraceability();
checkBrandRecognition();
checkTotalWeightAndCategory();

console.log('\n' + (failed === 0
  ? '全部通过（' + passed + ' 项）'
  : failed + ' 项未通过（通过 ' + passed + ' 项）'));

process.exit(failed === 0 ? 0 : 1);
