#!/usr/bin/env node
/**
 * 可复跑的估价校验，不依赖第三方包：
 *   node scripts/verify.js
 *
 * 有任何一条不通过就以非 0 退出，便于接到流水线上。
 */

const { estimate } = require('../core/valuation/index.js');
const {
  estimateMaterialCost,
  resolveWeightSpec,
  convertAmountToKg,
  listMaterialParts,
  listCategories,
  listFabrics,
  listBrandTiers,
  resolveCoefficients,
  getFabric,
  listBrands,
  getBrand,
  findBrandByName,
  resolveBrand,
  listFibers,
  getFiberTier,
  getDefaultTierKey,
  estimateBlendUnitPrice,
  toValuationMaterials,
  autoMaterialInputs,
  materialPartLabel,
  PENDING_FIBERS,
  AUXILIARY_ITEMS,
  UNIT_CONSUMPTION,
  INDUSTRY_BENCHMARK,
  REJECTED_BRANDS
} = require('../config/index.js');

// getFiberTier 需要知道被拒绝的品牌有没有混进来，这里只用常量本身
const REJECTED_KEYS = Object.keys(REJECTED_BRANDS || {});

let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log('  PASS  ' + label);
  } else {
    failed += 1;
    console.log('  FAIL  ' + label + (detail ? '  → ' + detail : ''));
  }
}

function line(text) {
  console.log('\n' + text);
  console.log('-'.repeat(text.length));
}

line('1. 配置层完整性');
const categories = listCategories();
const fabrics = listFabrics();
const brandTiers = listBrandTiers();
check('开放品类非空，全部为衣物子类', categories.length > 0 && categories.every(function (c) {
  return c.key.indexOf('apparel_') === 0;
}), '实际 ' + categories.length + ' 个');
// 2026-09-27 收窄为只做衣物：鞋包的成本大头是鞋底/模具/五金，按面料推不出准数，
// 与其给一个像样的错数不如明确不做。删数据 ≠ 这事就完了 —— 表还在就会被加回来。
check('开放品类里不含鞋与包', categories.every(function (c) {
  return c.key !== 'apparel_shoes' && c.key !== 'apparel_bag';
}), '仍存在：' + categories.filter(function (c) {
  return c.key === 'apparel_shoes' || c.key === 'apparel_bag';
}).map(function (c) { return c.key; }).join('、'));
check('面料表非空', fabrics.length > 0, '实际 ' + fabrics.length + ' 种');
check('品牌档位为 4 档', brandTiers.length === 4, '实际 ' + brandTiers.length + ' 档');

line('2. 价格必须带出处（不许有凭常识填的价格）');
let noSource = 0;
fabrics.forEach(function (f) {
  const raw = getFabric(f.key);
  if (!raw.grade || (raw.grade !== 'official' && raw.grade !== 'semi' && raw.grade !== 'estimate')) {
    noSource += 1;
    console.log('        未标数据等级: ' + f.key);
  }
});
check('每种面料都标注了数据等级', noSource === 0, noSource + ' 种缺失');
const officialCount = fabrics.filter(function (f) { return f.grade === 'official'; }).length;
const estimateCount = fabrics.filter(function (f) { return f.grade === 'estimate'; }).length;
check('存在政府公布的官方报价', officialCount > 0, 'official ' + officialCount + ' 种');
console.log('        数据分布：official ' + officialCount + ' / semi ' +
  fabrics.filter(function (f) { return f.grade === 'semi'; }).length +
  ' / estimate ' + estimateCount + '（estimate 为已知数据缺口）');

line('3. 每个服装子类都能算出可用结果（五段）');
categories.forEach(function (c) {
  const material = estimateMaterialCost({ fabricKey: 'cotton_twill', amount: 1.5, category: c.key });
  const result = estimate({
    name: c.label,
    category: c.key,
    brandTier: 'common',
    material: { unitPrice: material.materialCost, amount: 1 }
  });
  const b = result.breakdown;
  const sum = round2(
    b.materialCost + b.processingCost + b.designCost + b.brandPremium + b.overflow
  );
  const ok = b.total > 0 && sum === b.total &&
    result.priceRange.low < b.total && b.total < result.priceRange.high;
  check(
    pad(c.label, 26) + ' ¥' + b.total + '  (' + result.priceRange.low + '~' + result.priceRange.high + ')',
    ok,
    ok ? '' : '五段合计 ' + sum + ' 与 total ' + b.total + ' 不一致'
  );
});

line('4. 五段口径');
const knit = resolveCoefficients({ category: 'apparel_knit', brandTier: 'known' });
const knitBreakdown = estimate({
  category: 'apparel_knit',
  brandTier: 'known',
  material: { unitPrice: 100, amount: 1 }
}).breakdown;

check('加工费按件计（针织 ¥8），与材料无关', knit.processingFee === 8, '实际 ' + knit.processingFee);
check('加工成本不随材料变化', (function () {
  const cheap = estimate({ category: 'apparel_knit', brandTier: 'known', material: { unitPrice: 10, amount: 1 } }).breakdown;
  const pricey = estimate({ category: 'apparel_knit', brandTier: 'known', material: { unitPrice: 1000, amount: 1 } }).breakdown;
  return cheap.processingCost === pricey.processingCost && cheap.processingCost === 8;
})());
check('设计成本 = (材料 + 加工) × 设计费率', (function () {
  const expected = round2((100 + 8) * knit.designRate);
  return knitBreakdown.designCost === expected;
})(), '实际 ' + knitBreakdown.designCost + ' / 设计费率 ' + knit.designRate);
check('知名品牌设计费率 0.25', knit.designRate === 0.25, '实际 ' + knit.designRate);
check('白牌设计费率最低（抄款）', resolveCoefficients({ category: 'apparel_knit', brandTier: 'none' }).designRate === 0.03);
check('奢侈品牌设计费率最高', resolveCoefficients({ category: 'apparel_knit', brandTier: 'luxury' }).designRate === 0.60);
check('品牌溢价 = (材料 + 加工 + 设计) × 溢价率', (function () {
  const base = knitBreakdown.materialCost + knitBreakdown.processingCost + knitBreakdown.designCost;
  return knitBreakdown.brandPremium === round2(base * knit.premiumRate);
})());

