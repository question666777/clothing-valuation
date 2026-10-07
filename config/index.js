const {
  DEFAULT_COEFFICIENTS,
  CATEGORY_COEFFICIENTS,
  BRAND_TIERS,
  DEFAULT_BRAND_TIER
} = require('./coefficients.js');
const {
  PRICE_SNAPSHOT,
  FIBERS,
  PENDING_FIBERS,
  FABRICS,
  FABRIC_CATEGORY,
  FABRIC_SPEC_DEFAULT,
  FABRIC_WEIGHT,
  FABRIC_WEIGHT_KNOWN,
  UNIT_WEIGHT,
  AUXILIARY_RATIO,
  DEFAULT_AUXILIARY_RATIO,
  AUXILIARY_ITEMS,
  UNIT_CONSUMPTION
} = require('./fabric.js');
const {
  BRAND_SNAPSHOT,
  INDUSTRY_BENCHMARK,
  BRANDS,
  BRAND_CATEGORY,
  REJECTED_BRANDS,
  markupFrom,
  premiumRateFrom
} = require('./brands.js');

/** MVP 开放的品类（当前为服装服饰子类） */
function listCategories() {
  return Object.keys(CATEGORY_COEFFICIENTS).map(function (key) {
    return { key: key, label: CATEGORY_COEFFICIENTS[key].label };
  });
}

function listBrandTiers() {
  return Object.keys(BRAND_TIERS).map(function (key) {
    return { key: key, label: BRAND_TIERS[key].label };
  });
}

/** 界面用：带数据等级（official / semi / estimate），便于如实提示价格可信度 */
function listFabrics() {
  return Object.keys(FABRICS).map(function (key) {
    const f = FABRICS[key];
    const cat = FABRIC_CATEGORY[key] || {};
    return {
      key: key,
      label: f.label,
      unit: f.unit,
      unitPrice: f.unitPrice,
      grade: f.grade,
      spec: f.spec || '',
      source: f.source || '',
      period: f.period || '',
      fibers: f.fibers || [],
      note: f.note || f.source || '',
      // 适用品类是导航元数据，缺登记 → null，由 groupByCategory 视为全品类适用。
      // **不许因为漏登记就把它从列表里藏掉** —— 那会让用户明明有这块布却选不到
      categories: Array.isArray(cat.categories) ? cat.categories : null,
      focus: cat.focus || ''
    };
  });
}

/**
 * 按当前品类把「可选项」分组排序 —— 适合本类的在前，其余收在后面。
 *
 * 【为什么不直接过滤掉】品牌与面料都跨品类：波司登出过 T 恤、纱卡既做工装裤
 * 也做夹克。硬过滤会让用户找不到自己手上那件东西对应的选项，
 * 还会以为是我们的数据不全 —— 那比列表长一点糟得多。
 *
 * 【为什么不在这里做 UI】返回的是两个数组，怎么摆由界面决定；
 * 判据（哪些算"适合本类"）只此一份，避免界面和配置层各写一套、迟早漂移。
 *
 * 【不许丢项】primary.length + others.length 必须等于入参长度 ——
 * 掉一个就是静默地少给用户一个选项。校验脚本守着这条。
 */
function groupByCategory(items, categoryKey) {
  const all = Array.isArray(items) ? items : [];
  const primary = [];
  const others = [];
  all.forEach(function (it) {
    const cats = it && it.categories;
    // categories 为空/null → 全品类适用（快时尚、基础款这类本来就全做）
    const fitsAll = !Array.isArray(cats) || cats.length === 0;
    if (fitsAll || cats.indexOf(categoryKey) >= 0) primary.push(it);
    else others.push(it);
  });
  return { primary: primary, others: others, category: categoryKey };
}

function getFabric(fabricKey) {
  return FABRICS[fabricKey] || null;
}

function getAuxiliaryRatio(categoryKey) {
  return AUXILIARY_RATIO[categoryKey] || DEFAULT_AUXILIARY_RATIO;
}

// ---------------------------------------------------------------- 纤维规格档

function listFibers() {
  return Object.keys(FIBERS).map(function (key) {
    const f = FIBERS[key];
    return {
      key: key,
      label: f.label,
      unit: f.unit,
      note: f.note || '',
      tiers: Object.keys(f.tiers).map(function (t) {
        const tier = f.tiers[t];
        return {
          key: t,
          label: tier.label,
          spec: tier.spec || '',
          unitPrice: tier.unitPrice,
          grade: tier.grade,
          source: tier.source || '',
          period: tier.period || '',
          officialQuote: tier.officialQuote || ''
        };
      })
    };
  });
}

/**
 * 取某一纤维某一规格档的单价。
 * 取不到时返回 grade 'missing' 且 unitPrice 为 null —— **绝不用 0 冒充有效价格**。
 */
function getFiberTier(fiberKey, tierKey) {
  if (fiberKey === OTHER_FIBER.key) {
    return {
      fiberKey: fiberKey,
      tierKey: null,
      unitPrice: null,
      grade: 'missing',
      label: OTHER_FIBER.label,
      reason: '「其他纤维」是国标允许的合法标注，但它本身不是一个可查价的纤维 —— '
        + '这部分占比无法定价，会如实标注为"未计入"，不拿 0 冒充有效价格'
    };
  }
  const fiber = FIBERS[fiberKey];
  if (!fiber) {
    const pending = PENDING_FIBERS[fiberKey];
    return {
      fiberKey: fiberKey,
      tierKey: tierKey || null,
      unitPrice: null,
      grade: 'missing',
      label: pending ? pending.label : fiberKey,
      reason: pending ? pending.reason : '该纤维不在价格表中'
    };
  }
  const tier = tierKey ? fiber.tiers[tierKey] : null;
  if (!tier) {
    return {
      fiberKey: fiberKey,
      tierKey: tierKey || null,
      unitPrice: null,
      grade: 'missing',
      label: fiber.label,
      reason: '该纤维的规格档缺失：' + (tierKey || '(未指定)')
    };
  }
  return {
    fiberKey: fiberKey,
    tierKey: tierKey,
    unitPrice: tier.unitPrice,
    grade: tier.grade,
    label: tier.label,
    spec: tier.spec || '',
    unit: fiber.unit,
    source: tier.source || '',
    period: tier.period || ''
  };
}

