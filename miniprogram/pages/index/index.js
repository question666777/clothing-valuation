const config = require('../../config/index.js');
const recognize = require('../../services/recognize.js');

const CATEGORIES = config.listCategories();
const PARTS = config.listMaterialParts();
const PART_KEYS = PARTS.map(function (p) { return p.key; });
const FABRICS = config.listFabrics();
const FIBERS = config.listFibers();
const BRANDS = config.listBrands();

const GRADE_LABEL = {
  official: '政府公布报价',
  semi: '纺织指数报价',
  estimate: '行业估算',
  missing: '未取得价格'
};

const GRADE_CLASS = {
  official: 'tag--official',
  semi: 'tag--semi',
  estimate: 'tag--estimate',
  missing: 'tag--flat'
};

// 把「纤维 × 规格档」拉平成一维 —— picker 只认一维数组。
// 同一纤维的不同规格档价差可达 167%（70% 灰鸭绒 vs 95% 白鹅绒），
// 所以选项必须精确到档，不能只给"羽绒/棉"这种粗粒度。
const FIBER_OPTIONS = [];
FIBERS.forEach(function (f) {
  f.tiers.forEach(function (t) {
    FIBER_OPTIONS.push({
      fiber: f.key,
      tier: t.key,
      label: f.label + ' · ' + t.label,
      sub: (t.unitPrice === null ? '暂无可靠报价' : '¥' + t.unitPrice + ' / ' + f.unit)
        + ' · ' + (GRADE_LABEL[t.grade] || '来源未知'),
      // 单价与出处**单独存一份**：picker 只渲染 label，这两项要另外渲染在输入行下方。
      // 之前它们只塞在 sub 里，而 sub 从头到尾没被任何模板用过 ——
      // 等于用户在界面上**查不到价格是从哪来的**，而那是这个项目最硬的一条口径。
      priceText: t.unitPrice === null ? '暂无权威报价' : ('¥' + t.unitPrice + ' / ' + f.unit),
      srcText: [t.source, t.period].filter(Boolean).join(' · ')
    });
  });
});

// 面料全量 —— 与品类无关的那份底表。真正喂给 picker 的是 composeFabricOptions()，
// 它按当前品类把「适合本类」的排前面（全棉府绸是衬衣料，把它摆在要做羽绒服的人面前
// 只会让他多犹豫），其余的收在后面并标上「其他品类」—— **一个都不删**。
const FABRIC_ALL = FABRICS.map(function (f) {
  return {
    key: f.key,
    label: f.label,
    categories: f.categories,
    focus: f.focus || '',
    priceText: '¥' + f.unitPrice + ' / ' + f.unit,
    srcText: [f.source, f.period].filter(Boolean).join(' · ')
  };
});

function composeFabricOptions(categoryKey, scopeOnly) {
  const g = config.groupByCategory(FABRIC_ALL, categoryKey);
  const list = scopeOnly ? g.primary : g.primary.concat(g.others);
  const primaryCount = g.primary.length;
  return list.map(function (f, i) {
    const isOther = !scopeOnly && i >= primaryCount;
    return {
      key: f.key,
      label: (isOther ? '〔其他品类〕' : '') + f.label + '　' + f.priceText,
      priceText: f.priceText,
      srcText: f.srcText
    };
  });
}

/** 主营业务简称 —— 完整说明放在品牌卡片里，picker 一行放不下 */
function shortFocus(focus) {
  return String(focus || '').split(/[（(,，]/)[0].trim();
}

/**
 * 品牌选项 —— 同一套分组口径（见 config.groupByCategory）。
 *
 * 默认 scopeOnly：只看主营本类的品牌。找不到再展开全部 ——
 * 品牌跨品类卖货是常态（波司登也出过 T 恤），硬过滤会让用户以为我们库里没有他的牌子。
 */
function composeBrandOptions(categoryKey, scopeOnly) {
  const g = config.groupByCategory(BRANDS, categoryKey);
  const list = scopeOnly ? g.primary : g.primary.concat(g.others);
  const primaryCount = g.primary.length;
  const opts = [{ key: null, label: '不指定品牌（按档位估算）' }];
  list.forEach(function (b, i) {
    const isOther = !scopeOnly && i >= primaryCount;
    opts.push({
      key: b.key,
      label: (isOther ? '〔其他品类〕' : '') + b.label
        + (b.focus ? ' · ' + shortFocus(b.focus) : '')
        + (typeof b.grossMargin === 'number'
          ? ' · 毛利 ' + (b.grossMargin * 100).toFixed(1) + '%'
          : ' · 无年报数据')
    });
  });
  return opts;
}

/**
 * 按 key 找下标；找不到返回 -1。
 *
 * **不许回落成 0**：列表重排后，同一个下标指向的已经不是同一家品牌、同一块面料了。
 * 沿用旧下标或落到 0，就是"用户明明选的波司登，切个品类悄悄变成安踏"，界面还不吭声。
 */
function indexOfKey(options, key) {
  const list = Array.isArray(options) ? options : [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].key === key) return i;
  }
  return -1;
}

/**
 * 换品类的**完整计划** —— 一次要动三样：
 *   ① 各部位克数按新品类重算  ② 面料 / 品牌列表重排  ③ 两处选中下标按 key 搬过去
 *
 * 三样分开写在三条路径上必然漂移（这个项目已经踩过一次：识别路径忘了刷克数，
 * 界面看着正常、数字对不上）。所以合成一个纯函数，手动点品类和识别出品类共用它。
 * 纯函数还有个好处：冒烟脚本能直接调，不必起页面。
 *
 * ctx 需要：lines / fabricOptions / fabricScopeOnly / brandOptions / brandScopeOnly /
 *          brandIndex / totalWeight
 */