line('5. 允许溢出比例由用户决定');
const custom = estimate({
  category: 'apparel_knit',
  brandTier: 'common',
  material: { unitPrice: 100, amount: 1 },
  overflowRatio: 0.8
});
check('用户传入的溢出比例原样生效（不被品类默认值盖掉）',
  custom.coefficients.overflowRatio === 0.8, '实际 ' + custom.coefficients.overflowRatio);
check('用户给 0 时溢出为 0（0 是合法值，不能被默认值替换）',
  estimate({
    category: 'apparel_knit', brandTier: 'common',
    material: { unitPrice: 100, amount: 1 }, overflowRatio: 0
  }).coefficients.overflowRatio === 0);
check('用户给 1（100%）时溢出 = 前四项之和', (function () {
  const r = estimate({
    category: 'apparel_knit', brandTier: 'common',
    material: { unitPrice: 100, amount: 1 }, overflowRatio: 1
  }).breakdown;
  const base = r.materialCost + r.processingCost + r.designCost + r.brandPremium;
  return r.overflow === round2(base);
})());
check('不传时回落到品类默认值',
  estimate({ category: 'apparel_knit', brandTier: 'common', material: { unitPrice: 100, amount: 1 } })
    .coefficients.overflowRatio === 0.5);

line('6. 降级与容错');
const missing = estimate({ name: '未知单品', category: 'apparel_knit', brandTier: 'common' });
check('材料缺失时 degraded = true', missing.degraded === true);
check('材料缺失时不抛错且结构完整',
  typeof missing.priceRange.low === 'number' && missing.disclaimer.length > 0);

const unknown = estimate({
  name: '未来品类', category: 'not_exist', brandTier: 'not_exist',
  material: { unitPrice: 100, amount: 1 }
});
check('未知品类/品牌退默认系数且不抛错',
  unknown.breakdown.total > 0 && unknown.coefficients.categoryLabel === '未分类');
check('用量为 0 时材料成本为 0 且不产生 NaN',
  estimateMaterialCost({ fabricKey: 'cotton_twill', amount: 0, category: 'apparel_knit' }).materialCost === 0);
check('未知面料返回空结果且不抛错',
  estimateMaterialCost({ fabricKey: 'nope', amount: 2 }).materialCost === 0);

line('7. 品牌库：逐品牌带出处，禁止按档位一刀切');
const brands = listBrands();
check('品牌库非空，主流品牌都在', brands.length >= 15, '实际 ' + brands.length + ' 个');
check('每个品牌都带期次与出处', brands.every(function (b) {
  return !!(b.period && b.source);
}), brands.filter(function (b) { return !(b.period && b.source); }).map(function (b) {
  return b.label;
}).join('、') + ' 缺期次或出处');
check('每个品牌毛利率都在 (0,1) 开区间', brands.every(function (b) {
  return b.grossMargin === null || (b.grossMargin > 0 && b.grossMargin < 1);
}));
check('存在官方口径（上市公司定期报告）的品牌', brands.filter(function (b) {
  return b.grade === 'official';
}).length > 0, 'official ' + brands.filter(function (b) {
  return b.grade === 'official';
}).length + ' 个');
check('加价倍率由毛利率派生（波司登主品牌 69.1% → 3.236 倍）', (function () {
  const b = getBrand('bosideng');
  const main = b.series.filter(function (s) { return s.key === 'main'; })[0];
  return main && Math.abs(main.markup - 3.2362) < 0.001;
})(), '实际 ' + JSON.stringify((getBrand('bosideng').series || []).map(function (s) {
  return s.label + '=' + s.markup;
})));
check('同集团不同系列分开记录（波司登主牌 69.1% vs 雪中飞 40.9%，差 28.2 个百分点）', (function () {
  const b = getBrand('bosideng');
  const main = b.series.filter(function (s) { return s.key === 'main'; })[0];
  const snow = b.series.filter(function (s) { return s.key === 'xuezhongfei'; })[0];
  return main && snow && Math.abs((main.grossMargin - snow.grossMargin) - 0.282) < 0.0001;
})());
check('高端与大众品牌的毛利差被保留（极差 > 30 个百分点）', (function () {
  const list = brands.filter(function (b) { return typeof b.grossMargin === 'number'; });
  const hi = Math.max.apply(null, list.map(function (b) { return b.grossMargin; }));
  const lo = Math.min.apply(null, list.map(function (b) { return b.grossMargin; }));
  return hi - lo > 0.3;
})(), '实际极差 ' + (function () {
  const list = brands.filter(function (b) { return typeof b.grossMargin === 'number'; });
  const hi = Math.max.apply(null, list.map(function (b) { return b.grossMargin; }));
  const lo = Math.min.apply(null, list.map(function (b) { return b.grossMargin; }));
  return round4(hi - lo);
})());
check('口径不明（只有经营利润率）的品牌没有混进来', REJECTED_KEYS.every(function (k) {
  return !brands.some(function (b) { return b.key === k; });
}), '被拒名单：' + REJECTED_KEYS.join('、'));
check('查不到的品牌回落到档位，并如实标 estimate', (function () {
  const r = resolveBrand({ brandName: '一个不存在的牌子XYZ' });
  return r.found === false && r.grade === 'estimate';
})());
check('按中文名/别名能匹配到品牌（"波司登" → bosideng）', (function () {
  const r = findBrandByName('波司登');
  return r && r.key === 'bosideng';
})());
check('全量品牌都查得到（中文名回查命中）', brands.every(function (b) {
  const hit = findBrandByName(b.label);
  return hit && hit.key === b.key;
}), brands.filter(function (b) {
  return !findBrandByName(b.label);
}).map(function (b) { return b.label; }).join('、') + ' 回查失败');
check('板块基准有出处且为官方/半官方口径', !!INDUSTRY_BENCHMARK.source && INDUSTRY_BENCHMARK.grade !== 'estimate');