/**
 * 取某纤维的**代表档**：按价格排序后取中位，不是取表里第一个。
 *
 * 用途是把识别结果落档 —— 水洗标只写"棉 100%"，不写是长绒棉还是细绒棉，
 * 得由这里挑一个具体档，界面再允许用户改到更准的档。
 *
 * 【为什么不能取第一个有价的档】档位表是按**从贵到便宜**排的，取第一个
 * 等于默认按顶格算，是系统性高估。实测各纤维的实际偏差：
 *   羊绒 默认 1000 元/kg，区间 310~1000 → 虚高 223%
 *   羊毛 默认  160 元/kg，区间  44~160 → 虚高 264%
 *   棉   默认 26.72 元/kg，区间 15.84~26.72 → 虚高 69%
 * 取中位让最大偏差对称分布，两端都不至于离谱。
 *
 * 【它仍然只是默认值】档位没定就是没定，界面必须把"档位未确定"如实带出去
 * 让用户改 —— 中位数是**算法**，不是"行业最常见档"（那个没有出处）。
 */
function getDefaultTierKey(fiberKey) {
  const fiber = FIBERS[fiberKey];
  if (!fiber) return null;
  const keys = Object.keys(fiber.tiers);
  const priced = keys.filter(function (k) {
    const t = fiber.tiers[k];
    return typeof t.unitPrice === 'number' && t.unitPrice > 0;
  });
  if (priced.length === 0) return keys.length > 0 ? keys[0] : null;

  const sorted = priced.slice().sort(function (a, b) {
    return fiber.tiers[a].unitPrice - fiber.tiers[b].unitPrice;
  });
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * 「其他纤维 / 未标明成分」—— 不是一种纤维，是一个**合法但无价**的占位。
 *
 * GB/T 29862 允许：两种以上各 ≤5% 且合计 ≤15% 时，可集中标为"其他纤维"；
 * ≤0.5% 的可不计入。所以水洗标上真的会出现「其他纤维 5%」这种东西 ——
 * 界面必须给得出这个选项，否则用户为了凑 100% 只能瞎填一个纤维，那是更坏的结果。
 *
 * 处理原则：
 *   - 它的占比**计入成分合计** —— 否则用户永远凑不到 100%，会被校验卡死；
 *   - 但它**不参与定价**，如实记为"未定价"，不许拿别的纤维顶替、也不许拿 0 当有效价；
 *   - 因此含它的混纺单价会**偏低**，这个偏差必须显式告诉用户，不能吞掉。
 */
const OTHER_FIBER = { key: '__other__', label: '其他纤维 / 未标明' };

/**
 * 成分合计的容差（百分点）。三处必须一致，否则会出现"界面说合格、配置层判不合格"：
 *   - 这里（配置层定价）
 *   - services/recognize.js 的水洗标解析
 *   - miniprogram/pages/index（界面实时提示与提交拦截）
 * 容差来源：国标标称值本身有法定允差（≤10% 允差 3 个百分点），±1% 是标称舍入。
 */
const PCT_TOLERANCE = 1;

/**
 * 混纺部位单价 = Σ(成分占比 × 该纤维该档单价)，单位随纤维单位（元/千克）。
 *
 * 【是近似】混纺本身有加工溢价（混纺比纯纺贵），加权平均会低估；
 * 且成分标称值有法定允差（≤10% 允差 3 个百分点）。返回值会把这两点如实带出去。
 *
 * 【两个占比必须分开】declaredPct 是用户声明的合计（判"凑够 100% 没有"用），
 * pricedPct 是真正参与定价的合计。二者不等时单价是**系统性偏低**的，
 * 必须带 warning 出去 —— 老实现只报 pctSum 一项，界面看到的"合计 100%"
 * 有可能是"声明 100%、其中 30% 没价"。
 */
function estimateBlendUnitPrice(fibers) {
  const list = Array.isArray(fibers) ? fibers : [];
  const missing = [];
  const unpriced = [];
  let total = 0;
  // 内部一律用**比例**累计（toRatio 出来的就是比例），对外再换成百分点 ——
  // 混用两套单位是这类校验最容易犯的错：1 既可能是 100% 也可能是 1%
  let declaredRatio = 0;
  let pricedRatio = 0;
  let hasEstimate = false;

  list.forEach(function (item) {
    const ratio = toRatio(item && item.pct);
    if (ratio <= 0) return;
    declaredRatio += ratio;

    const key = item && item.fiber;
    if (key === OTHER_FIBER.key) {
      unpriced.push({ fiber: OTHER_FIBER.key, label: OTHER_FIBER.label, pct: round4(ratio * 100) });
      return;
    }

    const tier = getFiberTier(key, item && item.tier);
    if (tier.unitPrice === null) {
      // 用价格层给的 label（登记过缺源的会给出中文名，如"亚麻"），
      // 拿不到才退回 key —— 警示文案是给用户看的，不该出现 'linen' 这种内部键
      const label = tier.label
        || ((key || '未知纤维') + (item && item.tier ? '/' + item.tier : ''));
      missing.push(label);
      // 取不到价的成分**计入声明合计**：它确实是这件衣服的成分之一，
      // 只是我们没价。不这么记，用户填「亚麻50% 棉50%」会被误判成"只填了 50%"
      unpriced.push({ fiber: key, label: label, pct: round4(ratio * 100) });
      return;
    }

    pricedRatio += ratio;
    total += ratio * tier.unitPrice;
    if (tier.grade !== 'official') hasEstimate = true;
  });

  const declaredPct = round4(declaredRatio * 100);
  const pricedPct = round4(pricedRatio * 100);
  const unpricedPct = round4(declaredPct - pricedPct);
  const balanced = Math.abs(declaredPct - 100) <= PCT_TOLERANCE;

  const notes = [];
  if (!balanced) {
    notes.push('成分合计 ' + declaredPct + '%，不是 100%（容差 ±' + PCT_TOLERANCE + '%）'
      + '—— 按标称值原样计算，未做补齐');
  }
  if (unpricedPct > 0) {
    notes.push('其中 ' + unpricedPct + '% 无价格档（'
      + unpriced.map(function (u) { return u.label; }).join('、')
      + '），单价只按可定价的 ' + pricedPct + '% 加权，**偏低**');
  }

  return {
    unitPrice: pricedRatio > 0 ? round4(total) : 0,
    // pctSum 保留旧语义（可定价占比的比例形式，0.9 = 90%），校验脚本在用
    pctSum: round4(pricedRatio),
    declaredPct: declaredPct,
    pricedPct: pricedPct,
    unpricedPct: unpricedPct,
    balanced: balanced,
    missing: missing,
    unpriced: unpriced,
    grade: pricedRatio === 0 ? 'missing' : ((hasEstimate || unpricedPct > 0) ? 'estimate' : 'official'),
    approximate: true,
    note: notes.length > 0
      ? notes.join('；')
      : '混纺按成分占比加权，是近似值（混纺有加工溢价，加权会低估）'
  };
}

// ---------------------------------------------------------------- 品牌库

function listBrands() {
  return Object.keys(BRANDS).map(function (key) {
    return summarizeBrand(key);
  });
}

function summarizeBrand(brandKey) {
  const b = BRANDS[brandKey];
  if (!b) return null;
  const markup = markupFrom(b.grossMargin);
  const cat = BRAND_CATEGORY[brandKey] || {};
  return {
    key: brandKey,
    label: b.label,
    company: b.company || '',
    listing: b.listing || '',
    tier: b.tier || DEFAULT_BRAND_TIER,
    aliases: b.aliases || [],
    grossMargin: typeof b.grossMargin === 'number' ? b.grossMargin : null,
    markup: markup,
    premiumRate: premiumRateFrom(b.grossMargin),
    period: b.period || '',
    source: b.source || '',
    grade: b.grade || 'estimate',
    note: b.note || '',
    // 主营品类与业务构成（导航元数据，非价格数据）。缺登记 → null，
    // 由 groupByCategory 视为全品类适用 —— 不许因为漏登记就把品牌藏掉
    categories: Array.isArray(cat.categories) ? cat.categories : null,
    focus: cat.focus || '',
    series: b.series
      ? Object.keys(b.series).map(function (s) {
        const item = b.series[s];
        return {
          key: s,
          label: item.label,
          grossMargin: typeof item.grossMargin === 'number' ? item.grossMargin : null,
          markup: markupFrom(item.grossMargin),
          premiumRate: premiumRateFrom(item.grossMargin),
          period: item.period || b.period || '',
          grade: item.grade || b.grade || 'estimate'
        };
      })
      : []
  };
}

function getBrand(brandKey) {
  return summarizeBrand(brandKey);
}

/**
 * 按名称/别名找品牌（给识别结果用），大小写、空格与标点不敏感。
 *
 * 两轮匹配，避免短别名误命中：
 *   1. 全等 —— 归一化后完全相同
 *   2. 包含 —— 只在别名长度 ≥ 4 时启用，且取**最长**命中
 * 踩过的坑：'RalphLauren' 里含 'HLA'，只做包含匹配会把拉夫劳伦认成海澜之家。
 */
const MIN_FUZZY_ALIAS_LENGTH = 4;

function normalizeBrandName(value) {
  return String(value || '').replace(/[\s\-_.·]/g, '').toLowerCase();
}

function findBrandByName(name) {
  const needle = normalizeBrandName(name);
  if (!needle) return null;

  const keys = Object.keys(BRANDS);

  for (let i = 0; i < keys.length; i += 1) {
    const pool = [BRANDS[keys[i]].label].concat(BRANDS[keys[i]].aliases || []);
    for (let j = 0; j < pool.length; j += 1) {
      if (normalizeBrandName(pool[j]) === needle) {
        return summarizeBrand(keys[i]);
      }
    }
  }

  let bestKey = null;
  let bestLength = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const pool = [BRANDS[keys[i]].label].concat(BRANDS[keys[i]].aliases || []);
    for (let j = 0; j < pool.length; j += 1) {
      const candidate = normalizeBrandName(pool[j]);
      if (candidate.length < MIN_FUZZY_ALIAS_LENGTH) continue;
      if (needle.indexOf(candidate) >= 0 && candidate.length > bestLength) {
        bestKey = keys[i];
        bestLength = candidate.length;
      }
    }
  }
  return bestKey ? summarizeBrand(bestKey) : null;
}