function planCategoryChange(category, ctx) {
  const c = ctx || {};
  const oldFabricOptions = c.fabricOptions || [];
  const oldBrandOptions = c.brandOptions || [];
  const notes = [];

  let fabricScopeOnly = c.fabricScopeOnly !== false;
  let fabricOptions = composeFabricOptions(category, fabricScopeOnly);

  const lines = syncTypicalWeights(c.lines || [], category, c.totalWeight || 0).map(function (line) {
    const key = (oldFabricOptions[line.fabricIndex] || {}).key;
    let idx = indexOfKey(fabricOptions, key);
    if (idx < 0) {
      // 这一行选的面料不属于新品类常见项 → 展开全部再找，**不许静默把它换掉**
      fabricScopeOnly = false;
      fabricOptions = composeFabricOptions(category, false);
      idx = indexOfKey(fabricOptions, key);
      if (idx >= 0) notes.push('你选的面料不在本类常见项里，已展开全部的面料');
    }
    if (idx < 0) idx = 0;
    return Object.assign({}, line, { fabricIndex: idx });
  });

  const oldBrandKey = (oldBrandOptions[c.brandIndex] || {}).key;
  let brandScopeOnly = c.brandScopeOnly !== false;
  let brandOptions = composeBrandOptions(category, brandScopeOnly);
  let brandIndex = indexOfKey(brandOptions, oldBrandKey);
  if (brandIndex < 0) {
    brandScopeOnly = false;
    brandOptions = composeBrandOptions(category, false);
    brandIndex = indexOfKey(brandOptions, oldBrandKey);
    if (brandIndex >= 0) notes.push('你选的品牌不在本类常见项里，已展开全部的品牌');
  }
  if (brandIndex < 0) brandIndex = 0;

  const brandOption = brandOptions[brandIndex] || brandOptions[0];
  return {
    category: category,
    lines: lines,
    fabricOptions: fabricOptions,
    fabricScopeOnly: fabricScopeOnly,
    brandOptions: brandOptions,
    brandScopeOnly: brandScopeOnly,
    brandIndex: brandIndex,
    // 品类一换品牌可能也换了（下标挪位）→ 系列必须归零，否则是拿着 A 的系列套 B，静默串味
    seriesOptions: seriesOptionsOf(brandOption ? brandOption.key : null),
    seriesIndex: 0,
    notes: notes
  };
}

// 品牌档位中文名。识别出档位后界面要如实说"按哪一档估算"，
// 不能让用户以为这个数是用他品牌的年报毛利率算的。
const TIER_LABEL = {};
config.listBrandTiers().forEach(function (t) { TIER_LABEL[t.key] = t.label; });

// 「其他纤维」不是一种纤维，是国标允许的一种**标注**（GB/T 29862：两种以上各 ≤5%
// 且合计 ≤15% 时可集中标为"其他纤维"）。必须给得出这个选项 ——
// 否则水洗标上写着"其他纤维 5%"时，用户为了把占比凑到 100% 只能瞎填一个纤维，
// 那是把整个估价建在假成分上，比缺这 5% 更坏。它没有价，如实记为"未计入定价"。
FIBER_OPTIONS.push({
  fiber: config.OTHER_FIBER.key,
  tier: null,
  label: config.OTHER_FIBER.label,
  sub: '国标允许的合法标注 · 查不到价，这部分占比不计入定价',
  // 无价也得说得出"查不到"。留空的话界面上就是**整行都不出现** ——
  // 用户看到的是"这条成分凭空消失了"，而不是"它没有价"，那是两回事
  priceText: '暂无权威报价',
  srcText: ''
});

function findOptionIndex(fiberKey, tierKey) {
  for (let i = 0; i < FIBER_OPTIONS.length; i += 1) {
    if (FIBER_OPTIONS[i].fiber === fiberKey && FIBER_OPTIONS[i].tier === tierKey) return i;
  }
  return 0;
}

function round2Of(value) {
  return Math.round((value || 0) * 100) / 100;
}

/**
 * 系列选项 —— 粒度必须是「品牌 × 系列」，不能只到品牌。
 * 波司登 2025/26 财年：主品牌 69.1% / 雪中飞 40.9%，同集团差 28.2 个百分点；
 * 只给品牌级一个数，等于把这条最重要的信息抹掉。
 */
function seriesOptionsOf(brandKey) {
  const opts = [{ key: null, label: '品牌整体（集团/品牌综合毛利率）' }];
  if (!brandKey) return opts;
  const b = config.getBrand(brandKey);
  (b.series || []).forEach(function (s) {
    opts.push({
      key: s.key,
      label: s.label + (typeof s.grossMargin === 'number'
        ? '　毛利率 ' + (s.grossMargin * 100).toFixed(1) + '%'
        : '　无公开毛利率')
    });
  });
  return opts;
}

function partUnit(partKey) {
  const hit = PARTS.filter(function (p) { return p.key === partKey; })[0];
  return hit ? hit.unit : '克';
}

function partLabel(partKey) {
  const hit = PARTS.filter(function (p) { return p.key === partKey; })[0];
  return hit ? hit.label : partKey;
}

/**
 * 新建一条用料。
 *
 * 默认走「纤维成分 × 克」而不是「面料 × 米」：
 * 纤维价官方就是元/千克，克 ÷ 1000 直接得千克，**中间没有任何假设值**；
 * 按米填则必须先假定克重与幅宽，那两个假设本身就是误差源。
 * 克数预填该品类 × 部位的常见区间中值（estimate），用户可以改。
 */
function newLine(partKey, categoryKey, totalWeight) {
  const key = partKey || 'shell';
  const unit = partUnit(key);
  const byWeight = unit === '克';
  const w = byWeight ? config.resolvePartWeight(categoryKey, key, totalWeight) : null;

  return {
    part: key,
    partLabel: partLabel(key),
    unit: unit,
    mode: 'fiber',
    fabricIndex: 0,
    // 用量默认**收起**：克数已经由整件重量或品类常见值算好，用户不改就是"我们替他填"，
    // 想看或要改再展开。默认摊开一堆输入框正是"看着难、不想填"的来源。
    showAmount: false,
    amountText: byWeight ? String(w.g) : '',
    // 用户动过克数就不再被整件重量 / 品类切换覆盖 —— 那个数是他自己的实测值
    weightTouched: false,
    // 这个克数是按「用户填的整件重量」换算来的，还是本类常见值 —— 界面要说得出来
    weightFromTotal: byWeight && w.fromTotal === true,
    // 成分同理：用户（或水洗标）定过的成分，不许再被"按商品名推测"覆盖
    fibersTouched: false,
    weightHint: byWeight && w.range ? ('常见 ' + w.range + ' 克') : '',
    weightSource: byWeight ? w.source : '',
    gsmText: '',
    widthText: '',
    fiberRows: [{ optIndex: findOptionIndex('cotton', 'grade_3128B'), pctText: '100' }]
  };
}

/**
 * 换品类（或改整件重量）时，把「系统算出来的」各部位克数刷一遍。
 *
 * 用户自己改过的（weightTouched）、以及按米计价的行都不动 —— 那是他的实测值，
 * 拿一个推算值把它盖掉等于丢掉唯一一个真实测量。
 *
 * **只此一份**：手动切品类、按商品名识别出品类、修改整件重量，都是同一类状态变化。
 * 三条路径各写一遍必然漂移 —— 识别那条就曾经忘了刷：用户输入「羽绒服」，
 * 品类换成了羽绒服、自动补了填充，面料克数却还是上一品类的，看着正常、实际对不上。
 */