line('8. 价格档：按纤维 × 规格，不是按纤维名一刀切');
const fibers = listFibers();
check('纤维价格表非空', fibers.length > 0, '实际 ' + fibers.length + ' 类纤维');
const allTiers = [];
fibers.forEach(function (f) {
  f.tiers.forEach(function (t) { allTiers.push({ fiber: f.key, tier: t }); });
});
check('规格档数量足够（> 20 档）', allTiers.length > 20, '实际 ' + allTiers.length + ' 档');
check('每个规格档都带出处与期次', allTiers.every(function (x) {
  return !!(x.tier.source && x.tier.period);
}), allTiers.filter(function (x) {
  return !(x.tier.source && x.tier.period);
}).map(function (x) { return x.fiber + '/' + x.tier.key; }).join('、'));
check('官方档（official）必须有实际价格', allTiers.filter(function (x) {
  return x.tier.grade === 'official';
}).every(function (x) {
  return typeof x.tier.unitPrice === 'number' && x.tier.unitPrice > 0;
}));
const officialTiers = allTiers.filter(function (x) { return x.tier.grade === 'official'; }).length;
console.log('        档位分布：official ' + officialTiers + ' / semi ' +
  allTiers.filter(function (x) { return x.tier.grade === 'semi'; }).length + ' / estimate ' +
  allTiers.filter(function (x) { return x.tier.grade === 'estimate'; }).length);
check('缺官方源的纤维被显式登记，没有偷偷填价', (function () {
  const pending = Object.keys(PENDING_FIBERS);
  return pending.length > 0 && pending.every(function (k) {
    return !fibers.some(function (f) { return f.key === k; });
  });
})(), '待补：' + Object.keys(PENDING_FIBERS).join('、'));
check('羽绒：同绒种含绒量越高越贵', (function () {
  const d = getFiberTier('down', 'white_duck_70').unitPrice;
  const c = getFiberTier('down', 'white_duck_80').unitPrice;
  const b = getFiberTier('down', 'white_duck_90').unitPrice;
  const a = getFiberTier('down', 'white_duck_95').unitPrice;
  return d < c && c < b && b < a;
})());
check('羽绒：同含绒量下鹅绒 > 鸭绒、白绒 > 灰绒', (function () {
  return getFiberTier('down', 'white_goose_90').unitPrice >
    getFiberTier('down', 'white_duck_90').unitPrice &&
    getFiberTier('down', 'white_duck_90').unitPrice >
    getFiberTier('down', 'grey_duck_90').unitPrice;
})());
check('棉：长绒棉 > 2129B > 3128B > 2227B', (function () {
  return getFiberTier('cotton', 'extra_long_staple_137').unitPrice >
    getFiberTier('cotton', 'grade_2129B').unitPrice &&
    getFiberTier('cotton', 'grade_2129B').unitPrice >
    getFiberTier('cotton', 'grade_3128B').unitPrice &&
    getFiberTier('cotton', 'grade_3128B').unitPrice >
    getFiberTier('cotton', 'grade_2227B').unitPrice;
})());
check('生丝：6A > 5A > 3A~4A', (function () {
  return getFiberTier('silk', 'silk_6A').unitPrice >
    getFiberTier('silk', 'silk_5A').unitPrice &&
    getFiberTier('silk', 'silk_5A').unitPrice >
    getFiberTier('silk', 'silk_3A_4A').unitPrice;
})());
check('羊绒：细度越细越贵', (function () {
  const a = getFiberTier('cashmere', 'ultra_12_5um').unitPrice;
  const b = getFiberTier('cashmere', 'fine_14_5um').unitPrice;
  const c = getFiberTier('cashmere', 'common_qinghe').unitPrice;
  return a > b && b > c;
})());
check('混纺按成分占比加权（80% 棉 3128B + 20% 涤纶）', (function () {
  const r = estimateBlendUnitPrice([
    { fiber: 'cotton', tier: 'grade_3128B', pct: 0.8 },
    { fiber: 'polyester', tier: 'staple_fiber', pct: 0.2 }
  ]);
  return r.unitPrice === round4(0.8 * 17.37 + 0.2 * 8.63);
})(), '实际 ' + JSON.stringify(estimateBlendUnitPrice([
  { fiber: 'cotton', tier: 'grade_3128B', pct: 0.8 },
  { fiber: 'polyester', tier: 'staple_fiber', pct: 0.2 }
]).unitPrice));
check('成分占比不足 100% 时如实报出，不静默补齐', (function () {
  const r = estimateBlendUnitPrice([
    { fiber: 'cotton', tier: 'grade_3128B', pct: 0.8 },
    { fiber: 'polyester', tier: 'staple_fiber', pct: 0.1 }
  ]);
  return r.pctSum === 0.9;
})());
check('混纺结果标注为近似（混纺有加工溢价）', estimateBlendUnitPrice([
  { fiber: 'cotton', tier: 'grade_3128B', pct: 1 }
]).approximate === true);
check('未知纤维不返回价格（不许拿 0 冒充有效价）', (function () {
  const t = getFiberTier('linen', 'anything');
  return t.unitPrice === null && t.grade === 'missing';
})());
check('辅助数据缺口被显式登记（辅料单价 / 典型单耗）', (function () {
  const auxPending = Object.keys(AUXILIARY_ITEMS).every(function (k) {
    return AUXILIARY_ITEMS[k].unitPrice === null;
  });
  return auxPending && UNIT_CONSUMPTION._pending === true;
})(), '辅料与单耗都还没数据源，必须留空而不是编数');

line('9. 多部位用料（BOM）');
const multi = estimateMaterialCost({
  category: 'apparel_outerwear',
  materials: [
    { part: 'shell', label: '面料', fabricKey: 'cotton_twill', amount: 1.5 },
    { part: 'lining', label: '里料', unitPrice: 6, amount: 1.2 },
    { part: 'trim', label: '辅料', unitPrice: 3.5, amount: 2 }
  ]
});
check('多材料：主料成本 = 各条之和', multi.mainCost === round2(15.6 * 1.5 + 6 * 1.2 + 3.5 * 2),
  '实际 ' + multi.mainCost);
check('多材料：返回明细行，条数对得上', multi.lines.length === 3 && multi.lineCount === 3);
check('多材料：每行都带部位与单价', multi.lines.every(function (l) {
  return !!l.part && typeof l.unitPrice === 'number';
}));

// 交给估价核心的用料数组必须**含辅料**：core 的材料成本是各行求和，
// 漏掉辅料时它只等于主料成本，而设计/品牌/溢出**全以材料为基数** → 系统性低估
// （实测漏一次辅料 = 总额低估 15%），而且不报错、不降级，靠人眼看不出。
const toCore = toValuationMaterials(multi);
const toCoreSum = round2(toCore.reduce(function (s, l) { return s + l.unitPrice * l.amount; }, 0));
check('交给估价核心的用料含辅料：求和 = 材料成本（漏辅料会低估 15%）',
  toCoreSum === multi.materialCost,
  '给 core 合计 ' + toCoreSum + ' vs materialCost ' + multi.materialCost);