/**
 * 从一段**商品描述**里找出提到的品牌 —— 与 findBrandByName 的分工：
 *   findBrandByName  输入是"品牌名本身"（用户填的品牌栏），模糊匹配要求别名 ≥4 字
 *   findBrandMention 输入是"一整句商品名"，所以判据必须另立一套（见下）
 *
 * 为什么不能直接用上面那个：MIN_FUZZY_ALIAS_LENGTH = 4 挡住了 "HLA" 命中
 * "RalphLauren" 那类误伤，但也让「爱马仕羊绒大衣」匹配不到「爱马仕」（3 字）——
 * 而商品名里出现的恰恰是这种品牌正名。
 *
 * 所以这里的判据反过来：**只用品牌的正名（label）做子串匹配，完全不碰 aliases**。
 * 正名是权威写法（爱马仕 / 海澜之家 / 李宁 / H&M），几乎不会出现在不相干的词里；
 * 而 aliases 里塞着 "HLA" / "HM" / "361" 这种短 ASCII 串，拿去做子串匹配必然误伤。
 * 命中多个时取最长的（「江南布衣」优先于其中任何更短的重叠）。
 */
function findBrandMention(text) {
  const haystack = normalizeBrandName(text);
  if (!haystack) return null;

  const keys = Object.keys(BRANDS);
  let bestKey = null;
  let bestLength = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const label = normalizeBrandName(BRANDS[keys[i]].label);
    if (!label) continue;
    if (haystack.indexOf(label) >= 0 && label.length > bestLength) {
      bestKey = keys[i];
      bestLength = label.length;
    }
  }
  return bestKey ? summarizeBrand(bestKey) : null;
}

/**
 * 解析品牌 → 系数。品牌查得到就用官方毛利率派生的费率，
 * 查不到就回落到档位（并标 estimate）。
 *
 * 【口径警告】毛利率派生的 premiumRate 是"零售价 ÷ 出厂成本 − 1"的**总加价率**，
 * 里面已经含了渠道费用与利润。直接当模型里的"品牌溢价"会与"允许溢出"重复计算。
 * 所以返回值带 doubleCountRisk 标记，界面必须如实说明，见 AGENTS.md 9.1。
 */