function syncTypicalWeights(lines, categoryKey, totalWeight) {
  return lines.map(function (line) {
    if (line.weightTouched || line.unit !== '克') return line;
    const w = config.resolvePartWeight(categoryKey, line.part, totalWeight);
    return Object.assign({}, line, {
      amountText: String(w.g),
      weightHint: w.range ? ('常见 ' + w.range + ' 克') : '',
      weightSource: w.source,
      weightFromTotal: w.fromTotal === true
    });
  });
}

/**
 * 一条用料的成分占比合计 —— 界面侧实时算。
 *
 * 为什么要在界面重算一遍（配置层也会算）：用户需要**边填边看到**"合计 80%"，
 * 而配置层是提交后才跑。两处必须同一口径，所以容差直接取 config.PCT_TOLERANCE，
 * 不在这里写死数字 —— 写死就会出现"界面说合格、配置层判不合格"。
 */
function linePctStat(line) {
  const rows = line.fiberRows || [];
  let sum = 0;
  let blank = 0;
  rows.forEach(function (f) {
    const text = String(f.pctText === undefined || f.pctText === null ? '' : f.pctText).trim();
    if (text === '') { blank += 1; return; }
    const v = parseFloat(text);
    if (isFinite(v) && v > 0) sum += v;
  });
  sum = Math.round(sum * 10) / 10;
  const balanced = rows.length > 0 && blank === 0
    && Math.abs(sum - 100) <= config.PCT_TOLERANCE;
  return { sum: sum, balanced: balanced, blank: blank };
}

// 把内部结构摊平成 WXML 直接能渲染的形状（避免在模板里做逻辑）
function decorateLine(line, fabricOptions) {
  const opts = Array.isArray(fabricOptions) ? fabricOptions : [];
  const out = Object.assign({}, line);
  out.partLabel = partLabel(line.part);
  const fabricOption = opts[line.fabricIndex];
  out.fabricLabel = fabricOption ? fabricOption.label : '请选择面料';
  out.fabricPriceText = fabricOption ? fabricOption.priceText : '';
  out.fabricSrcText = fabricOption ? fabricOption.srcText : '';
  out.fiberRows = (line.fiberRows || []).map(function (f) {
    const o = FIBER_OPTIONS[f.optIndex] || {};
    return {
      optIndex: f.optIndex,
      pctText: f.pctText,
      label: o.label || '请选择纤维',
      sub: o.sub || '',
      // 这两项渲染在输入行下方。用户得看得见"这个纤维多少钱、谁发布的、哪一期"，
      // 否则他无从判断这个材料成本可不可信（出处＝机构 + 数据期，见 AGENTS.md 第 5 节）。
      priceText: o.priceText || '',
      srcText: o.srcText || ''
    };
  });
  // 成分合计：选面料模式没有占比，不显示
  const stat = line.mode === 'fiber' ? linePctStat(line) : null;
  out.pctSum = stat ? stat.sum : null;
  out.pctBalanced = stat ? stat.balanced : true;
  out.pctNote = !stat ? '' : (stat.balanced
    ? ('成分合计 ' + stat.sum + '%')
    : (stat.blank > 0
      ? ('有 ' + stat.blank + ' 项没填占比（当前合计 ' + stat.sum + '%）')
      : ('成分合计 ' + stat.sum + '%，应为 100%')));

  // 收起态那一行显示什么 —— 用户不看输入框也要知道系统算出来的克数、以及它是怎么来的
  const amountText = String(line.amountText === undefined || line.amountText === null
    ? '' : line.amountText).trim();
  if (line.unit === '克') {
    // 不再叫「用量」：用户称不出"面料单独用了多少克"，那个词对他没有意义。
    // 克数的来源必须一起写出来 —— 是按他填的整件重量换算的，还是本类常见值，
    // 两种可信度差一个量级，只甩一个数字等于让他无从判断
    out.amountNote = amountText
      ? (amountText + ' 克 · ' + (line.weightSource || '来源未知'))
      : '还没算用料克数';
  } else {
    out.amountNote = amountText
      ? (amountText + ' ' + line.unit)
      : ('请填用量（' + line.unit + '）');
  }
  return out;
}

function decorateBrand(b, series) {
  const pct = function (v) {
    return typeof v === 'number' ? (v * 100).toFixed(1) + '%' : '—';
  };
  // 选了系列就用系列口径；没选就是品牌整体口径 —— 两者不同，必须说清楚用的是哪个
  const margin = series && typeof series.grossMargin === 'number'
    ? series.grossMargin
    : b.grossMargin;
  const markup = series && typeof series.markup === 'number' ? series.markup : b.markup;
  const premium = series && typeof series.premiumRate === 'number' ? series.premiumRate : b.premiumRate;

  return {
    key: b.key,
    label: series ? b.label + ' · ' + series.label : b.label,
    scope: series ? '系列' : '品牌整体',
    company: b.company || '',
    listing: b.listing || '',
    tier: b.tier || '',
    period: (series && series.period) || b.period || '',
    source: b.source || '',
    grade: (series && series.grade) || b.grade || 'estimate',
    // 毛利率与派生倍率都摆出来，让用户自己核对口径（毛利率→倍率是派生值，不是手填）
    marginText: pct(margin),
    markupText: typeof markup === 'number' ? markup.toFixed(2) + ' ×' : '—',
    premiumText: pct(premium),
    hasSeries: (b.series || []).length > 0,
    series: (b.series || []).map(function (s) {
      return { key: s.key, label: s.label, marginText: pct(s.grossMargin) };
    })
  };
}

function toMaterialInput(line, fabricOptions) {
  const amount = parseFloat(line.amountText) || 0;
  if (line.mode === 'fiber') {
    const fibers = (line.fiberRows || []).map(function (f) {
      const o = FIBER_OPTIONS[f.optIndex] || {};
      return { fiber: o.fiber, tier: o.tier, pct: parseFloat(f.pctText) };
    }).filter(function (f) {
      return f.fiber && f.pct > 0;
    });
    const input = { part: line.part, amount: amount, unit: line.unit, fibers: fibers };
    const gsm = parseFloat(line.gsmText);
    const width = parseFloat(line.widthText);
    // 用户填了实测克重/幅宽就以用户的为准（配置层的优先级最高档）
    if (gsm > 0) input.gsm = gsm;
    if (width > 0) input.width = width;
    return input;
  }
  const opts = Array.isArray(fabricOptions) ? fabricOptions : [];
  const fabric = opts[line.fabricIndex];
  return { part: line.part, amount: amount, unit: '米', fabricKey: fabric ? fabric.key : '' };
}