check('交给估价核心后，core 算出的材料成本与配置层一致', (function () {
  const b = estimate({
    category: 'apparel_outerwear', brandTier: 'common', materials: toCore
  }).breakdown;
  return b.materialCost === multi.materialCost && b.materialLineCount === toCore.length;
})(), 'core ' + estimate({ category: 'apparel_outerwear', brandTier: 'common', materials: toCore }).breakdown.materialCost
  + ' vs config ' + multi.materialCost);
check('辅料为 0 时不追加空行（否则会被误判成"有取不到价的用料"而降级）',
  toValuationMaterials({ mainCost: 10, auxiliaryCost: 0, materialCost: 10, lines: [{ cost: 10 }] }).length === 1);
check('多材料：混纺部位能按纤维档定价（且经克重换算，不是裸乘）', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_knit',
    materials: [{
      part: 'shell', amount: 0.3, unit: '米',
      fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 0.8 },
        { fiber: 'polyester', tier: 'staple_fiber', pct: 0.2 }]
    }]
  });
  // 针织典型 180 g/㎡ × 1.5m = 0.27 kg/米；0.3 米 → 0.081 kg
  const kg = round4(0.3 * 0.27);
  const unitPrice = round4(0.8 * 17.37 + 0.2 * 8.63);
  return r.lines[0].cost === round2(unitPrice * kg) && r.lines[0].kg === kg;
})(), '实际 ' + JSON.stringify(estimateMaterialCost({
  category: 'apparel_knit',
  materials: [{
    part: 'shell', amount: 0.3, unit: '米',
    fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 0.8 },
      { fiber: 'polyester', tier: 'staple_fiber', pct: 0.2 }]
  }]
}).lines[0]));
check('多材料：某条取不到价时 degraded=true 且给出原因', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_knit',
    materials: [
      { part: 'shell', fabricKey: 'cotton_twill', amount: 1 },
      { part: 'unknown', fiberKey: 'linen', tierKey: 'x', amount: 1 }
    ]
  });
  return r.degraded === true && r.missing.length > 0;
})());
check('core 支持多条用料求和（材料成本 = 各行之和）', (function () {
  const b = estimate({
    category: 'apparel_outerwear', brandTier: 'common',
    materials: [{ unitPrice: 20, amount: 1 }, { unitPrice: 10, amount: 2 }]
  }).breakdown;
  return b.materialCost === 40 && b.materialLineCount === 2;
})());
check('兼容旧单条写法（material 而非 materials）', (function () {
  const b = estimate({
    category: 'apparel_knit', brandTier: 'common',
    material: { unitPrice: 20, amount: 1 }
  }).breakdown;
  return b.materialCost === 20 && b.materialLineCount === 1;
})());
check('品牌库命中时溢价率来自官方毛利率，并带重复计算警告', (function () {
  const r = estimate({
    category: 'apparel_pants', brandKey: 'bosideng', seriesKey: 'main',
    material: { unitPrice: 100, amount: 1 }
  });
  const expect = round4(0.691 / (1 - 0.691));
  return r.coefficients.premiumRateSource === 'brand-gross-margin' &&
    r.doubleCountWarning === true &&
    Math.abs(r.coefficients.premiumRate - expect) < 0.001;
})(), '实际 ' + JSON.stringify({
  source: estimate({
    category: 'apparel_pants', brandKey: 'bosideng', seriesKey: 'main',
    material: { unitPrice: 100, amount: 1 }
  }).coefficients.premiumRateSource,
  rate: estimate({
    category: 'apparel_pants', brandKey: 'bosideng', seriesKey: 'main',
    material: { unitPrice: 100, amount: 1 }
  }).coefficients.premiumRate
}));
check('同品牌不带系列时回落到集团整体口径（波司登 57.2%，不是主牌 69.1%）', (function () {
  const r = estimate({
    category: 'apparel_pants', brandKey: 'bosideng',
    material: { unitPrice: 100, amount: 1 }
  });
  return Math.abs(r.coefficients.premiumRate - round4(0.572 / (1 - 0.572))) < 0.001;
})());
check('不传品牌时仍走档位兜底，不误用品牌库', (function () {
  const c = resolveCoefficients({ category: 'apparel_knit', brandTier: 'known' });
  return c.premiumRateSource === 'tier-fallback' && c.doubleCountRisk === false;
})());

line('10. 单位口径（元/千克 ↔ 米，不许裸乘）');
// 踩过的坑：纤维原料价按千克发布，用量填米，中间没有克重桥就会**静默裸乘**——
// 不报错、不降级，直接给一个没有物理意义的数。这比缺数据更危险。
check('单位换算函数本身：米 → 千克按 gsm × 幅宽', (function () {
  const c = convertAmountToKg(1.6, '米', { gsm: 180, width: 1.5 });
  return c.kgPerMeter === 0.27 && c.kg === round4(1.6 * 0.27);
})(), JSON.stringify(convertAmountToKg(1.6, '米', { gsm: 180, width: 1.5 })));

check('单位换算：克 → 千克', convertAmountToKg(200, '克', {}).kg === 0.2);

check('单位换算：件 与千克不可换算时必须如实标出，不硬套', (function () {
  const c = convertAmountToKg(2, '件', { gsm: 180, width: 1.5 });
  return c.unconvertible === true && c.kg === 0;
})());

check('纤维条按克重换算后成本 ≠ 裸乘（0.3 米混纺）', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_knit',
    materials: [{
      part: 'shell', amount: 0.3, unit: '米',
      fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }]
    }]
  });
  const naked = round2(17.37 * 0.3);   // 裸乘会得到 5.21 —— 这个是错的
  return r.lines[0].cost !== naked && r.lines[0].cost === round2(17.37 * round4(0.3 * 0.27));
})(), '实际 ' + estimateMaterialCost({
  category: 'apparel_knit',
  materials: [{
    part: 'shell', amount: 0.3, unit: '米',
    fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }]
  }]
}).lines[0].cost);

