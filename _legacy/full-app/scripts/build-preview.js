#!/usr/bin/env node
/**
 * 生成小程序界面的 HTML 效果预览（preview/miniprogram-preview.html）。
 *
 * 为什么要有这个：
 *   微信开发者工具不是人人都有，但界面效果得能看到、能评审。
 *   这里用 HTML/CSS 还原小程序页面的真实视觉与**真实数据**——
 *   所有数字都从 /config 与 /core 实算，没有一个是手敲的，
 *   改了配置重新跑一遍就会跟着变，不会出现"预览和实际不一致"。
 *
 * 用法：node scripts/build-preview.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'preview', 'miniprogram-preview.html');

const config = require(path.join(ROOT, 'config', 'index.js'));
const valuation = require(path.join(ROOT, 'core', 'valuation', 'index.js'));
const theme = require(path.join(ROOT, 'miniprogram', 'styles', 'theme.js'));

const C = theme.colors;

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

// ---------------------------------------------------------------- 演示场景
// 一件羽绒服：用户**只填面料成分**一条，里料 / 填充由 config.autoMaterialInputs 补齐。
// 为什么挑这个场景：它同时压到本次的三件事 —— 只填一个部位、按千克计价的纤维、品牌库。
// 用量一律按**克**填（2026-09-27 主路径）：克 ÷ 1000 = 千克，零假设。
// 这个数取自品类典型单件重量，界面上用户可改成自己称出来的实测值。
// 演示场景走「整件衣服重量」这条路：用户拿秤称出 650 克，面料 / 里料 / 填充的
// 克数都由它等比换算 —— 他称得出整件，称不出"这件衣服的面料单独多少克"。
const DEMO_TOTAL_WEIGHT = 650;

const DEMO = {
  name: '波司登 90% 白鸭绒短款羽绒服',
  category: 'apparel_down',
  categoryLabel: '羽绒服',
  totalWeight: DEMO_TOTAL_WEIGHT,
  retailPrice: 1599,
  brandKey: 'bosideng',
  seriesKey: 'main',
  materials: [
    {
      part: 'shell', label: '面料 · 涤纶塔丝隆',
      amount: config.resolvePartWeight('apparel_down', 'shell', DEMO_TOTAL_WEIGHT).g,
      unit: '克',
      fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 100 }]
    }
  ]
};

// 水洗标上**真的读到**的里料 / 填充 —— 法定标注优先于行业常见值，演示这条路径。
// 界面不会把这两项做成输入项：用户不知道也不该被问，我们替他记着。
const DEMO_LABEL_PARTS = {
  lining: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 100 }],
  filling: [{ fiber: 'down', tier: 'white_duck_90', pct: 100 }]
};

const AUTO_INPUTS = config.autoMaterialInputs(DEMO.category, DEMO_LABEL_PARTS, DEMO.totalWeight);

const materialDetail = config.estimateMaterialCost({
  category: DEMO.category,
  materials: DEMO.materials.concat(AUTO_INPUTS)
});

const defaultOverflow = config.resolveCoefficients({ category: DEMO.category }).overflowRatio;
// 组装交给配置层（含辅料）—— 预览与界面对不上比没有预览更坏
const priced = config.toValuationMaterials(materialDetail);

function runEstimate(overflowRatio) {
  return valuation.estimate({
    category: DEMO.category,
    brandKey: DEMO.brandKey,
    seriesKey: DEMO.seriesKey,
    materials: priced,
    overflowRatio: overflowRatio
  });
}

const result = runEstimate(defaultOverflow);
const coeff = result.coefficients;
const brand = config.getBrand(DEMO.brandKey);
// 品牌必须落到**系列**：波司登主品牌 69.1% 与雪中飞 40.9% 同集团差 28.2 个百分点，
// 只显示集团整体（57.2%）会把这条关键信息抹掉。
const brandSeries = (brand.series || []).filter(function (s) {
  return s.key === DEMO.seriesKey;
})[0] || null;
const brandView = brandSeries
  ? {
    label: brand.label + ' · ' + brandSeries.label,
    grossMargin: brandSeries.grossMargin,
    markup: brandSeries.markup,
    premiumRate: brandSeries.premiumRate,
    period: brandSeries.period,
    company: brand.company,
    listing: brand.listing,
    source: brand.source
  }
  : brand;

// 个人面板的数字同样实算（口径与小程序 profile 页一致）
function profileStats() {
  const fabrics = config.listFabrics();
  const byGrade = { official: 0, semi: 0, estimate: 0 };
  fabrics.forEach(function (f) {
    if (byGrade[f.grade] !== undefined) byGrade[f.grade] += 1;
  });
  return {
    fabricCount: fabrics.length,
    fiberTierCount: config.listFibers().reduce(function (n, f) { return n + f.tiers.length; }, 0),
    categoryCount: config.listCategories().length,
    brandCount: config.listBrands().length,
    brandWithMargin: config.listBrands().filter(function (b) {
      return typeof b.grossMargin === 'number';
    }).length,
    byGrade: byGrade,
    officialRatio: Math.round(byGrade.official / fabrics.length * 100),
    snapshot: config.PRICE_SNAPSHOT.updatedAt,
    brandSnapshot: config.BRAND_SNAPSHOT ? config.BRAND_SNAPSHOT.updatedAt : ''
  };
}
const stats = profileStats();

// ---------------------------------------------------------------- 组件片段

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function gradeTag(grade) {
  return '<span class="tag ' + (GRADE_CLASS[grade] || 'tag--estimate') + '">'
    + esc(GRADE_LABEL[grade] || '来源未知') + '</span>';
}

const PART_META = [
  { key: 'materialCost', label: '材料成本', color: C.material, hint: '面料 + 辅料' },
  { key: 'processingCost', label: '加工成本', color: C.processing, hint: '裁剪缝制（按件计）' },
  { key: 'designCost', label: '设计成本', color: C.design, hint: '打版 / 样衣 / 设计' },
  { key: 'brandPremium', label: '品牌溢价', color: C.brand, hint: '牌子本身值多少' },
  { key: 'overflow', label: '允许溢出', color: C.overflow, hint: '运费 / 人工 / 销售' }
];

function phone(title, badge, body) {
  return [
    '<figure class="phone">',
    '<figcaption class="phone__cap"><span class="phone__name">' + esc(title) + '</span>',
    badge ? '<span class="phone__badge">' + esc(badge) + '</span>' : '',
    '</figcaption>',
    '<div class="screen">', body, '</div>',
    '</figure>'
  ].join('\n');
}

// ---------------------------------------------------------------- 三个页面（无登录页）

function estimatePage() {
  // 用户**只填面料**。里料 / 填充不进界面 —— 用户不知道，问了只会得到一个凑数的答案。
  const shellInput = DEMO.materials[0];
  const shellPriced = (materialDetail.lines || [])[0] || {};
  const shellWeight = config.resolvePartWeight(DEMO.category, 'shell', DEMO.totalWeight);
  // 换算依据要写在界面上 —— 用户才知道"面料 275 克"不是天上掉下来的
  const weightNote = (config.distributeByTotalWeight(DEMO.category, DEMO.totalWeight) || {}).note || '';

  // 系统替他计入的部位：只汇报、不可编辑。汇报是必须的 ——
  // 不说清"这几块钱是怎么来的"，用户没法判断这个数可不可信。
  const autoRows = AUTO_INPUTS.map(function (input, i) {
    const pricedAuto = (materialDetail.lines || [])[1 + i] || {};
    const ok = pricedAuto.degraded !== true && typeof pricedAuto.cost === 'number';
    return {
      label: partLabelOf(input.part),
      weight: input.amount,
      ok: ok,
      cost: ok ? pricedAuto.cost : 0,
      tag: input.basis === 'label' ? '照水洗标' : ''
    };
  });
  const autoCost = Math.round(autoRows.reduce(function (s, r) { return s + r.cost; }, 0) * 100) / 100;
  const shellCost = typeof shellPriced.cost === 'number' ? shellPriced.cost : 0;

  const fiberRowsHtml = shellInput.fibers.map(function (f) {
    const o = FIBER_OPTIONS.filter(function (x) {
      return x.fiber === f.fiber && x.tier === f.tier;
    })[0];
    return '<div class="fiber-line">'
      + '<div class="fiber-row">'
      + '<div class="picker picker--sm"><span>' + esc(o ? o.label : fiberNameOf(f.fiber))
      + '</span><span class="chev"></span></div>'
      + '<div class="input input--pct">' + f.pct + '</div><span class="fiber-row__pct">%</span>'
      + (shellInput.fibers.length > 1 ? '<span class="fiber-row__del">×</span>' : '')
      + '</div>'
      // 单价与出处必须写在界面上 —— "每格价格都能指出出处"是这个项目的硬口径，
      // 预览稿也得有，否则"预览与真实界面不一致"比没有预览更坏
      + (o && (o.priceText || o.srcText)
        ? '<div class="fiber-line__meta">' + esc(o.priceText)
          + (o.srcText ? ' · ' + esc(o.srcText) : '') + '</div>'
        : '')
      + '</div>';
  }).join('\n');

  const lines = [
    '<div class="line">',
    fiberRowsHtml,
    '<div class="fiber-add">＋ 添加成分</div>',
    // 占比合计必须凑齐 100%，界面实时显示、不齐就不让提交（见 config.PCT_TOLERANCE）
    '<div class="fiber-sum fiber-sum--ok">成分合计 100%</div>',
    '<div class="alt">不知道具体成分？改用面料名（元/米）估算 ›</div>',
    // 用料克数默认收起：已经按整件重量算好了，不展开就是"系统替你算的"
    '<div class="fold"><span class="fold__k">用料克数</span>',
    '<span class="fold__v">' + shellPriced.amount + ' 克 · ' + esc(shellWeight.source) + '</span>',
    '<span class="fold__cost">¥' + shellPriced.cost + '</span>',
    '<span class="fold__edit">改</span></div>',
    '</div>'
  ].join('\n');

  const autoRowsHtml = autoRows.map(function (r) {
    return '<div class="auto"><span class="auto__k">' + esc(r.label) + '</span>'
      + '<span class="auto__v">' + r.weight + ' 克</span>'
      + (r.tag ? '<span class="auto__tag">' + esc(r.tag) + '</span>' : '')
      + '<span class="auto__cost' + (r.ok ? '' : ' auto__cost--warn') + '">'
      + (r.ok ? '¥' + r.cost : '未计入') + '</span></div>';
  }).join('\n');

  // 水洗标识别结果从 DEMO 用料 + 系统补齐的部位实算，免得和表单对不上
  const scanText = DEMO.materials.concat(AUTO_INPUTS).map(function (m) {
    const names = m.fibers.map(function (f) {
      // 羽绒段里的百分比是**含绒量**不是成分占比，所以要显示规格档名而不是 pct
      if (f.fiber === 'down' && f.tier) {
        const t = config.getFiberTier(f.fiber, f.tier);
        if (t && t.label) return t.label + '（含绒量）';
      }
      return fiberNameOf(f.fiber) + ' ' + f.pct + '%';
    }).join(' + ');
    return partLabelOf(m.part) + ' ' + names;
  }).join('　·　');
  const scanDownNote = DEMO.materials.concat(AUTO_INPUTS).some(function (m) {
    return m.part === 'filling';
  }) ? '羽绒段里的百分比是含绒量，不是成分占比' : '';

  return [
    '<div class="page">',
    '<div class="head">',
    '<div class="head__brand">看光光</div>',
    '<div class="head__slogan">看清一件衣服的钱，到底花在哪</div>',
    '<div class="camera"><div class="camera__icon"><div class="camera__lens"></div></div>',
    '<div class="camera__texts"><div class="camera__title">拍水洗标，自动读成分</div>',
    '<div class="camera__sub">吊牌可以没成分，水洗标必须有 —— 拍它</div></div>',
    '<span class="chev chev--light"></span></div>',
    '</div>',
    '<div class="sheet">',
    '<div class="scan">',
    '<span class="scan__title">水洗标 · 已识别成分</span>',
    '<span class="scan__note">' + esc(scanText) + '</span>',
    scanDownNote ? '<span class="scan__note">' + esc(scanDownNote) + '</span>' : '',
    '<span class="scan__note scan__note--warn">识别结果可修正；价格表里没有的纤维会如实列出，不静默丢弃</span>',
    '</div>',
    // ① 这件衣服是什么 —— 名称置顶：品类、品牌、成分线索都从这行字里读出来，
    // 是整页信息量最大的输入，不该被夹在拍照区和品类中间
    '<div class="group-head"><span class="group-head__no">1</span>'
    + '<span class="group-head__title">这件衣服是什么</span></div>',
    '<div class="field field--lead"><span class="field__label field__label--strong">商品名称 / 描述</span>',
    '<div class="input input--lead">' + esc(DEMO.name) + '</div>',
    '<div class="field__hint">写得具体点：品类、品牌、面料线索都能从这行字里读出来</div></div>',
    '<div class="field"><span class="field__label">品类</span>',
    '<div class="chips"><span class="chip">T 恤</span><span class="chip">衬衫</span><span class="chip">裤装</span>',
    '<span class="chip chip--on">羽绒服</span><span class="chip">外套</span><span class="chip">连衣裙</span></div></div>',
    '<div class="field"><span class="field__label">整件衣服重量（克）</span>',
    '<div class="input">' + DEMO.totalWeight + '</div>',
    '<div class="field__hint field__hint--ok">' + esc(weightNote) + '</div></div>',

    // ② 面料成分 —— 用户唯一要答的问题
    '<div class="group-head"><span class="group-head__no">2</span>'
    + '<span class="group-head__title">面料成分</span>'
    + '<span class="group-head__hint">照水洗标填</span></div>',
    lines,

    // ③ 品牌 —— 按当前品类分列：波司登的毛利率来自羽绒服业务，
    // 把它摆在要做 T 恤的人面前只会误导
    '<div class="group-head"><span class="group-head__no">3</span>'
    + '<span class="group-head__title">品牌</span>'
    + '<span class="group-head__hint">查得到年报毛利率的都在库里</span></div>',
    '<div class="picker"><span>' + esc(brandView.label) + '　毛利 '
    + (brandView.grossMargin * 100).toFixed(1) + '%</span>',
    '<span class="chev"></span></div>',
    '<div class="scope-bar"><span class="scope-bar__text">只列了主营'
    + esc(DEMO.categoryLabel) + '的品牌</span>'
    + '<span class="scope-bar__btn">显示全部 ›</span></div>',
    '<div class="field"><span class="field__label">系列（同品牌不同系列溢价差很多）</span>',
    '<div class="picker"><span>' + esc(brandSeries ? brandSeries.label : '品牌整体')
    + '　毛利率 ' + (brandView.grossMargin * 100).toFixed(1) + '%</span>',
    '<span class="chev"></span></div></div>',
    '<div class="brand-card">',
    '<div class="brand-card__head"><span class="brand-card__name">' + esc(brandView.label) + '</span>',
    '<span class="tag tag--official">毛利率已披露</span></div>',
    '<div class="brand-card__grid">',
    '<div class="brand-card__cell"><span class="brand-card__k">综合毛利率</span><span class="brand-card__v">'
    + (brandView.grossMargin * 100).toFixed(1) + '%</span></div>',
    '<div class="brand-card__cell"><span class="brand-card__k">派生加价倍率</span><span class="brand-card__v">'
    + brandView.markup.toFixed(2) + ' ×</span></div>',
    '<div class="brand-card__cell"><span class="brand-card__k">模型用溢价率</span><span class="brand-card__v">'
    + (brandView.premiumRate * 100).toFixed(1) + '%</span></div>',
    '</div>',
    '<div class="brand-card__line">' + esc(brandView.company) + ' · ' + esc(brandView.listing) + '</div>',
    '<div class="brand-card__line">数据期：' + esc(brandView.period) + '</div>',
    '<div class="brand-card__line brand-card__line--src">出处：' + esc(brandView.source) + '</div>',
    '<div class="brand-card__warn">毛利率的分母是品牌方的「营业成本」，与模型的「材料 + 加工」口径接近但不等价；'
    + '且它已含渠道费用，与「允许溢出」存在重复计算。倍率为派生值，非手填。</div>',
    '</div>',
    '<div class="group-head"><span class="group-head__no">4</span>'
    + '<span class="group-head__title">多少钱买的</span>'
    + '<span class="group-head__hint">可选，填了才能对比值不值</span></div>',
    '<div class="field"><div class="input">' + DEMO.retailPrice + '</div></div>',
    '<div class="preview">',
    '<div class="preview__head"><span class="preview__label">材料成本预估</span>'
    + gradeTag(materialDetail.grade) + '</div>',
    '<div class="preview__value">¥' + materialDetail.materialCost + '</div>',
    '<div class="preview__hint">面料 ¥' + shellCost + ' + 系统计入 ¥' + autoCost + ' + 辅料 ¥'
    + materialDetail.auxiliaryCost + '（按品类比例 '
    + Math.round(materialDetail.auxiliaryRatio * 100) + '%）</div>',
    autoRowsHtml,
    '<div class="preview__source">上面这几项不用你填：按该类衣服的常见值计入（里料按涤纶、填充取羽绒中位档）；水洗标上写了就以标签为准</div>',
    '<div class="preview__source">用量默认为品类典型克重（行业常见值，非官方公布），可改成实测值</div>',
    '</div>',
    '<div class="btn btn--primary">估算真实价值</div>',
    '<div class="disclaimer">估值仅供参考，不构成购买建议</div>',
    '</div>',
    '</div>'
  ].join('\n');
}

function partLabelOf(key) {
  const hit = config.listMaterialParts().filter(function (p) { return p.key === key; })[0];
  return hit ? hit.label : key;
}

const FIBER_OPTIONS = (function () {
  const out = [];
  config.listFibers().forEach(function (f) {
    f.tiers.forEach(function (t) {
      out.push({
        fiber: f.key,
        tier: t.key,
        label: f.label + ' · ' + t.label,
        unit: f.unit,
        price: t.unitPrice,
        // 出处与数据期：界面要把它渲染在成分行下面（价格必须能溯源）
        priceText: t.unitPrice === null ? '暂无权威报价' : ('¥' + t.unitPrice + ' / ' + f.unit),
        srcText: [t.source, t.period].filter(Boolean).join(' · ')
      });
    });
  });
  return out;
})();

const FIBER_NAMES = (function () {
  const out = {};
  config.listFibers().forEach(function (f) { out[f.key] = f.label; });
  return out;
})();

function fiberNameOf(key) {
  return FIBER_NAMES[key] || key;
}

function valuationPage() {
  const parts = PART_META.map(function (m) {
    const value = result.breakdown[m.key];
    return {
      label: m.label, color: m.color, hint: m.hint, value: value,
      percent: result.breakdown.total > 0 ? Math.round(value / result.breakdown.total * 100) : 0
    };
  });

  const bar = parts.map(function (p) {
    return '<div class="bar__seg" style="width:' + p.percent + '%;background:' + p.color + '"></div>';
  }).join('');

  const rows = parts.map(function (p) {
    return '<div class="part"><span class="part__dot" style="background:' + p.color + '"></span>'
      + '<div class="part__texts"><span class="part__label">' + esc(p.label) + '</span>'
      + '<span class="part__hint">' + esc(p.hint) + '</span></div>'
      + '<div class="part__nums"><span class="part__value">¥' + p.value + '</span>'
      + '<span class="part__pct">' + p.percent + '%</span></div></div>';
  }).join('');

  const priceLines = (materialDetail.lines || []).map(function (l) {
    return '<div class="pline">'
      + '<div class="pline__head"><span class="pline__label">' + esc(l.label) + '</span>'
      + '<span class="pline__cost">¥' + l.cost + '</span></div>'
      + '<div class="pline__price">¥' + l.unitPrice + '/' + (l.priceUnit || l.unit) + ' × '
      + l.amount + esc(l.unit) + '（' + l.kg + ' 千克）</div>'
      + gradeTag(l.grade)
      + '<div class="pline__note">' + esc(l.conversionNote) + '</div>'
      + (l.specAssumed ? '<div class="pline__note pline__note--warn">克重按行业常见值假设（'
        + esc(l.weightSpec.note) + '），非官方公布</div>' : '')
      + (l.source ? '<div class="pline__note pline__note--src">出处：' + esc(l.source)
        + (l.period ? ' · 数据期 ' + esc(l.period) : '') + '</div>' : '')
      + '</div>';
  }).join('');

  const ratio = DEMO.retailPrice / result.priceRange.mid;
  const tone = ratio >= 1.15 ? 'warn' : (ratio <= 0.87 ? 'good' : 'flat');
  const verdictTitle = tone === 'warn' ? '售价明显高于真实价值'
    : (tone === 'good' ? '售价低于真实价值' : '售价接近真实价值');

  return [
    '<div class="page">',
    '<div class="content">',
    '<div class="range-card">',
    '<div class="range-card__label">' + esc(DEMO.name) + ' 的真实价值</div>',
    '<div class="range-card__value">¥' + result.priceRange.low + ' — ¥' + result.priceRange.high + '</div>',
    '<div class="range-card__mid">中位价 ¥' + result.priceRange.mid + '</div>',
    '<div class="range-card__meta">' + esc(coeff.categoryLabel) + ' · ' + esc(coeff.brandLabel) + '</div>',
    '</div>',
    '<div class="verdict verdict--' + tone + '">'
    + '<div class="verdict__title">' + verdictTitle + '</div>'
    + '<div class="verdict__detail">实际售价 ¥' + DEMO.retailPrice + ' · 约为真实价值的 '
    + ratio.toFixed(1) + ' 倍</div></div>',
    '<div class="card">',
    '<div class="card__title">钱花在哪</div>',
    '<div class="bar">' + bar + '</div>',
    '<div class="total"><span>合计</span><span class="total__value">¥' + result.breakdown.total + '</span></div>',
    rows,
    '</div>',
    '<div class="card">',
    '<div class="card__title">允许溢出，你说了算</div>',
    '<div class="card__hint">这部分是运费、人工、销售等流通环节的合理加价。给多少取决于你认为多少算合理。</div>',
    '<div class="slider-head"><span class="slider-head__value">'
    + Math.round(defaultOverflow * 100) + '%</span>'
    + '<span class="slider-head__sub">¥' + result.breakdown.overflow + '</span></div>',
    '<div class="slider"><div class="slider__track"><div class="slider__fill" style="width:'
    + Math.round(defaultOverflow * 100) + '%"></div><div class="slider__block" style="left:'
    + Math.round(defaultOverflow * 100) + '%"></div></div>',
    '<div class="slider-scale"><span>0%</span><span>50%</span><span>100%</span></div></div>',
    '</div>',
    '<div class="card">',
    '<div class="card__title">材料价格来自哪</div>',
    priceLines,
    '</div>',
    '<div class="card">',
    '<div class="card__title">品牌溢价是怎么来的</div>',
    '<div class="card__hint">' + esc(coeff.brandLabel) + ' 的溢价率不是拍脑袋定的，是由上市公司年报的'
    + '「综合毛利率」反推：加价倍率 = 1 ÷ (1 − 毛利率)。</div>',
    '<div class="card__hint card__hint--warn">口径提醒：毛利率的分母是品牌方的「营业成本」，'
    + '与模型的「材料 + 加工」接近但不等价；且它已含渠道费用，与上面的「允许溢出」存在重复计算风险。</div>',
    '</div>',
    '<div class="card">',
    '<div class="card__title">这次用的系数</div>',
    '<div class="coeff-row"><span>加工费（元/件）</span><span>' + coeff.processingFee + '</span></div>',
    '<div class="coeff-row"><span>设计费率</span><span>' + coeff.designRate + '</span></div>',
    '<div class="coeff-row"><span>品牌溢价率</span><span>' + coeff.premiumRate
    + '（来自品牌年报毛利率）</span></div>',
    '<div class="coeff-row"><span>允许溢出比例</span><span>' + defaultOverflow + '（你调的）</span></div>',
    '<div class="coeff-row"><span>区间半宽</span><span>' + coeff.spread + '</span></div>',
    '<div class="coeff-row"><span>用料条数</span><span>' + (materialDetail.lines || []).length + ' 条</span></div>',
    '</div>',
    '<div class="disclaimer">' + esc(result.disclaimer) + '</div>',
    '</div>',
    '</div>'
  ].join('\n');
}

function profilePage() {
  const seg = [
    { label: '政府公布', n: stats.byGrade.official, color: C.good },
    { label: '指数报价', n: stats.byGrade.semi, color: C.design },
    { label: '行业估算', n: stats.byGrade.estimate, color: C.warn }
  ];
  const segBar = seg.map(function (s) {
    return '<div class="seg__part" style="width:' + (s.n / stats.fabricCount * 100)
      + '%;background:' + s.color + '"></div>';
  }).join('');
  const segLegend = seg.map(function (s) {
    return '<div class="seg__item"><span class="seg__dot" style="background:' + s.color + '"></span>'
      + esc(s.label) + ' ' + s.n + '</div>';
  }).join('');

  return [
    '<div class="page">',
    '<div class="head head--tall">',
    '<div class="head__brand">我的</div>',
    '<div class="head__title">本机用户</div>',
    '<div class="head__slogan">本机使用 · 无需登录 · 数据不上传</div>',
    '</div>',
    '<div class="sheet">',
    '<div class="stat-grid">',
    '<div class="stat"><span class="stat__n">' + stats.fabricCount + '</span><span class="stat__k">面料</span></div>',
    '<div class="stat"><span class="stat__n">' + stats.fiberTierCount + '</span><span class="stat__k">纤维规格档</span></div>',
    '<div class="stat"><span class="stat__n">' + stats.brandCount + '</span><span class="stat__k">品牌</span></div>',
    '</div>',
    '<div class="card">',
    '<div class="card__title">数据可信度</div>',
    '<div class="seg">' + segBar + '</div>',
    '<div class="seg__legend">' + segLegend + '</div>',
    '<div class="card__hint">共 ' + stats.fabricCount + ' 种面料，其中 ' + stats.officialRatio
    + '% 有政府公布报价；其余如实标为估算，不假装精确。价格表快照 ' + esc(stats.snapshot) + '。</div>',
    '</div>',
    '<div class="card">',
    '<div class="card__title">估价偏好</div>',
    '<div class="coeff-row"><span>默认溢出比例</span><span>' + Math.round(defaultOverflow * 100) + '%</span></div>',
    '<div class="coeff-row"><span>默认品牌档位</span><span>普通</span></div>',
    '<div class="card__hint">品牌库里 ' + stats.brandCount + ' 个品牌，其中 ' + stats.brandWithMargin
    + ' 个查得到年报毛利率。查不到的按档位兜底并标为估算。</div>',
    '</div>',
    '<div class="card">',
    '<div class="empty-record"><span class="empty-record__title">还没有估价记录</span>'
    + '<span class="empty-record__hint">估价完成后会存在本机，不上传</span></div>',
    '</div>',
    '<div class="btn btn--ghost">清空本机偏好</div>',
    '</div>',
    '</div>'
  ].join('\n');
}

// ---------------------------------------------------------------- 输出

const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });

const html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8" />\n'
+ '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
+ '<title>看光光 · 小程序界面预览</title>\n<style>\n'
+ ':root {\n'
+ Object.keys(C).map(function (k) {
   return '  --c-' + k + ': ' + C[k] + ';';
 }).join('\n') + '\n'
+ '}\n' + fs.readFileSync(path.join(__dirname, 'preview-style.css'), 'utf8')
+ '\n</style>\n</head>\n<body>\n'
+ '<header class="doc">\n'
+ '<h1>看光光 · 小程序界面预览</h1>\n'
+ '<p class="doc__lead">这是微信小程序<strong>三页</strong>的静态还原，<strong>不用装开发者工具</strong>就能看效果。'
+ '页面里的每一个数字（材料成本、五段拆解、品牌毛利率、数据分级）都从 <code>/config</code> 与 '
+ '<code>/core</code> <strong>实算</strong>得到，没有一个是手敲的 —— 改配置重跑就会跟着变。'
+ '<strong>打开即用，已无登录页。</strong></p>\n'
+ '<div class="doc__meta">\n'
+ '<span>生成时间 ' + esc(generatedAt) + '</span>\n'
+ '<span>价格表快照 ' + esc(stats.snapshot) + '</span>\n'
+ '<span>品牌库 ' + stats.brandCount + ' 个（' + stats.brandWithMargin + ' 个有年报毛利率）</span>\n'
+ '<span>纤维规格档 ' + stats.fiberTierCount + ' 档</span>\n'
+ '</div>\n'
+ '</header>\n'
+ '<div class="doc__note">\n'
+ '<strong>演示场景：</strong>' + esc(DEMO.name) + ' —— 3 条用料，用量一律<strong>按克</strong>填'
+ '（面料 220 克 / 填充 180 克 / 里料 120 克），品牌取波司登主品牌。'
+ '选它是因为同时压到四件事：<em>多部位用料</em>、<em>按克计量（克 ÷ 1000 = 千克，零假设，不再需要克重 × 幅宽）</em>、'
+ '<em>品牌 × 系列溢价来自年报毛利率</em>、<em>水洗标成分识别</em>。\n'
+ '</div>\n'
+ '<div class="frames">\n'
+ phone('估价页 · 用料清单', '拍照识别 + 多部位 + 品牌库', estimatePage())
+ phone('价值拆解页', '五段 + 溢出滑块', valuationPage())
+ phone('我的', '数字实算', profilePage())
+ '\n</div>\n'
+ '</body>\n</html>\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('已生成 ' + path.relative(ROOT, OUT).replace(/\\/g, '/') + '（' + html.length + ' 字节）');
console.log('演示结果：材料 ¥' + materialDetail.materialCost + ' → 五段合计 ¥' + result.breakdown.total
  + '，区间 ¥' + result.priceRange.low + '~' + result.priceRange.high);