function resolveBrand(brandRef) {
  const input = brandRef || {};
  const brandKey = input.brandKey || null;
  const seriesKey = input.seriesKey || null;
  let brand = brandKey ? BRANDS[brandKey] : null;
  if (!brand) brand = findBrandByName(input.brandName);
  if (!brand) {
    return {
      found: false,
      key: null,
      label: input.brandName || '',
      tier: input.brandTier && BRAND_TIERS[input.brandTier] ? input.brandTier : DEFAULT_BRAND_TIER,
      premiumRate: null,
      premiumRateSource: 'none',
      doubleCountRisk: false,
      grade: 'estimate',
      note: '品牌库中查不到该品牌，溢价率将回落到档位估算'
    };
  }

  const brandKeyResolved = Object.keys(BRANDS).filter(function (k) { return BRANDS[k] === brand; })[0];
  const series = seriesKey && brand.series ? brand.series[seriesKey] : null;
  const grossMargin = series && typeof series.grossMargin === 'number'
    ? series.grossMargin
    : brand.grossMargin;

  if (typeof grossMargin !== 'number') {
    return {
      found: true,
      key: brandKeyResolved,
      label: brand.label + (series ? ' · ' + series.label : ''),
      tier: brand.tier || DEFAULT_BRAND_TIER,
      premiumRate: null,
      premiumRateSource: 'missing',
      doubleCountRisk: false,
      grade: 'estimate',
      note: '该品牌/系列未披露毛利率，溢价率回落到档位估算'
    };
  }

  return {
    found: true,
    key: brandKeyResolved,
    seriesKey: series ? seriesKey : null,
    label: brand.label + (series ? ' · ' + series.label : ''),
    tier: brand.tier || DEFAULT_BRAND_TIER,
    grossMargin: grossMargin,
    markup: markupFrom(grossMargin),
    premiumRate: premiumRateFrom(grossMargin),
    premiumRateSource: 'brand-gross-margin',
    doubleCountRisk: true,
    grade: (series && series.grade) || brand.grade || 'estimate',
    period: (series && series.period) || brand.period || '',
    source: brand.source || '',
    note: 'premiumRate 由官方毛利率派生，是**总加价率**（含渠道费用），与"允许溢出"存在重复计算风险'
  };
}

// ---------------------------------------------------------------- 单位换算

/**
 * 可用部位（界面与定价共用一份定义，避免两边各叫一个名）。
 *
 * 默认单位是**克**：纤维原料价一律按千克（进而按克）发布，
 * 用料按克填报 → 克 ÷ 1000 就是千克，**中间不需要任何假设**。
 * 若改按「米」填，就必须先假定克重与幅宽才能换算（见 resolveWeightSpec），
 * 而那两个假设本身就是误差源，所以不设为默认。
 * 辅料 / 五金是计件物，与重量无换算关系，单列。
 */
const MATERIAL_PARTS = [
  { key: 'shell', label: '面料', unit: '克' },
  { key: 'lining', label: '里料', unit: '克' },
  { key: 'filling', label: '填充', unit: '克' },
  { key: 'trim', label: '辅料', unit: '件' },
  { key: 'hardware', label: '五金', unit: '件' }
];

function listMaterialParts() {
  return MATERIAL_PARTS.map(function (p) { return { key: p.key, label: p.label, unit: p.unit }; });
}

function materialPartLabel(part) {
  const hit = MATERIAL_PARTS.filter(function (p) { return p.key === part; })[0];
  return hit ? hit.label : part;
}

/**
 * 品类 × 部位的典型单件用料重量（克）—— 给界面做默认值。
 *
 * 全部 estimate：界面**必须**标明这是估算并允许用户改（把自己那件称一下最准）。
 * 查不到时逐级回落（品类×部位 → 部位 → 全局），**不返回 null** ——
 * 用量要是留空，整个估价就没有输入了，功能直接不可用。
 */
function resolveTypicalWeight(categoryKey, part) {
  const key = normalizePart(part);
  const byCat = UNIT_WEIGHT.byCategory[categoryKey] || {};
  const hit = byCat[key] || UNIT_WEIGHT.byPart[key] || UNIT_WEIGHT.default;

  return {
    g: hit.g,
    range: hit.range || '',
    note: hit.note || '',
    grade: UNIT_WEIGHT.grade,
    // false 说明落到了部位/全局兜底，精度更差，界面要说得更谨慎
    specific: !!byCat[key],
    source: byCat[key]
      ? '该品类常见用料重量区间中值'
      : '未查到该品类 × 部位，取部位常见区间中值'
  };
}

function normalizePart(part) {
  const p = String(part || '').trim();
  return p || 'shell';
}

function pickWeight(categoryKey, part) {
  const key = normalizePart(part);
  const byCat = FABRIC_WEIGHT.byCategory[categoryKey] || {};
  if (byCat[key]) return byCat[key];
  if (FABRIC_WEIGHT.byPart[key]) return FABRIC_WEIGHT.byPart[key];
  return FABRIC_WEIGHT.default;
}

/**
 * 解析一条用料的克重 / 幅宽规格，用于把「元/千克」换成「元/米」。
 *
 * 优先级（越靠前越可信）：
 *   1. 用户显式填的 gsm / width        → grade 'user'
 *   2. 该面料已公开的规格               → grade 'official'
 *   3. 品类 × 部位的典型克重            → grade 'estimate'（assumed=true）
 *   4. 部位兜底 / 全局兜底              → grade 'estimate'（assumed=true）
 *
 * assumed=true 时界面**必须**把假设值显示出来——否则用户会以为是自己填的数。
 */