check('羽绒按克计价（200g 90% 白鸭绒）', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_down',
    materials: [{ part: 'filling', amount: 200, unit: '克',
      fibers: [{ fiber: 'down', tier: 'white_duck_90', pct: 1 }] }]
  });
  return r.lines[0].cost === round2(567.48 * 0.2) && r.lines[0].kg === 0.2;
})(), '实际 ' + estimateMaterialCost({
  category: 'apparel_down',
  materials: [{ part: 'filling', amount: 200, unit: '克',
    fibers: [{ fiber: 'down', tier: 'white_duck_90', pct: 1 }] }]
}).lines[0].cost);

check('估算克重被显式标记（specAssumed），不许让用户以为是自己填的', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_knit',
    materials: [{ part: 'shell', amount: 1, unit: '米',
      fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }] }]
  });
  return r.lines[0].specAssumed === true && r.specAssumed === true;
})());

check('用户显式填克重时不再标记为假设', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_knit',
    materials: [{ part: 'shell', amount: 1, unit: '米', gsm: 220, width: 1.6,
      fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }] }]
  });
  return r.lines[0].specAssumed === false &&
    r.lines[0].weightSpec.grade === 'user' &&
    r.lines[0].kg === round4(1 * 220 / 1000 * 1.6);
})());

check('不同品类的典型克重不同（羽绒服面料 ≠ 裤装面料）', (function () {
  const down = resolveWeightSpec({ part: 'shell' }, { category: 'apparel_down' });
  const pants = resolveWeightSpec({ part: 'shell' }, { category: 'apparel_pants' });
  return down.gsm < pants.gsm;
})());

check('面料表路径（元/米）不受单位换算影响', (function () {
  const r = estimateMaterialCost({
    category: 'apparel_shirt',
    materials: [{ part: 'shell', fabricKey: 'cotton_twill', amount: 1.5 }]
  });
  return r.lines[0].cost === round2(15.6 * 1.5) && r.lines[0].kg === undefined;
})());

line('11. 界面契约兼容（改名不许静默弄坏界面）');
// 这几个字段名被 src/screens/ 直接引用，改名前必须先改界面，否则界面显示 undefined
const COEFF_FIELDS = ['categoryLabel', 'brandTierLabel', 'processingFee', 'designRate',
  'premiumRate', 'overflowRatio', 'spread'];
const coeffSample = resolveCoefficients({ category: 'apparel_knit', brandTier: 'common' });
check('resolveCoefficients 的旧字段名一个没少', COEFF_FIELDS.every(function (k) {
  return coeffSample[k] !== undefined;
}), COEFF_FIELDS.filter(function (k) {
  return coeffSample[k] === undefined;
}).join('、') + ' 丢了');

const MATERIAL_FIELDS = ['mainCost', 'auxiliaryCost', 'materialCost', 'fabricLabel', 'unit',
  'unitPrice', 'grade', 'spec', 'note'];
const materialSample = estimateMaterialCost({ fabricKey: 'cotton_twill', amount: 1.5, category: 'apparel_knit' });
check('estimateMaterialCost 的旧字段名一个没少', MATERIAL_FIELDS.every(function (k) {
  return materialSample[k] !== undefined;
}), MATERIAL_FIELDS.filter(function (k) {
  return materialSample[k] === undefined;
}).join('、') + ' 丢了');

const ESTIMATE_FIELDS = ['priceRange', 'breakdown', 'coefficients', 'degraded', 'currency', 'disclaimer'];
const estimateSample = estimate({ category: 'apparel_knit', brandTier: 'common', material: { unitPrice: 100, amount: 1 } });
check('estimate() 的旧字段名一个没少', ESTIMATE_FIELDS.every(function (k) {
  return estimateSample[k] !== undefined;
}), ESTIMATE_FIELDS.filter(function (k) {
  return estimateSample[k] === undefined;
}).join('、') + ' 丢了');

const BREAKDOWN_FIELDS = ['materialCost', 'processingCost', 'designCost', 'brandPremium', 'overflow', 'total'];
check('breakdown 的五段字段一个没少', BREAKDOWN_FIELDS.every(function (k) {
  return estimateSample.breakdown[k] !== undefined;
}), BREAKDOWN_FIELDS.filter(function (k) {
  return estimateSample.breakdown[k] === undefined;
}).join('、') + ' 丢了');

check('面料表字段契约不变（界面按这些字段渲染）', fabrics.every(function (f) {
  return f.key !== undefined && f.label !== undefined && f.unit !== undefined &&
    f.unitPrice !== undefined && f.grade !== undefined && f.spec !== undefined;
}));

line('12. 默认规格档不取极值（否则是系统性高估）');
// 档位表按从贵到便宜排。取"第一个有价的档"= 默认按顶格算：
// 羊绒虚高 223%、羊毛虚高 264%、棉虚高 69%。修正为按价格排序取中位。
const extremeFiber = [];
fibers.forEach(function (f) {
  const tiers = f.tiers.filter(function (t) { return typeof t.unitPrice === 'number' && t.unitPrice > 0; });
  if (tiers.length < 3) return;
  const sorted = tiers.slice().sort(function (a, b) { return a.unitPrice - b.unitPrice; });
  const defKey = getDefaultTierKey(f.key);
  const def = tiers.filter(function (t) { return t.key === defKey; })[0];
  if (!def) { extremeFiber.push(f.key + ' 取不到默认档'); return; }
  // 默认档不许落在最低或最高那一档
  if (def.unitPrice === sorted[0].unitPrice || def.unitPrice === sorted[sorted.length - 1].unitPrice) {
    extremeFiber.push(f.key + ' 默认档 ¥' + def.unitPrice
      + ' 落到了区间端点 [' + sorted[0].unitPrice + '~' + sorted[sorted.length - 1].unitPrice + ']');
  }
});
check('多档纤维的默认档不在价格区间端点（不许默认按顶格或最低算）',
  extremeFiber.length === 0, extremeFiber.join(' | '));

check('单档纤维照常返回唯一档', ['polyester', 'viscose'].every(function (k) {
  const tiers = fibers.filter(function (f) { return f.key === k; })[0].tiers;
  return getDefaultTierKey(k) === tiers[0].key;
}));

check('取不到价的纤维返回 null，不硬凑一个档',
  getDefaultTierKey('不存在的纤维') === null);