/** 找选项下标；找不到返回 -1（不许回落成 0，那会把「亚麻」悄悄变成「棉」） */
function findOptionIndexOrNull(fiberKey, tierKey) {
  for (let i = 0; i < FIBER_OPTIONS.length; i += 1) {
    if (FIBER_OPTIONS[i].fiber === fiberKey && FIBER_OPTIONS[i].tier === tierKey) return i;
  }
  return -1;
}

/**
 * 用小程序自带的 VisionKit OCR 读图上的文字。
 *
 * 基础库 2.27.0 起支持，**不需要后端、不需要备案域名** —— 这条对小程序最关键：
 * 走服务端调大模型那条路要等后端就绪（见 AGENTS.md 第 7 节），
 * 而这个能力现在就能用，且完全不离开本机。
 *
 * runOCR 只吃像素不吃文件，所以先把图画到离屏 canvas 上取 RGBA。
 * 任何一步失败都 reject，由调用方降级到手动输入 —— 不许假装识别成功。
 */
function runVisionOcr(filePath) {
  return new Promise(function (resolve, reject) {
    if (!wx.createVKSession) {
      reject(new Error('当前基础库不支持端上 OCR（需 2.27.0 及以上）'));
      return;
    }

    let session = null;
    let settled = false;
    const finish = function (err, text) {
      if (settled) return;
      settled = true;
      if (session) {
        try { session.destroy(); } catch (e) { /* 销毁失败无影响 */ }
      }
      if (err) reject(err); else resolve(text);
    };

    try {
      session = wx.createVKSession({ track: { OCR: { mode: 2 } } });
    } catch (err) {
      reject(new Error('创建 OCR 会话失败：' + err.message));
      return;
    }

    session.on('updateAnchors', function (anchors) {
      const text = (anchors || []).map(function (a) { return a.text || ''; })
        .join('\n').trim();
      if (text) finish(null, text);
    });

    session.start(function (errno) {
      if (errno) {
        finish(new Error('OCR 会话启动失败（errno ' + errno + '）'));
        return;
      }
      try {
        const canvas = wx.createOffscreenCanvas({ type: '2d' });
        const img = canvas.createImage();
        img.onload = function () {
          const w = img.width;
          const h = img.height;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h);
          try {
            session.runOCR({ frameBuffer: data.data.buffer, width: w, height: h });
          } catch (err) {
            finish(new Error('OCR 执行失败：' + err.message));
          }
        };
        img.onerror = function () { finish(new Error('图片解码失败')); };
        img.src = filePath;
      } catch (err) {
        finish(new Error('图像预处理失败：' + err.message));
      }
    });

    // 兜底：超时就当没读出来，别让界面一直停在"识别中"
    setTimeout(function () { finish(new Error('识别超时（10 秒）')); }, 10000);
  });
}

// 首屏那套选项先算好 —— data 初始化要用，两处各算一遍迟早不一致
const INIT_CATEGORY = CATEGORIES[0].key;
const INIT_FABRIC_OPTIONS = composeFabricOptions(INIT_CATEGORY, true);
const INIT_BRAND_OPTIONS = composeBrandOptions(INIT_CATEGORY, true);