function resolveWeightSpec(line, context) {
  const src = line || {};
  const ctx = context || {};
  const part = normalizePart(src.part);
  const known = src.fabricKey ? FABRIC_WEIGHT_KNOWN[src.fabricKey] : null;
  const fallback = pickWeight(ctx.category, part);

  const userGsm = toPositive(src.gsm);
  const userWidth = toPositive(src.width);
  if (userGsm > 0 || userWidth > 0) {
    return {
      gsm: userGsm > 0 ? userGsm : ((known && known.gsm) || fallback.gsm),
      width: userWidth > 0 ? userWidth : ((known && known.width) || FABRIC_SPEC_DEFAULT.width),
      grade: 'user',
      assumed: false,
      source: '用户指定',
      note: '克重 / 幅宽由用户指定'
    };
  }

  if (known && (known.gsm || known.width)) {
    return {
      gsm: known.gsm || fallback.gsm,
      width: known.width || FABRIC_SPEC_DEFAULT.width,
      grade: known.grade || 'estimate',
      // 幅宽是官方的、克重是估的，仍算"假设"——不能因为一半官方就宣称可信
      assumed: !(known.grade === 'official' && known.gsm),
      source: known.source || '',
      note: known.gsm ? '' : '克重未公布，取该部位常见区间中值'
    };
  }

  return {
    gsm: fallback.gsm,
    width: FABRIC_SPEC_DEFAULT.width,
    grade: 'estimate',
    assumed: true,
    source: '行业常见克重区间取中值，非官方逐条公布',
    note: '典型克重 ' + fallback.gsm + ' g/㎡（常见区间 ' + (fallback.range || '—') + ' g/㎡）'
      + '，幅宽 ' + FABRIC_SPEC_DEFAULT.width + 'm（' + FABRIC_SPEC_DEFAULT.widthRange + 'm）'
  };
}

/**
 * 把「用量」换算成**千克** —— 纤维原料价一律以千克计价，不换算就会裸乘。
 * 返回换算依据，便于结果页如实交代这个数是怎么来的。
 */
function convertAmountToKg(amount, unit, spec) {
  const u = String(unit || '米').trim();
  if (u === '克' || u === 'g') {
    return { kg: round4(amount / 1000), kgPerUnit: 0.001, note: '1 千克 = 1000 克' };
  }
  if (u === '千克' || u === '公斤' || u === 'kg') {
    return { kg: round4(amount), kgPerUnit: 1, note: '' };
  }
  if (u === '米' || u === 'm' || u === '') {
    const kgPerMeter = round4((spec.gsm || 0) / 1000 * (spec.width || 0));
    return {
      kg: round4(amount * kgPerMeter),
      kgPerMeter: kgPerMeter,
      note: '按 ' + spec.gsm + 'g/㎡ × ' + spec.width + 'm = ' + kgPerMeter + ' kg/米 折算'
    };
  }
  // 件 / 条 / 个 —— 与重量无换算关系，如实标出来，不硬套
  return {
    kg: 0,
    kgPerUnit: 0,
    unconvertible: true,
    note: '单位「' + u + '」与纤维的千克价无法换算，需改用面料价或直接给单价'
  };
}

// ---------------------------------------------------------------- 材料成本

/**
 * 解析**一条**用料。用法优先级：
 *   1. 显式 unitPrice（用户手动填价）
 *   2. fiberKey / fibers → 纤维规格档价（**元/千克**，按克重×幅宽换算成用料重量）
 *   3. fabricKey → 面料米价（元/米）
 * 取不到价时 cost = 0 且 degraded = true，**不许静默当 0 算通过**。
 */
function resolveMaterialLine(line, context) {
  const src = line || {};
  const ctx = context || {};
  let label = src.label || '';
  const amount = toPositive(src.amount);
  const part = src.part || '';

  if (typeof src.unitPrice === 'number' && isFinite(src.unitPrice) && src.unitPrice >= 0) {
    return {
      part: part,
      label: label,
      unit: src.unit || '',
      unitPrice: round4(src.unitPrice),
      amount: amount,
      cost: round2(src.unitPrice * amount),
      grade: src.grade || 'estimate',
      degraded: amount <= 0,
      reason: amount <= 0 ? '用量为 0' : ''
    };
  }

  const unit = src.unit || (src.fibers || src.fiberKey ? '米' : '');
  const needsWeight = Array.isArray(src.fibers) && src.fibers.length > 0 || !!src.fiberKey;

  if (needsWeight) {
    const spec = resolveWeightSpec(src, ctx);
    const conv = convertAmountToKg(amount, unit || '米', spec);

    let unitPrice = 0;
    let grade = 'estimate';
    let missing = [];
    let blend = null;

    if (Array.isArray(src.fibers) && src.fibers.length > 0) {
      blend = estimateBlendUnitPrice(src.fibers);
      unitPrice = blend.unitPrice;
      grade = blend.grade;
      missing = blend.missing;
    } else {
      const tier = getFiberTier(src.fiberKey, src.tierKey);
      unitPrice = tier.unitPrice === null ? 0 : tier.unitPrice;
      grade = tier.grade;
      if (tier.unitPrice === null) missing = [src.fiberKey + (src.tierKey ? '/' + src.tierKey : '')];
      if (!label) label = tier.label;
    }

    // 成分占比没凑够 100% → 加权单价是**系统性错值**（填 80% 就等于按八折算），
    // 所以走降级、不给单价。界面会在提交前就拦住，这里是兜底：
    // 将来换载体（RN / 服务端 / 直接调 API）不可能都记得住这条规则。
    const imbalanced = !!(blend && blend.balanced === false);
    const unconvertible = conv.unconvertible === true;
    const degraded = unconvertible || unitPrice <= 0 || amount <= 0 || imbalanced;
    const reason = unconvertible
      ? conv.note
      : (imbalanced
        ? ('成分合计 ' + blend.declaredPct + '%，不是 100%（容差 ±' + PCT_TOLERANCE + '%）'
          + '—— 占比没凑齐时不给单价，否则等于按缺失的比例打折')
        : (unitPrice <= 0
          ? ('缺纤维价格：' + (missing.join('、') || '成分占比为 0'))
          : (amount <= 0 ? '用量为 0' : '')));
    // 声明了成分但没价可查（亚麻、锦纶…）→ 不算错误，但单价一定偏低，必须说出来
    const warning = (!degraded && blend && blend.unpricedPct > 0)
      ? ('有 ' + blend.unpricedPct + '% 成分无价格档（'
        + blend.unpriced.map(function (u) { return u.label; }).join('、')
        + '），单价只按可定价的 ' + blend.pricedPct + '% 加权，材料成本偏低')
      : '';

    return {
      part: part,
      label: label,
      unit: unit || '米',
      unitPrice: round4(unitPrice),
      priceUnit: '千克',
      amount: amount,
      kg: conv.kg,
      kgPerMeter: conv.kgPerMeter,
      cost: degraded ? 0 : round2(unitPrice * conv.kg),
      grade: grade,
      blend: blend,
      pctDeclared: blend ? blend.declaredPct : null,
      pctPriced: blend ? blend.pricedPct : null,
      warning: warning,
      // 只有走「米 → 千克」那条才用得上克重与幅宽。按克填是纯换算（÷1000），
      // 此时把估出来的克重挂上去会让界面误报「这里用了假设值」，所以按克时置空
      weightSpec: conv.kgPerMeter === undefined ? null : spec,
      specAssumed: conv.kgPerMeter !== undefined && spec.assumed === true,
      conversionNote: conv.note,
      degraded: degraded,
      reason: reason
    };
  }

  const fabric = FABRICS[src.fabricKey];
  if (fabric) {
    return {
      part: part,
      label: label || fabric.label,
      unit: fabric.unit,
      unitPrice: fabric.unitPrice,
      amount: amount,
      cost: round2(fabric.unitPrice * amount),
      grade: fabric.grade,
      source: fabric.source || '',
      period: fabric.period || '',
      degraded: amount <= 0,
      reason: amount <= 0 ? '用量为 0' : ''
    };
  }

  return {
    part: part,
    label: label,
    unit: src.unit || '',
    unitPrice: 0,
    amount: amount,
    cost: 0,
    grade: 'missing',
    degraded: true,
    reason: '取不到价格：既没有 unitPrice，也没有可识别的 fiber/fabric'
  };
}