// ---------------------------------------------------------------- 13. 服务端价格抓取器
// 全部离线：用真实页面结构造的 fixture 断言解析器，不依赖网络是否可用。

line('13. 服务端价格抓取器（离线解析，不联网）');

const cottonchina = require('../server/sources/cottonchina.js');
const sourceCatalog = require('../server/source-catalog.js');
const FABRIC_CFG = require('../config/fabric.js');

const CC_FIXTURE = [
  '<table>',
  '<tr><td>CC Index 3128B</td><td>更多</td><td>2026-09-24</td><td>17368 元/吨</td><td>-48</td></tr>',
  '<tr><td>CC Index 2227B</td><td>更多</td><td>2026-09-24</td><td>15838 元/吨</td><td>-41</td></tr>',
  '<tr><td>CC Index 2129B</td><td>更多</td><td>2026-09-24</td><td>17697 元/吨</td><td>-56</td></tr>',
  '<tr><td>粘胶短纤</td><td>指数</td><td>14650 元/吨</td><td>0</td></tr>',
  '<tr><td>涤纶短纤</td><td>2026-09-24</td><td>8630 元/吨</td><td>+150</td></tr>',
  '</table>'
].join('');

const ccParsed = cottonchina.parse(CC_FIXTURE);
const ccByTier = {};
ccParsed.records.forEach(function (r) { ccByTier[r.fiber + '.' + r.tier] = r; });

check('棉花信息网解析出 5 条（棉三档 + 粘胶 + 涤纶）',
  ccParsed.records.length === 5, '实际 ' + ccParsed.records.length + ' 条');

check('CC Index 三档映射到 config 的 cotton 档位',
  ['grade_3128B', 'grade_2227B', 'grade_2129B'].every(function (t) {
    return ccByTier['cotton.' + t] !== undefined;
  }));

check('元/吨 → 元/千克 换算正确（17368 元/吨 = 17.368 元/千克）',
  !!ccByTier['cotton.grade_3128B'] && ccByTier['cotton.grade_3128B'].unitPrice === 17.368,
  ccByTier['cotton.grade_3128B'] ? String(ccByTier['cotton.grade_3128B'].unitPrice) : '未解析到');

check('数据期从页面正确提取',
  !!ccByTier['cotton.grade_3128B'] && ccByTier['cotton.grade_3128B'].period === '2026-09-24');

check('价格分级标为 official，不混进估算',
  ccParsed.records.every(function (r) { return r.grade === 'official'; }));

check('抓取器声明的每个 fiber.tier 都能在 config 里找到（否则抓了等于白抓）',
  cottonchina.RULES.every(function (r) {
    return FABRIC_CFG.FIBERS[r.fiber] && FABRIC_CFG.FIBERS[r.fiber].tiers[r.tier];
  }), cottonchina.RULES.filter(function (r) {
    return !(FABRIC_CFG.FIBERS[r.fiber] && FABRIC_CFG.FIBERS[r.fiber].tiers[r.tier]);
  }).map(function (r) { return r.fiber + '.' + r.tier; }).join(' | '));

check('页面缺某个指标时如实进 missing 并带原因，不补假值',
  (function () {
    const partial = cottonchina.parse(
      '<tr><td>CC Index 3128B</td><td>2026-09-24</td><td>17368 元/吨</td></tr>');
    return partial.records.length === 1 && partial.missing.length === 4 &&
      partial.missing.every(function (m) { return !!m.label && !!m.reason; });
  })());

check('完全不相干的页面 → 0 条记录 + 全部进 missing（不编数字）',
  (function () {
    const junk = cottonchina.parse('<html><body><p>该页面今日维护中</p></body></html>');
    return junk.records.length === 0 && junk.missing.length === cottonchina.RULES.length;
  })());

check('探测结论总账覆盖全部源，且每条都带实测说明',
  sourceCatalog.sources.length === 5 && sourceCatalog.sources.every(function (s) {
    return s.key && s.label && s.status && s.note && s.note.length > 20;
  }));

check('未实现的源如实标状态，不许标成 ready',
  sourceCatalog.sources.filter(function (s) { return s.status === 'ready'; }).length === 1);

check('server/ 不会被同步进小程序包（用目录划平台边界）',
  !require('fs').existsSync(require('path').join(__dirname, '..', 'miniprogram', 'server')));

// ---------------------------------------------------------------- 14. 成分占比必须凑齐 100%

line('14. 成分占比必须凑齐 100%（占比不齐 = 单价按缺失比例打折）');

const blendFull = estimateBlendUnitPrice([
  { fiber: 'cotton', tier: 'grade_3128B', pct: 80 },
  { fiber: 'polyester', tier: 'staple_fiber', pct: 20 }
]);
check('合计 100% → 判为平衡', blendFull.balanced === true && blendFull.declaredPct === 100
  && blendFull.unpricedPct === 0,
  'declaredPct=' + blendFull.declaredPct + ' balanced=' + blendFull.balanced);

const blendShort = estimateBlendUnitPrice([
  { fiber: 'cotton', tier: 'grade_3128B', pct: 80 }
]);
check('合计 80% → 判为不平衡，并报出真实合计（不补齐、不改口）',
  blendShort.balanced === false && blendShort.declaredPct === 80,
  'declaredPct=' + blendShort.declaredPct);

check('容差 ±1% 内的 99% / 101% 视为合格（国标标称值本身有允差）',
  estimateBlendUnitPrice([{ fiber: 'cotton', tier: 'grade_3128B', pct: 99 }]).balanced === true
  && estimateBlendUnitPrice([{ fiber: 'cotton', tier: 'grade_3128B', pct: 101 }]).balanced === true);

check('合计 120% → 同样判不平衡（多填和少填一样错）',
  estimateBlendUnitPrice([
    { fiber: 'cotton', tier: 'grade_3128B', pct: 100 },
    { fiber: 'polyester', tier: 'staple_fiber', pct: 20 }
  ]).balanced === false);

// 关键：不平衡必须**降级不给单价**。老实现会照算，等于填 80% 就按八折出价，
// 而且不报错、不降级 —— 界面上看起来完全正常
const shortCost = estimateMaterialCost({
  category: 'apparel_knit',
  materials: [{ part: 'shell', amount: 200, unit: '克',
    fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 80 }] }]
});
check('占比不齐的用料直接降级、不给单价（不静默按 80% 打折）',
  shortCost.degraded === true && shortCost.materialCost === 0 && /100%/.test(shortCost.lines[0].reason),
  'materialCost=' + shortCost.materialCost + ' reason=' + shortCost.lines[0].reason);