Page({
  data: {
    categories: CATEGORIES,
    fabricOptions: INIT_FABRIC_OPTIONS,
    // 面料 / 品牌是否只显示「适合本类」的。找不到时能一键展开全部 —— **一个都不藏**
    fabricScopeOnly: true,
    fiberOptions: FIBER_OPTIONS,
    brandOptions: INIT_BRAND_OPTIONS,
    brandScopeOnly: true,

    name: '',
    category: INIT_CATEGORY,
    // 整件衣服重量 —— 拿秤一放就有数，是用户唯一能自己验证的用量输入。
    // 留空也照样能算：各部位回落本类常见值（与加这一项之前的行为完全一致）
    totalWeightText: '',
    // 各部位克数是怎么换算出来的（基准 + 倍数），界面照写，不让用户猜
    totalWeightNote: '',
    // 用户能填的部位只有面料一个。里料 / 填充由 config.autoMaterialInputs 按品类补齐
    // （依据 UNIT_WEIGHT.byCategory：表里有这个部位才说明这类衣服通常有它）
    lines: [decorateLine(newLine('shell', INIT_CATEGORY, 0), INIT_FABRIC_OPTIONS)],
    // 水洗标上真的读到的里料 / 填充成分（法定标注，优先于行业常见值）。
    // 存在这里而不是做成输入项 —— 用户不知道也不该被问，我们替他记着
    labelParts: {},
    // 系统替他计入的部位（展示用，只汇报、不可编辑）
    autoParts: [],
    shellCost: 0,
    autoCost: 0,
    auxRatioText: '',
    brandIndex: 0,
    seriesOptions: seriesOptionsOf(null),
    seriesIndex: 0,
    // 商品名里读到的品牌档位。**不做成输入项** —— 用户不知道什么叫"品牌档位"，
    // 逼他选只会逼他瞎选。但它决定设计费率（普通 12% / 奢侈 60%，差 5 倍），
    // 所以不能丢：只在用户没指定品牌时兜底生效（brandKey 优先，见 resolveCoefficients）。
    brandTierGuess: '',
    // 用档位兜底时必须说出来，不能让用户以为这个数是按他品牌的年报毛利率算的
    tierNotice: '',
    retailText: '',
    hint: '',

    // 拍照识别水洗标
    labelImage: '',
    labelText: '',
    recognizeNote: '',
    showManualInput: false,

    // 材料成本合计
    material: {},
    gradeLabel: '',
    gradeClass: 'tag--estimate',
    brandInfo: null
  },

  onLoad: function () {
    this.refresh();
  },

  // 每次改动都整体重算：用料条数少，重建比增量同步更不容易出错
  refresh: function () {
    const category = this.data.category;
    const fabricOptions = this.data.fabricOptions;
    // 整件衣服重量：填了 → 各部位按它等比换算；没填 → 回落本类常见值。
    // 两条路都在配置层算，界面只负责把依据显示出来
    const totalWeight = parseFloat(this.data.totalWeightText) || 0;
    // 用户能填的只有面料；里料 / 填充由配置层按品类补齐。
    // **不许在界面里拼** —— 漏一个部位会被逐级放大成系统性低估（漏辅料那次低估 15%）。
    const shellInputs = this.data.lines.map(function (l) { return toMaterialInput(l, fabricOptions); });
    const autoInputs = config.autoMaterialInputs(category, this.data.labelParts, totalWeight);
    const material = config.estimateMaterialCost({
      category: category,
      materials: shellInputs.concat(autoInputs)
    });

    const brandOption = this.data.brandOptions[this.data.brandIndex] || this.data.brandOptions[0];
    const raw = brandOption.key ? config.getBrand(brandOption.key) : null;
    const seriesOption = this.data.seriesOptions[this.data.seriesIndex] || { key: null };
    const seriesInfo = raw && seriesOption.key
      ? (raw.series || []).filter(function (s) { return s.key === seriesOption.key; })[0]
      : null;

    // 档位兜底只在「没指定品牌」时生效 —— 指定了品牌就走品牌年报毛利率，档位不作数。
    // 但用了就必须说出来：用户得知道这个设计费率是按档位估的、不是他品牌的真实年报数。
    const guessTier = this.data.brandTierGuess;
    const tierNotice = (!raw && guessTier && TIER_LABEL[guessTier])
      ? ('按「' + TIER_LABEL[guessTier] + '」档位估算 —— 这一档来自商品名推测，'
        + '不是该品牌的年报数据。知道品牌的话请在下面选一个，会准得多')
      : '';

    // 把每条用料的定价结果贴回展示层（顺序一一对应，因为 inputs 就是从 lines 顺序生成的）
    const decorated = this.data.lines.map(function (line, i) {
      const d = decorateLine(line, fabricOptions);
      const priced = (material.lines || [])[i] || {};
      d.cost = priced.cost;
      d.reason = priced.reason || '';
      d.degraded = priced.degraded === true;
      d.conversionNote = priced.conversionNote || '';
      d.specNote = priced.weightSpec ? priced.weightSpec.note : '';
      d.specAssumed = priced.specAssumed === true;
      d.priceText = typeof priced.unitPrice === 'number' && priced.priceUnit
        ? '¥' + priced.unitPrice + ' / ' + priced.priceUnit
        : (typeof priced.unitPrice === 'number' ? '¥' + priced.unitPrice + ' / ' + (priced.unit || '米') : '');
      return d;
    });

    // 系统替他计入的部位：定价结果按顺序贴在 material.lines 尾部（面料在前，一一对应）
    const autoParts = autoInputs.map(function (input, i) {
      const priced = (material.lines || [])[shellInputs.length + i] || {};
      return {
        part: input.part,
        label: input.label,
        fromLabel: input.basis === 'label',
        basisNote: input.basisNote,
        weightText: input.amount + ' 克',
        // 这个克数是按用户填的整件重量换算的，还是本类常见值 —— 两条路可信度不同，
        // 界面必须说得出来（只甩一个"里料 150 克"，用户没法判断该不该信）
        weightFromTotal: input.weightFromTotal === true,
        weightSource: input.weightSource || '',
        cost: priced.cost,
        degraded: priced.degraded === true,
        reason: priced.reason || ''
      };
    });
    const autoCost = round2Of(autoParts.reduce(function (s, p) {
      return s + (typeof p.cost === 'number' ? p.cost : 0);
    }, 0));
    const shellCost = round2Of(material.mainCost - autoCost);

    // 整件重量的换算依据 —— 有值就把它写出来（基准多少克、放大了几倍），
    // 用户才知道"面料 384 克"不是天上掉的
    const dist = config.distributeByTotalWeight(category, totalWeight);
    const totalWeightNote = dist
      ? dist.note
      : (totalWeight > 0 ? '本类衣服暂无用料重量数据，仍按常见值计入' : '');

    this.setData({
      material: material,
      gradeLabel: GRADE_LABEL[material.grade] || '来源未知',
      gradeClass: GRADE_CLASS[material.grade] || 'tag--estimate',
      brandInfo: raw ? decorateBrand(raw, seriesInfo) : null,
      tierNotice: tierNotice,
      lines: decorated,
      autoParts: autoParts,
      autoCost: autoCost,
      shellCost: shellCost,
      totalWeightNote: totalWeightNote,
      // 比例（0~1）直接显示会写成"按品类比例 0.25"，人读不出这是 25%
      auxRatioText: Math.round((material.auxiliaryRatio || 0) * 100) + '%'
    });
  },

  // ---------------------------------------------------------------- 输入

  onNameInput: function (e) {
    this.setData({ name: e.detail.value });
  },

  // 识别结果只作**预填**，用户仍可自行修改（AGENTS.md 第 3 节：识别必须可修正）
  onNameBlur: function () {
    const guessed = recognize.recognizeByText(this.data.name);

    // 不做的品类（鞋 / 包）**先短路**：明确告知，且不做任何预填。
    // 不能让它继续往下走 —— "帆布鞋"会从"帆布"推出棉 100%，用户很可能
    // 就拿这件鞋按衣物表单算下去，得到一条看着正常的错数。
    if (guessed.unsupportedNote) {
      this.setData({ hint: guessed.unsupportedNote });
      return;
    }

    // 品牌：商品名里提到了库里的品牌，就预选它 —— 直接用年报毛利率，比档位估算准。
    // 用 findBrandMention 而不是 findBrandByName：后者的语义是"整段文字就是一个品牌名"，
    // 「爱马仕羊绒大衣」这种匹配不到它（两个函数的分工见 config 里的注释）。
    const brandHit = config.findBrandMention(this.data.name);
    // 识别到的品牌可能不在当前显示范围里（默认只列适合本类的）——
    // selectBrandByKey 会自动展开全部再找，**不许因为不在默认列表里就当作没识别到**
    const brandSel = brandHit ? this.selectBrandByKey(brandHit.key) : null;
    const brandIndex = brandSel ? brandSel.brandIndex : -1;

    // 品牌库对不上、但商品名看着带品牌档次（香奈儿、LV…库里没有，也就没有年报毛利率）。
    // 档位信息照样有效，不能当没识别到：奢侈档与普通档的设计费率差 5 倍（60% vs 12%），
    // 丢了它，一条爱马仕的估价会按普通品牌算出来。
    const tierGuess = (brandIndex < 0 && guessed.brandTier && guessed.brandTier !== 'common')
      ? guessed.brandTier : '';

    const lines = this.data.lines.slice();
    const patch = { hint: '' };
    let hasGuess = false;

    if (guessed.category) {
      // 与手动点品类共用同一个计划函数 —— 克数、选项重排、下标搬迁三件事一起做，
      // 不让识别这条路径自己写一份（分开写必然漂移，这个坑踩过）
      const plan = planCategoryChange(guessed.category, this.categoryContext());
      const catNotes = plan.notes;
      delete plan.notes;
      Object.assign(patch, plan);
      if (catNotes.length > 0) patch.hint = catNotes.join('\n');
      hasGuess = true;
    }

    if (brandIndex >= 0) {
      patch.brandIndex = brandIndex;
      patch.brandOptions = brandSel.brandOptions;
      patch.brandScopeOnly = brandSel.brandScopeOnly;
      patch.seriesOptions = seriesOptionsOf(brandHit.key);
      patch.seriesIndex = 0;
      patch.brandTierGuess = '';
      hasGuess = true;
    } else if (tierGuess) {
      patch.brandTierGuess = tierGuess;
      hasGuess = true;
    }

    if (guessed.fiberHints.length > 0) {
      // 商品名只说明"像什么面料"，说明不了成分 —— 给的是线索，不是结论。
      // 用户能填的部位只有一个（面料），就是第 0 条。
      // **不覆盖 fibersTouched 的行**：用户手填的、水洗标读到的成分，权威性都高于商品名推测。
      const target = 0;
      const current = patch.lines || lines;
      const rows = [];

      if (!current[target].fibersTouched) {
        guessed.fiberHints.forEach(function (h) {
          const optIndex = findOptionIndexOrNull(h.fiber, config.getDefaultTierKey(h.fiber));
          // 该纤维在价格表里没有档位 —— 如实跳过，不许回落成"棉"
          if (optIndex >= 0) rows.push({ optIndex: optIndex, pctText: String(h.pct) });
        });
      }
      if (rows.length > 0) {
        const next = current.slice();
        next[target] = Object.assign({}, next[target], { mode: 'fiber', fiberRows: rows });
        patch.lines = next;
      }
      patch.hint = '已按商品名推测面料成分。这是推测、不是水洗标读到的，请核对'
        + (guessed.hintNote ? '：' + guessed.hintNote : '');
      hasGuess = true;
    } else if (guessed.hintNote) {
      // 词命中了但推不出成分（针织 / 加厚 / 只写了混纺）—— 不猜，如实说明原因
      patch.hint = guessed.hintNote;
      hasGuess = true;
    }

    // 品牌是**预选**，必须说出来：品牌选错，溢价率整个错，
    // 而用户会以为这是我们照他写的品牌算的。
    if (brandIndex >= 0) {
      patch.hint = (patch.hint ? patch.hint + '\n' : '')
        + '已按商品名预选品牌「' + brandHit.label + '」（用年报毛利率）—— 请核对，选错品牌溢价率会整个错';
    }
    if (tierGuess) {
      patch.hint = (patch.hint ? patch.hint + '\n' : '')
        + '商品名看着像' + TIER_LABEL[tierGuess] + '，但库里没有这家公司的年报数据，'
        + '先按该档位估算 —— 知道品牌的话请在上面选一个';
    }

    // 什么都没识别出来就别动数据：顺手把上一条提示清掉，用户会以为出了什么事
    if (!hasGuess) return;

    this.setData(patch, this.refresh);
  },

  onRetailInput: function (e) {
    this.setData({ retailText: e.detail.value });
  },

  /**
   * 整件衣服重量 —— 用户拿秤一放就有数，是他唯一能自己验证的用量输入。
   *
   * 改这个数要把**所有没被用户单独改过的**部位克数按新重量重算一遍。
   * 走的是和换品类完全同一条路（syncTypicalWeights），不另写一份 ——
   * 两条路径各写一遍必然漂移，这个坑这个项目踩过。
   */
  onTotalWeightInput: function (e) {
    const text = e.detail.value;
    const total = parseFloat(text) || 0;
    this.setData({
      totalWeightText: text,
      lines: syncTypicalWeights(this.data.lines, this.data.category, total)
    }, this.refresh);
  },

  /** 展开 / 收起「本类之外的品牌」—— 默认只看适合本类的，找不到时能一键展开 */
  onToggleBrandScope: function () {
    const scopeOnly = !this.data.brandScopeOnly;
    const key = (this.data.brandOptions[this.data.brandIndex] || {}).key;
    const options = composeBrandOptions(this.data.category, scopeOnly);
    const idx = indexOfKey(options, key);
    this.setData({
      brandScopeOnly: scopeOnly,
      brandOptions: options,
      // 展开前后下标不是一回事（列表重排了）→ 按 key 找回来，
      // 找不到才回到「不指定品牌」。直接沿用旧下标 = 悄悄换了用户的品牌
      brandIndex: idx >= 0 ? idx : 0
    }, this.refresh);
  },

  /** 同上，面料 —— 「按面料名计价」那条路用的列表 */
  onToggleFabricScope: function () {
    const scopeOnly = !this.data.fabricScopeOnly;
    const oldOptions = this.data.fabricOptions;
    const keys = this.data.lines.map(function (line) {
      return (oldOptions[line.fabricIndex] || {}).key;
    });
    const options = composeFabricOptions(this.data.category, scopeOnly);
    const lines = this.data.lines.map(function (line, i) {
      const idx = indexOfKey(options, keys[i]);
      return Object.assign({}, line, { fabricIndex: idx >= 0 ? idx : 0 });
    });
    this.setData({ fabricScopeOnly: scopeOnly, fabricOptions: options, lines: lines }, this.refresh);
  },

  /** 用户填的整件衣服重量；没填返回 0（调用方据此回落本类常见值） */
  totalWeight: function () {
    return parseFloat(this.data.totalWeightText) || 0;
  },

  /** planCategoryChange 要的那组当前状态 */
  categoryContext: function () {
    return {
      lines: this.data.lines,
      fabricOptions: this.data.fabricOptions,
      fabricScopeOnly: this.data.fabricScopeOnly,
      brandOptions: this.data.brandOptions,
      brandScopeOnly: this.data.brandScopeOnly,
      brandIndex: this.data.brandIndex,
      totalWeight: this.totalWeight()
    };
  },

  /** 选中某个品牌 —— 不在当前显示范围内就自动展开全部再找 */
  selectBrandByKey: function (brandKey) {
    const category = this.data.category;
    let scopeOnly = this.data.brandScopeOnly;
    let options = composeBrandOptions(category, scopeOnly);
    let idx = indexOfKey(options, brandKey);
    if (idx < 0) {
      // 默认只列适合本类的，而品牌跨品类卖货是常态 —— 找不到就展开，
      // **不许把用户写出来的品牌当成没识别到**
      scopeOnly = false;
      options = composeBrandOptions(category, scopeOnly);
      idx = indexOfKey(options, brandKey);
    }
    return idx < 0 ? null : { brandIndex: idx, brandOptions: options, brandScopeOnly: scopeOnly };
  },

  onCategoryChange: function (e) {
    const plan = planCategoryChange(e.detail.value, this.categoryContext());
    const notes = plan.notes;
    delete plan.notes;
    if (notes.length > 0) plan.hint = notes.join('\n');
    this.setData(plan, this.refresh);
  },

  onBrandChange: function (e) {
    const brandIndex = Number(e.detail.value);
    const brandOption = this.data.brandOptions[brandIndex] || this.data.brandOptions[0];
    // 换品牌时系列必须归零，否则会拿着 A 品牌的系列去套 B 品牌——静默串味
    this.setData({
      brandIndex: brandIndex,
      seriesOptions: seriesOptionsOf(brandOption.key),
      seriesIndex: 0
    }, this.refresh);
  },

  onSeriesChange: function (e) {
    this.setData({ seriesIndex: Number(e.detail.value) }, this.refresh);
  },

  // ---------------------------------------------------------------- 用料行

  updateLine: function (index, patch) {
    const lines = this.data.lines.slice();
    lines[index] = Object.assign({}, lines[index], patch);
    this.setData({ lines: lines }, this.refresh);
  },

  // ------------------------------------------------ 面料（用户唯一要填的部位）

  /** 展开/收起用量输入。收起态显示系统替他填的值，想看想改再展开 */
  onToggleAmount: function (e) {
    const li = e.currentTarget.dataset.li;
    this.updateLine(li, { showAmount: !this.data.lines[li].showAmount });
  },

  onModeChange: function (e) {
    const li = e.currentTarget.dataset.li;
    const mode = e.currentTarget.dataset.mode;
    const line = this.data.lines[li];

    // 换计价方式必须**连单位一起换**：按面料名是元/米。留着"克"会让界面显示
    // "200 克"而定价按米算 —— 用户看到的和算出来的不是一件事（静默错值）。
    const patch = { mode: mode, unit: mode === 'fabric' ? '米' : partUnit(line.part) };

    // 从米换回克时，米数不能当克数接着用 → 重置为该部位的典型克重
    if (mode === 'fiber' && line.unit !== '克') {
      const w = config.resolveTypicalWeight(this.data.category, line.part);
      patch.amountText = String(w.g);
      patch.weightTouched = false;
      patch.weightHint = w.range ? ('常见 ' + w.range + ' 克') : '';
      patch.weightSource = w.source;
    }
    this.updateLine(li, patch);
  },

  onFabricChange: function (e) {
    const idx = e.currentTarget.dataset.li;
    this.updateLine(idx, { fabricIndex: Number(e.detail.value) });
  },

  onAmountInput: function (e) {
    const idx = e.currentTarget.dataset.li;
    // 标记为"用户动过"，之后切品类/换部位都不再覆盖这个数
    this.updateLine(idx, { amountText: e.detail.value, weightTouched: true });
  },

  onGsmInput: function (e) {
    const idx = e.currentTarget.dataset.li;
    this.updateLine(idx, { gsmText: e.detail.value });
  },

  onWidthInput: function (e) {
    const idx = e.currentTarget.dataset.li;
    this.updateLine(idx, { widthText: e.detail.value });
  },

  onFiberChange: function (e) {
    const li = e.currentTarget.dataset.li;
    const fi = e.currentTarget.dataset.fi;
    const line = this.data.lines[li];
    const rows = line.fiberRows.slice();
    rows[fi] = Object.assign({}, rows[fi], { optIndex: Number(e.detail.value) });
    this.updateLine(li, { fiberRows: rows, fibersTouched: true });
  },

  onFiberPctInput: function (e) {
    const li = e.currentTarget.dataset.li;
    const fi = e.currentTarget.dataset.fi;
    const line = this.data.lines[li];
    const rows = line.fiberRows.slice();
    rows[fi] = Object.assign({}, rows[fi], { pctText: e.detail.value });
    this.updateLine(li, { fiberRows: rows, fibersTouched: true });
  },

  onAddFiber: function (e) {
    const li = e.currentTarget.dataset.li;
    const line = this.data.lines[li];
    if (line.fiberRows.length >= 3) {
      this.setData({ hint: '一条用料最多 3 种成分；再多就不是成衣常见配比了' });
      return;
    }
    const rows = line.fiberRows.slice();
    let hint = '';

    // 原本只有一种成分、且正好是 100% 时，自动改成 80% / 20%。
    // 不这么做，用户看到的是"合计 120%"，还得自己算该减多少 —— 那正是
    // 这个校验要消灭的填错。改动明说，用户仍可改。
    if (rows.length === 1 && String(rows[0].pctText).trim() === '100') {
      rows[0] = Object.assign({}, rows[0], { pctText: '80' });
      hint = '已把原成分改成 80%，新增成分 20%（合计 100%）—— 请按水洗标核对';
    }
    rows.push({ optIndex: findOptionIndex('polyester', 'staple_fiber'), pctText: '20' });

    this.setData({ hint: hint });
    this.updateLine(li, { fiberRows: rows, fibersTouched: true });
  },

  onRemoveFiber: function (e) {
    const li = e.currentTarget.dataset.li;
    const fi = e.currentTarget.dataset.fi;
    const line = this.data.lines[li];
    if (line.fiberRows.length <= 1) return;
    const rows = line.fiberRows.slice();
    rows.splice(fi, 1);

    // 删到只剩一种成分 → 那就是全部，占比自动置 100%。
    // 留着 80% 的话合计永远到不了 100，用户只会反复撞"请改到 100%"的提示。
    let hint = '';
    if (rows.length === 1 && String(rows[0].pctText).trim() !== '100') {
      rows[0] = Object.assign({}, rows[0], { pctText: '100' });
      hint = '只剩一种成分，占比已置为 100%';
    }
    this.setData({ hint: hint });
    this.updateLine(li, { fiberRows: rows, fibersTouched: true });
  },

  // ---------------------------------------------------------------- 动作

  // ---------------------------------------------------------------- 拍照识别

  /**
   * 拍水洗标 → 端上 OCR 读字 → 解析成分。
   *
   * 主入口是**水洗标**不是吊牌：国标 GB/T 29862 强制的是耐久性标签（水洗标），
   * 吊牌只是推荐性、可以根本没写成分。
   */
  onPickLabel: function () {
    const self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      camera: 'back',
      success: function (res) {
        const path = res.tempFiles[0].tempFilePath;
        self.setData({
          labelImage: path,
          recognizeNote: '正在读水洗标上的字…',
          showManualInput: false
        });
        self.recognizeLabelImage(path);
      },
      fail: function () { /* 用户取消拍照，什么都不做 */ }
    });
  },

  recognizeLabelImage: function (path) {
    const self = this;
    runVisionOcr(path).then(function (text) {
      self.setData({ labelText: text });
      self.applyLabelText(text);
    }).catch(function (err) {
      // 读不出字不是死路：照片留着当参考，让用户把文字打进来，解析逻辑完全一样
      self.setData({
        recognizeNote: '没读出文字（' + err.message + '）。\n'
          + '把水洗标上的成分照着打进来，一样能算 —— 格式例如「羊毛 80% 涤纶 20%」',
        showManualInput: true
      });
    });
  },

  onToggleManualInput: function () {
    this.setData({ showManualInput: !this.data.showManualInput });
  },

  onLabelTextInput: function (e) {
    this.setData({ labelText: e.detail.value });
  },

  onParseLabelText: function () {
    this.applyLabelText(this.data.labelText);
  },

  /**
   * 把解析出来的成分回填。
   *
   * 面料 → 填进用户那一行（界面唯一可编辑的部位）。
   * 里料 / 填充 → **不做成输入项**，但标签上写了就是法定标注，比行业常见值可信，
   *   所以存进 labelParts 交给配置层用。用户看不见、也不需要管。
   * 价格表里查不到的纤维（亚麻、锦纶…）**不回填也不静默丢弃**，列出来告诉用户。
   */
  applyLabelText: function (text) {
    const parsed = recognize.parseFiberLabelText(text);
    const notes = [];

    if (!parsed.ok) {
      notes.push(parsed.warnings.join('\n') || '没解析出成分');
      if (parsed.rejected.length) {
        notes.push('已拒绝的非规范词：' + parsed.rejected.join('、'));
      }
      this.setData({ recognizeNote: notes.join('\n'), showManualInput: true });
      return;
    }

    const lines = this.data.lines.slice();
    const labelParts = Object.assign({}, this.data.labelParts);
    const skipped = [];
    const fromLabelParts = [];
    let filledShell = false;

    parsed.parts.forEach(function (part) {
      const rows = [];
      const stored = [];
      part.fibers.forEach(function (f) {
        const tierKey = f.tier || config.getDefaultTierKey(f.fiber);
        const optIndex = findOptionIndexOrNull(f.fiber, tierKey);
        // 价格表里没有这个纤维的档位 —— 如实跳过，不许回落成"棉"
        if (optIndex < 0) {
          skipped.push(f.word || f.fiber);
          return;
        }
        const o = FIBER_OPTIONS[optIndex];
        rows.push({ optIndex: optIndex, pctText: String(f.pct) });
        stored.push({ fiber: o.fiber, tier: o.tier, pct: parseFloat(f.pct) });
      });
      if (rows.length === 0) return;

      if (part.part === 'shell') {
        // 水洗标是**法定标注**（GB/T 29862 强制耐久性标签），权威性高于按商品名推测 ——
        // 回填后打上 fibersTouched，不许再被商品名识别覆盖
        lines[0] = Object.assign({}, lines[0], {
          mode: 'fiber',
          unit: partUnit(lines[0].part),
          fiberRows: rows,
          fibersTouched: true
        });
        filledShell = true;
        return;
      }

      labelParts[part.part] = stored;
      fromLabelParts.push(partLabel(part.part));
    });

    if (!filledShell) {
      notes.push(skipped.length > 0
        ? '水洗标上的面料成分价格表里没有档位，没能回填 —— 请手动选一个最接近的纤维。'
        : '没在水洗标上认出面料成分，请手动选。');
    } else {
      notes.push('已回填面料成分，纤维档和克数都可以再改。');
    }
    if (fromLabelParts.length > 0) {
      notes.push('水洗标上还写了' + fromLabelParts.join('、') + '的成分 —— 这些不用你填，'
        + '已照标签计入。');
    }
    if (skipped.length > 0) {
      notes.push('这些纤维价格表里暂无档位，未回填：' + skipped.join('、'));
    }
    parsed.warnings.forEach(function (w) { notes.push(w); });

    this.setData({
      lines: lines,
      labelParts: labelParts,
      recognizeNote: notes.join('\n'),
      showManualInput: skipped.length > 0
    }, this.refresh);
  },

  onSubmit: function () {
    // 成分占比必须凑齐 100% 才允许往下走。
    // 占比没凑齐时加权单价一定是错的（填 80% 就等于按八折算），配置层对这种情况
    // 会直接降级不给单价 —— 与其让用户走到结果页看到一个 ¥0，不如在这里拦住并说清楚。
    const bad = [];
    this.data.lines.forEach(function (line) {
      if (line.mode !== 'fiber') return;
      const stat = linePctStat(line);
      if (stat.balanced) return;
      bad.push(partLabel(line.part) + '：'
        + (stat.blank > 0 ? '还有 ' + stat.blank + ' 项没填占比' : '合计 ' + stat.sum + '%'));
    });
    if (bad.length > 0) {
      this.setData({
        hint: '面料成分占比必须合计 100%（容差 ±' + config.PCT_TOLERANCE + '%）：' + bad.join('；')
          + '。先把占比改对 —— 占比不对，算出来的单价就是错的。'
      });
      return;
    }

    const material = this.data.material;
    const brandOption = this.data.brandOptions[this.data.brandIndex] || this.data.brandOptions[0];
    const seriesOption = this.data.seriesOptions[this.data.seriesIndex] || { key: null };

    // core 的 material 契约为 { unitPrice, amount }，且**只做纯计算、不查价格表**（定价属配置层）。
    // 组装交给配置层做 —— 界面自己拼会漏（曾漏掉辅料，导致总额低估 15%）。
    const payload = {
      item: {
        name: this.data.name || '未命名单品',
        category: this.data.category,
        brandKey: brandOption.key,
        seriesKey: seriesOption.key,
        // 没指定品牌时，用商品名里读到的档位兜底。配置层里 brandKey 优先，
        // 所以选了品牌这一项就不作数（见 resolveCoefficients 的 legacyTier 分支）。
        // 不传的话会一直掉到默认档 common —— 一条奢侈品牌的估价就会按普通品牌算出来。
        brandTier: this.data.brandTierGuess || undefined,
        materials: config.toValuationMaterials(material)
      },
      materialDetail: material,
      brandLabel: seriesOption.key
        ? brandOption.label + ' · ' + seriesOption.label
        : brandOption.label,
      retailPrice: parseFloat(this.data.retailText) || 0,
      // 溢出比例初值取自品类默认，进入结果页后由用户自己拖
      defaultOverflowRatio: config.resolveCoefficients({ category: this.data.category }).overflowRatio
    };

    // 小程序页面间只能传字符串，JSON 编码进 URL 容易超长 —— 走全局数据传递
    getApp().globalData.lastEstimate = payload;
    wx.navigateTo({ url: '/pages/valuation/valuation' });
  }
});