/**
 * 由「用料清单」估算材料成本，含辅料。
 * 放在配置层是因为辅料比例属于系数，不应写进界面代码。
 *
 * 向后兼容：兼容旧的单条用法 { fabricKey, amount, category }；
 * 新的多材料用法 { materials: [ ... ], category }，见 AGENTS.md 1.3。
 */
function estimateMaterialCost(input) {
  const source = input || {};
  const lines = [];
  const ctx = { category: source.category };

  if (Array.isArray(source.materials) && source.materials.length > 0) {
    source.materials.forEach(function (m) {
      lines.push(resolveMaterialLine(m, ctx));
    });
  } else if (source.fabricKey || source.fiberKey || typeof source.unitPrice === 'number') {
    lines.push(resolveMaterialLine(source, ctx));
  }

  if (lines.length === 0) {
    return emptyMaterial();
  }

  let mainCost = 0;
  let degraded = false;
  const missing = [];
  const pctWarnings = [];
  lines.forEach(function (l) {
    mainCost += l.cost;
    if (l.degraded) {
      degraded = true;
      if (l.reason) missing.push((l.label || l.part || '未命名用料') + '：' + l.reason);
    }
    // 单价明明算出来了、但一部分成分没价 → 不算降级，却**必须**让用户看见，
    // 否则他看到的是一个"正常"的数，实际偏低
    if (l.warning) pctWarnings.push((l.label || l.part || '未命名用料') + '：' + l.warning);
  });
  mainCost = round2(mainCost);

  const ratio = getAuxiliaryRatio(source.category);
  const auxiliaryCost = round2(mainCost * ratio);

  const first = lines[0];
  return {
    mainCost: mainCost,
    auxiliaryCost: auxiliaryCost,
    auxiliaryRatio: ratio,
    auxiliaryGrade: 'estimate',
    materialCost: round2(mainCost + auxiliaryCost),
    lines: lines,
    lineCount: lines.length,
    degraded: degraded,
    missing: missing,
    // 成分里有一部分没价 → 单价偏低。**不静默**：界面必须显示这几条
    pctWarnings: pctWarnings,
    // 克重假设：有任何一条用料用了估算克重就必须提示（不许让用户以为是自己填的）
    specAssumed: lines.some(function (l) { return l.specAssumed === true; }),
    // 兼容旧字段（界面在用）
    fabricLabel: first.label || '',
    unit: first.unit || '',
    unitPrice: first.unitPrice || 0,
    grade: lines.length === 1 ? first.grade : 'mixed',
    spec: '',
    note: lines.length === 1 ? (first.reason || '') : (lines.length + ' 条用料合计')
  };
}

/**
 * 把 estimateMaterialCost 的结果转成估价核心需要的用料数组。
 *
 * core 的用料契约是 { unitPrice, amount }，材料成本由 core 求和得出 ——
 * 所以**辅料必须作为一条传进去**：漏了它，核心算出的材料成本就只等于主料成本，
 * 而设计 / 品牌溢价 / 允许溢出**全都以材料成本为基数**，少算的部分会被逐级放大，
 * 最后是系统性低估（实测漏一次辅料 = 总额低估 15%），而且不报错、不降级。
 *
 * 辅料为 0 时不追加：否则会被 core 的"有取不到价的用料"判据命中，误报降级。
 *
 * 这一步收在配置层，是为了让"界面自己拼材料"这件事不存在 —— 那正是这个 bug 的来源。
 */
function toValuationMaterials(material) {
  const src = material || {};
  const lines = Array.isArray(src.lines) ? src.lines : [];
  const out = lines.map(function (l) {
    return { unitPrice: round2(l.cost), amount: 1 };
  });
  if (src.auxiliaryCost > 0) {
    out.push({ unitPrice: src.auxiliaryCost, amount: 1 });
  }
  return out.length > 0 ? out : [{ unitPrice: 0, amount: 1 }];
}

/**
 * 非面料部位的默认成分 —— **用户不知道，界面也不该问**。
 *
 * 用户手上唯一的信息源是水洗标，而他只认得出"面料"那一行写了什么。
 * 里料是什么纤维、充绒多少克，标签上要么没写、要么写了也没人注意。
 * 把这些做成必填项，结果不是"填得更全"，而是**用户随手挑一个凑数** ——
 * 把整个估价建在假成分上，比我们自己按行业常见值估更坏。
 *
 * 依据是 UNIT_WEIGHT.byCategory：该品类的表里**有**这个部位，就说明这类衣服
 * 通常有它（羽绒服有填充、T 恤没有里料）。没有的**不生成** —— 不是"按 0 计入"，
 * 而是这件衣服压根不存在这一项。
 */