check('对照组：同样的用量、占比填成 100% 就照常出价（证明降级只由占比触发）',
  estimateMaterialCost({
    category: 'apparel_knit',
    materials: [{ part: 'shell', amount: 200, unit: '克',
      fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 100 }] }]
  }).degraded === false);

// 「其他纤维」——国标允许的合法标注，必须能凑满 100%，但不参与定价
const withOther = estimateBlendUnitPrice([
  { fiber: 'cotton', tier: 'grade_3128B', pct: 95 },
  { fiber: '__other__', pct: 5 }
]);
check('「其他纤维」计入成分合计 → 95% + 5% 仍判为合格（否则用户无路可走）',
  withOther.balanced === true && withOther.declaredPct === 100,
  'declaredPct=' + withOther.declaredPct + ' balanced=' + withOther.balanced);
check('「其他纤维」不参与定价，但如实报出未定价占比',
  withOther.pricedPct === 95 && withOther.unpricedPct === 5
  && withOther.unitPrice === round4(0.95 * 17.37),
  'pricedPct=' + withOther.pricedPct + ' unpricedPct=' + withOther.unpricedPct);
check('「其他纤维」取不到价，且理由说得清（不是兜底的"该纤维不在价格表中"）',
  (function () {
    const t = getFiberTier('__other__');
    return t.unitPrice === null && t.grade === 'missing' && /国标/.test(t.reason);
  })());

check('取不到价的成分（亚麻）计入**声明**合计，不会把 100% 误判成 50%',
  (function () {
    const r = estimateBlendUnitPrice([
      { fiber: 'linen', pct: 50 },
      { fiber: 'cotton', tier: 'grade_3128B', pct: 50 }
    ]);
    return r.balanced === true && r.declaredPct === 100 && r.unpricedPct === 50 && r.missing.length === 1;
  })());

// 成分里有没价的 → 单价偏低。不算错误，但必须显式警示，不许让它看起来正常
const linenBlend = estimateMaterialCost({
  category: 'apparel_knit',
  materials: [{ part: 'shell', amount: 200, unit: '克',
    fibers: [{ fiber: 'linen', pct: 50 }, { fiber: 'cotton', tier: 'grade_3128B', pct: 50 }] }]
});
check('成分里有没价的（亚麻 50%）→ 单价偏低必须显式警示，不许静默',
  linenBlend.pctWarnings.length === 1 && /偏低/.test(linenBlend.pctWarnings[0]),
  'pctWarnings=' + JSON.stringify(linenBlend.pctWarnings));

// ---------------------------------------------------------------- 15. 纤维覆盖度

/**
 * 守上一次踩的坑：识别层能认出 16 种纤维，config 只登记了 14 种，
 * 剩下 2 种（莫代尔、醋酸纤维）既没价也没登记 ——
 * 用户看到的是"识别到了，但价格表里没有"，而且理由只会是兜底那句
 * "该纤维不在价格表中"，说不清到底为什么。
 *
 * 所以规则是：**识别得到的每一种纤维，价格层都必须有落点**
 * （有价 → FIBERS；无价 → PENDING_FIBERS 并写明原因）。
 * 加识别词时忘了补登记，这一组会红。
 */
line('15. 纤维覆盖度（识别得到的每一种，价格层都要有落点）');

const recognizeSvc = require('../services/recognize.js');
const pricedFiberKeys = listFibers().map(function (f) { return f.key; });
const pendingKeys = Object.keys(PENDING_FIBERS);

function hasHome(key) {
  return pricedFiberKeys.indexOf(key) >= 0 || pendingKeys.indexOf(key) >= 0;
}

const noHome = [];
const seenFibers = {};
recognizeSvc.FIBER_TERMS.forEach(function (t) {
  seenFibers[t.fiber] = true;
  if (t.fiber === '__other__') return; // 占位，不是纤维
  if (!hasHome(t.fiber)) noHome.push(t.fiber);
});
check('水洗标词典里每种纤维都有落点：有价（FIBERS）或已登记缺源（PENDING_FIBERS）',
  noHome.length === 0, '既无价也没登记：' + noHome.join('、'));

const hintNoHome = [];
recognizeSvc.FABRIC_HINTS.forEach(function (h) {
  (h.fibers || []).forEach(function (f) {
    seenFibers[f.fiber] = true;
    if (!hasHome(f.fiber)) hintNoHome.push(f.fiber);
  });
});
check('商品名线索表里每种纤维同样有落点', hintNoHome.length === 0, hintNoHome.join('、'));

check('两张表合起来覆盖常见服装纤维（≥ 18 种），不是只有棉毛丝麻',
  Object.keys(seenFibers).length >= 18, '实际 ' + Object.keys(seenFibers).length + ' 种');

check('已登记缺源的纤维确实取不到价（登记不是摆设，也没人偷偷往里填数）',
  pendingKeys.every(function (k) { return getFiberTier(k, null).unitPrice === null; }),
  pendingKeys.filter(function (k) { return getFiberTier(k, null).unitPrice !== null; }).join('、'));

// ---------------------------------------------------------------- 16. 用户不知道的部位

line('16. 用户不知道的部位（里料 / 填充）由系统补齐，且不许漏算');

const autoKnit = autoMaterialInputs('apparel_knit');
const autoDown = autoMaterialInputs('apparel_down');
const autoPartsOf = function (list) {
  return list.map(function (x) { return x.part; }).sort().join(',');
};

check('没有里料的品类（T 恤）不凭空生成部位（不是"按 0 计入"，是压根没有）',
  autoKnit.length === 0, '生成了：' + autoPartsOf(autoKnit));

check('有里料/填充的品类（羽绒服）按 UNIT_WEIGHT.byCategory 补齐',
  autoPartsOf(autoDown) === 'filling,lining', '实际：' + autoPartsOf(autoDown));

check('补齐的每个部位都带依据（界面要如实汇报"这几块钱是怎么来的"）',
  autoDown.every(function (x) { return !!x.basis && !!x.basisNote; }),
  JSON.stringify(autoDown.map(function (x) { return x.basis; })));