const AUTO_PART_DEFAULT = {
  lining: {
    fiber: 'polyester',
    tier: 'staple_fiber',
    note: '里料绝大多数是涤纶（聚酯纤维），且涤纶短纤有官方报价'
  },
  filling: {
    // tier 留空 → 走 getDefaultTierKey 取中位档。羽绒各档价差 167%，
    // 标签上没写绒子含量就不许按顶格算
    fiber: 'down',
    tier: null,
    note: '羽绒服按羽绒填充计；绒子含量只有标签上才有，此处取中位档'
  }
};

/**
 * 按品类把「用户不知道的部位」补齐成用料。
 *
 * 第二参数 labelParts 是**水洗标上真的读到**的里料 / 填充成分（形状
 * `{ lining: [{fiber,tier,pct}] }`）：法定标注的权威性高于行业常见值，
 * 读到就用它，读不到才用 AUTO_PART_DEFAULT。
 *
 * 返回值直接可以拼进 estimateMaterialCost 的 materials；
 * basis / basisNote 是给界面**如实汇报**用的（"这几块钱是替你估的，依据是什么"）。
 */
/**
 * 按「整件衣服重量」等比换算各部位用料重量。
 *
 * 【为什么必须有这条】用户能称的是**整件衣服** —— 往秤上一放就有数。
 * 他称不出"这件衣服的面料单独用了多少克"，那得把衣服拆了。
 * 让用户填"用量"，等于让他填一个他既不知道、也没法验证的数字 ——
 * 填下去只能是个随手估的值，而我们却拿它当输入算钱。
 *
 * 【换算方式】以该品类各部位**常见用料重量的合计**为基准做等比缩放：
 * 一件 480 克的厚外套和一件 300 克的薄外套，各部位用料按同一比例放大缩小。
 *
 * 【口径差异 · 必须显式告知】用户称的整件重量含拉链、纽扣、衬等辅料与五金，
 * 而 UNIT_WEIGHT 记的是**用料**重量，两者并不严格相等。所以这里不造
 * "各部位之和 = 整件重量"的假等式，而是按比例缩放，并把基准写进 note ——
 * 界面必须把它说出来，用户才知道这个克数是怎么来的。
 *
 * 返回 null = 不适用（用户没填 / 该品类没有重量数据）→ 调用方回落典型值。
 */
function distributeByTotalWeight(categoryKey, totalWeight) {
  const byCat = UNIT_WEIGHT.byCategory[categoryKey] || {};
  const parts = Object.keys(byCat);
  const total = toPositive(totalWeight);
  if (!(total > 0) || parts.length === 0) return null;

  const base = parts.reduce(function (s, k) { return s + byCat[k].g; }, 0);
  if (!(base > 0)) return null;
  const scale = total / base;

  const weights = {};
  parts.forEach(function (k) { weights[k] = round1(byCat[k].g * scale); });

  return {
    total: round1(total),
    base: base,
    scale: round4(scale),
    weights: weights,
    grade: 'estimate',
    note: '按本类衣服各部位常见用料合计 ' + base + ' 克换算（你填的整件重量 '
      + round1(total) + ' 克，×' + (Math.round(scale * 100) / 100) + '）'
  };
}

/**
 * 取某部位的用料重量 —— 用户填了整件重量就走等比换算，没填回落本类常见值。
 *
 * 两条路都带 `fromTotal` / `source`，界面**必须能把依据说出来**：
 * 只甩一个"面料 275 克"、不说它是称出来的还是我们估的，用户无从判断可信度。
 */
function resolvePartWeight(categoryKey, part, totalWeight) {
  const key = normalizePart(part);
  const dist = distributeByTotalWeight(categoryKey, totalWeight);
  if (dist && typeof dist.weights[key] === 'number') {
    return {
      g: dist.weights[key],
      range: '',
      note: dist.note,
      grade: dist.grade,
      specific: true,
      fromTotal: true,
      source: '按你填的整件重量 ' + dist.total + ' 克等比换算'
    };
  }
  const w = resolveTypicalWeight(categoryKey, key);
  w.fromTotal = false;
  return w;
}

function autoMaterialInputs(categoryKey, labelParts, totalWeight) {
  const byCat = UNIT_WEIGHT.byCategory[categoryKey] || {};
  const fromLabel = labelParts || {};
  const out = [];

  Object.keys(byCat).forEach(function (part) {
    if (part === 'shell') return;
    const def = AUTO_PART_DEFAULT[part];
    if (!def) return;

    const weight = resolvePartWeight(categoryKey, part, totalWeight);
    const onLabel = Array.isArray(fromLabel[part]) ? fromLabel[part] : [];
    const fibers = onLabel.length > 0
      ? onLabel.map(function (f) {
        return {
          fiber: f.fiber,
          // 档位必须落定：getFiberTier 拿到 null 会判"规格档缺失"而不是取默认
          tier: f.tier || getDefaultTierKey(f.fiber),
          pct: f.pct
        };
      })
      : [{
        fiber: def.fiber,
        tier: def.tier || getDefaultTierKey(def.fiber),
        pct: 100
      }];

    out.push({
      part: part,
      label: materialPartLabel(part),
      amount: weight.g,
      unit: '克',
      fibers: fibers,
      basis: onLabel.length > 0 ? 'label' : 'industry',
      basisNote: onLabel.length > 0
        ? '水洗标上写了这一项，按标签计入'
        : ('按该品类常见值计入：' + def.note),
      weightRange: weight.range,
      // 重量从哪来：用户填的整件重量等比换算，还是本类常见值。
      // 界面必须如实说 —— 只甩一个"里料 150 克"、不说依据，用户没法判断可信度
      weightFromTotal: weight.fromTotal === true,
      weightSource: weight.source || '',
      weightNote: weight.note || ''
    });
  });

  return out;
}

function emptyMaterial() {
  return {
    mainCost: 0,
    auxiliaryCost: 0,
    auxiliaryRatio: 0,
    auxiliaryGrade: 'estimate',
    materialCost: 0,
    lines: [],
    lineCount: 0,
    degraded: true,
    missing: ['未提供任何用料'],
    pctWarnings: [],
    specAssumed: false,
    fabricLabel: '',
    unit: '',
    unitPrice: 0,
    grade: 'missing',
    spec: '',
    note: ''
  };
}