check('补齐的档位来自 getDefaultTierKey（取中位），不是手填的顶格档',
  autoDown.every(function (x) {
    return x.fibers.every(function (f) { return f.tier === getDefaultTierKey(f.fiber); });
  }), JSON.stringify(autoDown.map(function (x) { return x.fibers[0].tier; })));

check('补齐的纤维都取得到价 —— 自动填的必须算得出钱，否则等于没填',
  autoDown.every(function (x) {
    return x.fibers.every(function (f) { return getFiberTier(f.fiber, f.tier).unitPrice !== null; });
  }), JSON.stringify(autoDown.map(function (x) { return x.fibers[0].fiber; })));

const autoShellInput = {
  part: 'shell', amount: 220, unit: '克',
  fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 100 }]
};
const costShellOnly = estimateMaterialCost({
  category: 'apparel_down', materials: [autoShellInput]
});
const costFilled = estimateMaterialCost({
  category: 'apparel_down', materials: [autoShellInput].concat(autoDown)
});
check('补齐的部位真的进了材料成本（羽绒服只算面料会漏掉绝大部分成本）',
  costFilled.materialCost > costShellOnly.materialCost * 5,
  '只算面料 ¥' + costShellOnly.materialCost + ' → 补齐后 ¥' + costFilled.materialCost
    + '（' + (costFilled.materialCost / costShellOnly.materialCost).toFixed(0) + ' 倍）');

check('材料成本 = 各条用料之和（补齐后仍不许有"算了但没进总额"的行）',
  round2(costFilled.lines.reduce(function (s, l) { return s + l.cost; }, 0)) === costFilled.mainCost,
  JSON.stringify(costFilled.lines.map(function (l) { return l.cost; })));

const autoFromLabel = autoMaterialInputs('apparel_down', {
  lining: [{ fiber: 'viscose', tier: null, pct: 100 }]
}).filter(function (x) { return x.part === 'lining'; })[0];
check('水洗标写了里料 → 用标签的纤维（法定标注优先于行业常见值）',
  autoFromLabel.fibers[0].fiber === 'viscose' && autoFromLabel.basis === 'label',
  JSON.stringify(autoFromLabel));

check('标签没给档位时也要落定到具体档（getFiberTier 拿到 null 会判"规格档缺失"，不是取默认）',
  autoFromLabel.fibers[0].tier === getDefaultTierKey('viscose'),
  '实际 ' + autoFromLabel.fibers[0].tier);

check('部位中文名只有一处真源（界面汇报与配置层同一份）',
  materialPartLabel('lining') === '里料' && materialPartLabel('filling') === '填充',
  materialPartLabel('lining') + '/' + materialPartLabel('filling'));

line('17. 只做衣物（鞋包已移出，且必须如实告知）');

// 直接读真源表：判断"这个品类有没有落点"必须看原始表，
// 走 resolveTypicalWeight() 是看不出区别的 —— 它查不到就静默给兜底默认值。
const fabricTables = require('../config/fabric.js');
const rec = require('../services/recognize.js');

let profileGap = [];
categories.forEach(function (c) {
  if (!fabricTables.FABRIC_WEIGHT.byCategory[c.key]) profileGap.push(c.label + '·面料克重');
  if (!fabricTables.UNIT_WEIGHT.byCategory[c.key]) profileGap.push(c.label + '·单件重量');
  if (typeof fabricTables.AUXILIARY_RATIO[c.key] !== 'number') profileGap.push(c.label + '·辅料比例');
});
check('每个开放品类在三张表里都有落点',
  profileGap.length === 0,
  '缺：' + profileGap.join('、') + '（缺了不会报错，会静默走兜底默认值）');

// 不做的品类：**不许静默**。命中就必须给出说明，且不许再往下推任何线索 ——
// "帆布鞋"会从"帆布"推出棉 100%，用户很可能就拿这件鞋按衣物表单算完。
const blockedCases = ['运动鞋', '帆布鞋', '真皮皮鞋', '双肩包', '真皮手提包', '钱包'];
const silentBlock = [];
const leakedHint = [];
blockedCases.forEach(function (text) {
  const r = rec.recognizeByText(text);
  if (!r.unsupportedNote) silentBlock.push(text);
  if (r.fiberHints.length > 0 || r.fabricKey || r.category) {
    leakedHint.push(text + ' → ' + JSON.stringify({
      category: r.category, fabricKey: r.fabricKey,
      fibers: r.fiberHints.map(function (h) { return h.fiber; })
    }));
  }
});
check('识别到鞋 / 包必须给出"暂不支持"的说明，不许静默无反应',
  silentBlock.length === 0, '没给说明：' + silentBlock.join('、'));
check('不做的品类不许漏出任何线索（否则会顺着衣物表单算出像样的错数）',
  leakedHint.length === 0, leakedHint.join('；'));

// 反向：衣物词不能被"不支持"误伤
const clothesCases = ['纯棉T恤', '羊绒大衣', '羽绒服', '真丝连衣裙', '牛仔裤', '西装', '羊毛围巾'];
const falseBlock = clothesCases.filter(function (text) {
  return rec.recognizeByText(text).unsupportedNote;
});
check('衣物词不会被"暂不支持"误伤', falseBlock.length === 0, falseBlock.join('、'));

// 两张表的词不许重叠：出现在"不做"里的词，不能同时出现在"做"里
const unsupportedWords = [];
rec.UNSUPPORTED_CATEGORIES.forEach(function (u) {
  u.words.forEach(function (w) { unsupportedWords.push(w); });
});
const overlap = [];
rec.CATEGORY_RULES.forEach(function (rule) {
  rule.words.forEach(function (w) {
    if (unsupportedWords.indexOf(w) >= 0) overlap.push(rule.category + ' / ' + w);
  });
});
check('"做的品类"与"不做的品类"两张词表不重叠',
  overlap.length === 0, overlap.join('、'));

console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项未通过'));
process.exit(failed === 0 ? 0 : 1);

function round2(v) {
  return Math.round(v * 100) / 100;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

// 中文在终端占 2 列，按显示宽度补空格才对得齐
function pad(text, width) {
  let display = 0;
  for (let i = 0; i < text.length; i += 1) {
    display += text.charCodeAt(i) > 0x2e80 ? 2 : 1;
  }
  let out = text;
  while (display < width) {
    out += ' ';
    display += 1;
  }
  return out;
}