// ---------------------------------------------------------------- 系数汇总

/**
 * 把「品类 + 品牌 + 调用方显式传入的覆盖项」合并成一份完整系数。
 * 任何一层缺失都退回默认值，因此调用方永远拿得到可用系数。
 *
 * 注意：overflowRatio 的第一优先级是调用方传入 —— 界面上由用户自己决定给多大，
 * 传入的值必须原样生效，不能被品类默认值盖掉。
 */
function resolveCoefficients(itemInfo) {
  const info = itemInfo || {};
  const category = CATEGORY_COEFFICIENTS[info.category] || {};

  // 品牌：先看品牌库，再看档位
  const brandInfo = resolveBrand(info);
  const tierKey = BRAND_TIERS[brandInfo.tier] ? brandInfo.tier : DEFAULT_BRAND_TIER;
  const tier = BRAND_TIERS[tierKey];
  const legacyTierKey = BRAND_TIERS[info.brandTier] ? info.brandTier : null;
  const legacyTier = legacyTierKey ? BRAND_TIERS[legacyTierKey] : null;

  // 品牌库有官方毛利率派生的溢价率就用它，否则用档位
  const brandPremiumRate = typeof brandInfo.premiumRate === 'number' ? brandInfo.premiumRate : null;
  // 注意：显式传入 brandTier 时（旧调用方式）优先尊重档位，避免静默改数
  const premiumRate = legacyTier && !info.brandKey
    ? pick(info.premiumRate, legacyTier.premiumRate)
    : pick(info.premiumRate, brandPremiumRate, tier.premiumRate);

  const designRateTier = legacyTier || tier;

  return {
    categoryLabel: category.label || '未分类',
    brandLabel: brandInfo.label || designRateTier.label,
    // 兼容旧字段名：界面 ValuationScreen 在用，改名前必须先改界面
    brandTierLabel: brandInfo.label || designRateTier.label,
    brandKey: brandInfo.key || null,
    brandFound: brandInfo.found === true,
    brandGrade: brandInfo.grade || 'estimate',
    brandPeriod: brandInfo.period || '',
    premiumRateSource: premiumRate === brandPremiumRate && brandPremiumRate !== null
      ? 'brand-gross-margin'
      : (info.premiumRate !== undefined ? 'caller' : 'tier-fallback'),
    doubleCountRisk: !!(premiumRate === brandPremiumRate && brandPremiumRate !== null),
    processingFee: pick(info.processingFee, category.processingFee, DEFAULT_COEFFICIENTS.processingFee),
    designRate: pick(info.designRate, designRateTier.designRate),
    premiumRate: premiumRate,
    overflowRatio: pick(info.overflowRatio, category.overflowRatio, DEFAULT_COEFFICIENTS.overflowRatio),
    spread: pick(info.spread, category.spread, DEFAULT_COEFFICIENTS.spread)
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

/** 克数保留一位小数 —— 按整件重量分摊时用，取整会让羽绒服这类大件丢精度 */
function round1(value) {
  return Math.round(value * 10) / 10;
}

function toPositive(value) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return typeof num === 'number' && isFinite(num) && num > 0 ? num : 0;
}

function toRatio(value) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || !isFinite(num) || num <= 0) return 0;
  // 允许 80 与 0.8 两种写法
  return num > 1 ? num / 100 : num;
}

function pick() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (typeof value === 'number' && isFinite(value)) {
      return value;
    }
  }
  return 0;
}

module.exports = {
  listCategories: listCategories,
  listBrandTiers: listBrandTiers,
  listFabrics: listFabrics,
  getFabric: getFabric,
  getAuxiliaryRatio: getAuxiliaryRatio,
  estimateMaterialCost: estimateMaterialCost,
  // 交给估价核心的用料数组（含辅料）—— 界面不许自己拼
  toValuationMaterials: toValuationMaterials,
  // 用户不知道的部位（里料 / 填充）由这里按品类补齐，界面不许自己拼
  autoMaterialInputs: autoMaterialInputs,
  materialPartLabel: materialPartLabel,
  resolveCoefficients: resolveCoefficients,
  resolveMaterialLine: resolveMaterialLine,
  // 单位换算（元/千克 ↔ 克 / 米）
  listMaterialParts: listMaterialParts,
  resolveTypicalWeight: resolveTypicalWeight,
  // 「整件衣服重量 → 各部位用料」等比换算。用户称不出"面料单独多少克"，
  // 但称得出整件 —— 这是唯一一个他能自己验证的用量输入
  distributeByTotalWeight: distributeByTotalWeight,
  resolvePartWeight: resolvePartWeight,
  // 按品类给可选项分组（适合本类的在前，其余收在后面，**一个都不丢**）
  groupByCategory: groupByCategory,
  resolveWeightSpec: resolveWeightSpec,
  convertAmountToKg: convertAmountToKg,
  // 纤维规格档
  listFibers: listFibers,
  getFiberTier: getFiberTier,
  getDefaultTierKey: getDefaultTierKey,
  estimateBlendUnitPrice: estimateBlendUnitPrice,
  // 「其他纤维」占位 + 成分合计容差（界面渲染与提交拦截都要用同一份口径）
  OTHER_FIBER: OTHER_FIBER,
  PCT_TOLERANCE: PCT_TOLERANCE,
  // 品牌库
  listBrands: listBrands,
  getBrand: getBrand,
  findBrandByName: findBrandByName,
  // 「商品描述里提到了哪个品牌」—— 与上面那个（"整段就是一个品牌名"）分工不同，别混用
  findBrandMention: findBrandMention,
  resolveBrand: resolveBrand,
  // 元数据
  PRICE_SNAPSHOT: PRICE_SNAPSHOT,
  BRAND_SNAPSHOT: BRAND_SNAPSHOT,
  INDUSTRY_BENCHMARK: INDUSTRY_BENCHMARK,
  REJECTED_BRANDS: REJECTED_BRANDS,
  PENDING_FIBERS: PENDING_FIBERS,
  AUXILIARY_ITEMS: AUXILIARY_ITEMS,
  UNIT_CONSUMPTION: UNIT_CONSUMPTION
};
