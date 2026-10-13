// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js

/**
 * 纤维 / 面料价格表 —— 按「纤维 × 规格档」组织，不是按纤维名一刀切。
 *
 * 【硬规则】本文件每条价格都必须带 source + period；没有权威出处的必须标 grade: 'estimate'，
 * 不允许出现"凭常识填"的价格。改价格必须同时改 source 与 period。
 *
 * 为什么要有规格档：
 *   同为"棉"，长绒棉 137 级 26.72 元/kg vs 细绒棉 2227B 15.84 元/kg，差 69%；
 *   同为"羽绒"，90% 白鹅绒 984.45 元/kg vs 70% 灰鸭绒 369.01 元/kg，差 167%。
 *   按纤维名给一个均价，误差比模型里其他所有系数加起来都大。
 *
 * grade 含义：
 *   official   —— 政府价格监测网站 / 国家级交易市场 / 行业协会官方指数
 *   semi       —— 官方指数口径不完整，或经媒体/机构二手转引
 *   estimate   —— 无官方逐条报价，按同类行情估算（**待补数据源**）
 *
 * 单位约定：纤维原料一律 **元/千克**；面料一律 **元/米**（真皮为 元/平方英尺）。
 * 原始报价常见"元/吨"，折算系数 1 元/吨 = 0.001 元/千克，officialQuote 保留原值便于核对。
 */

const PRICE_SNAPSHOT = {
  updatedAt: '2026-09-26',
  sources: {
    shaoxing: {
      label: '绍兴e价通 · 中国轻纺城畅销面料排行榜',
      publisher: '绍兴市发展和改革委员会、柯桥区发展和改革局',
      url: 'https://jgjg.sx.gov.cn/qf_prod_list.aspx?id=15517',
      period: '2026-06-22'
    },
    keqiao_index: {
      label: '中国·柯桥纺织指数（商务部「商务预报」按月发布）',
      publisher: '中华人民共和国商务部',
      url: 'https://cif.mofcom.gov.cn'
    },
    cottonchina: {
      label: '中国棉花信息网 · CC Index / 新疆棉花棉纱价格指数',
      publisher: '中国棉花信息网',
      url: 'https://www.cottonchina.org.cn',
      period: '2026-09-24'
    },
    down_cn: {
      label: '中国羽绒信息网 · 羽绒价格走势（GB/T 14272-2021 口径）',
      publisher: '中国羽绒信息网（行业协会监测）',
      url: 'https://www.cfd.com.cn',
      period: '2026-09-18'
    },
    esilk: {
      label: '中国茧丝绸交易市场 · 生丝/干茧每周现货交易报价',
      publisher: '中国茧丝绸交易市场（金蚕网）',
      url: 'https://www.esilk.net',
      period: '2026-09-21'
    },
    nmg_price: {
      label: '内蒙古自治区价格监测和认定中心 · 羊绒收购价专项调查',
      publisher: '内蒙古自治区价格监测和认定中心',
      period: '2025 年监测'
    },
    qinghe_index: {
      label: '清河·中国羊绒指数（清河县政府，经商务部网站发布）',
      publisher: '河北省清河县人民政府、中国畜产品流通协会',
      period: '每半月一期'
    }
  }
};

/**
 * 纤维原料价格 —— 按规格档。
 *
 * tiers 结构：{ key, label, unitPrice, spec, grade, officialQuote?, note? }
 * unitPrice 为 null 表示**该档暂无可靠价格**，代码必须走降级（不许用 0 冒充）。
 */
const FIBERS = {
  cotton: {
    label: '棉',
    unit: '千克',
    tiers: {
      extra_long_staple_137: {
        label: '长绒棉 137 级',
        unitPrice: 26.72,
        spec: '137 级（长绒）',
        grade: 'official',
        officialQuote: '26720 元/吨',
        source: '中国棉花信息网 · 新疆长绒棉137级',
        period: '2026-09-23'
      },
      grade_2129B: {
        label: '细绒棉 2129B',
        unitPrice: 17.70,
        spec: '2129B',
        grade: 'official',
        officialQuote: '17697 元/吨',
        source: '中国棉花信息网 · CC Index 2129B',
        period: '2026-09-24'
      },
      grade_3128B: {
        label: '细绒棉 3128B（标准级）',
        unitPrice: 17.37,
        spec: '3128B',
        grade: 'official',
        officialQuote: '17368 元/吨',
        source: '中国棉花信息网 · CC Index 3128B',
        period: '2026-09-24'
      },
      grade_2227B: {
        label: '细绒棉 2227B',
        unitPrice: 15.84,
        spec: '2227B',
        grade: 'official',
        officialQuote: '15838 元/吨',
        source: '中国棉花信息网 · CC Index 2227B',
        period: '2026-09-24'
      }
    }
  },

  down: {
    label: '羽绒',
    unit: '千克',
    tiers: {
      white_duck_95: { label: '白鸭绒 95%', unitPrice: 639.81, spec: '含绒量 95%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_duck_90: { label: '白鸭绒 90%', unitPrice: 567.48, spec: '含绒量 90%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_duck_80: { label: '白鸭绒 80%', unitPrice: 472.38, spec: '含绒量 80%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_duck_70: { label: '白鸭绒 70%', unitPrice: 386.37, spec: '含绒量 70%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_duck_95: { label: '灰鸭绒 95%', unitPrice: 615.02, spec: '含绒量 95%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_duck_90: { label: '灰鸭绒 90%', unitPrice: 537.67, spec: '含绒量 90%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_duck_80: { label: '灰鸭绒 80%', unitPrice: 452.04, spec: '含绒量 80%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_duck_70: { label: '灰鸭绒 70%', unitPrice: 369.01, spec: '含绒量 70%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_goose_95: { label: '白鹅绒 95%', unitPrice: 1104.27, spec: '含绒量 95%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_goose_90: { label: '白鹅绒 90%', unitPrice: 984.45, spec: '含绒量 90%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_goose_80: { label: '白鹅绒 80%', unitPrice: 816.60, spec: '含绒量 80%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      white_goose_70: { label: '白鹅绒 70%', unitPrice: 677.84, spec: '含绒量 70%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_goose_95: { label: '灰鹅绒 95%', unitPrice: 1041.42, spec: '含绒量 95%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_goose_90: { label: '灰鹅绒 90%', unitPrice: 917.26, spec: '含绒量 90%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_goose_80: { label: '灰鹅绒 80%', unitPrice: 757.65, spec: '含绒量 80%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' },
      grey_goose_70: { label: '灰鹅绒 70%', unitPrice: 634.61, spec: '含绒量 70%', grade: 'official',
        source: '中国羽绒信息网 GB/T 14272-2021 口径', period: '2026-09-18' }
    },
    note: '同一绒种内 70% → 95% 价差约 65%；鸭绒 ↔ 鹅绒价差约 74%。必须按含绒量档取价'
  },

  silk: {
    label: '生丝 / 真丝',
    unit: '千克',
    tiers: {
      silk_6A: { label: '白厂丝 6A', unitPrice: 537.5, spec: '6A 级', grade: 'official',
        officialQuote: '50.5~57 万元/吨（取中值）', source: '中国茧丝绸交易市场每周现货报价', period: '2026-09-21' },
      silk_5A: { label: '白厂丝 5A', unitPrice: 504.5, spec: '5A 级', grade: 'official',
        officialQuote: '45.1~55.8 万元/吨（取中值）', source: '中国茧丝绸交易市场每周现货报价', period: '2026-09-21' },
      silk_3A_4A: { label: '白厂丝 3A~4A（内销）', unitPrice: 452.5, spec: '3A~4A 级', grade: 'official',
        officialQuote: '42.3~48.2 万元/吨（取中值）', source: '中国茧丝绸交易市场每周现货报价', period: '2026-09-21' }
    },
    note: '这是**生丝原料价**，不是真丝面料米价；面料米价 = 生丝 × 用量 + 织造染整，折算系数待补'
  },

  cashmere: {
    label: '羊绒',
    unit: '千克',
    tiers: {
      ultra_12_5um: { label: '超细绒 12.5~13μm（新疆青河）', unitPrice: 1000, spec: '12.5~13μm',
        grade: 'semi', source: '媒体引用产区成交价（今晚报）', period: '2025' },
      fine_14_5um: { label: '细绒 14.5μm 以下（内蒙古）', unitPrice: 420, spec: '≤14.5μm',
        grade: 'official', officialQuote: '400~440 元/公斤（取中值）',
        source: '内蒙古自治区价格监测和认定中心专项调查', period: '2025 年监测' },
      common_qinghe: { label: '普通白绒（河北清河）', unitPrice: 310, spec: '普通白绒',
        grade: 'semi', officialQuote: '300~320 元/公斤（取中值）',
        source: '产区成交价（今晚报引用）', period: '2025' }
    },
    note: '**口径未统一**：以上偏"原绒/分梳绒"口径，成衣实用价参考无毛绒均价约 650~700 元/公斤'
      + '（全球纺织网，estimate）。用之前必须先统一到底按原绒还是无毛绒，否则会低估一倍'
  },

  wool: {
    label: '羊毛',
    unit: '千克',
    tiers: {
      merino_17_5: { label: '羊毛 17.5μm（细支）', unitPrice: 160, spec: '细度 17.5μm、长度 30mm',
        grade: 'estimate', officialQuote: '160000 元/吨',
        source: '单一企业报价（河北清河东升绒纱厂），非官方指数', period: '报价页（未标日期）' },
      wool_18_8: { label: '羊毛 18.8μm', unitPrice: 78, spec: '细度 18.8μm、长度 30mm',
        grade: 'estimate', officialQuote: '78000 元/吨',
        source: '单一企业报价（河北清河东升绒纱厂）', period: '报价页（未标日期）' },
      wool_19_8: { label: '羊毛 19.8μm', unitPrice: 52, spec: '细度 19.8μm、长度 32mm',
        grade: 'estimate', officialQuote: '52000 元/吨',
        source: '单一企业报价（河北清河东升绒纱厂）', period: '报价页（未标日期）' },
      wool_20_5: { label: '羊毛 20.5μm', unitPrice: 48, spec: '细度 20.5μm、长度 32mm',
        grade: 'estimate', officialQuote: '48000 元/吨',
        source: '单一企业报价（河北清河东升绒纱厂）', period: '报价页（未标日期）' },
      wool_21_5: { label: '羊毛 21.5μm', unitPrice: 44, spec: '细度 21.5μm、长度 30mm',
        grade: 'estimate', officialQuote: '44000 元/吨',
        source: '单一企业报价（河北清河东升绒纱厂）', period: '报价页（未标日期）' }
    },
    note: '**羊毛没有中文官方指数**。澳毛 AWEX EMI（澳元/千克净毛）是国际权威口径，待接入'
  },

  polyester: {
    label: '涤纶',
    unit: '千克',
    tiers: {
      staple_fiber: { label: '涤纶短纤', unitPrice: 8.63, spec: '短纤', grade: 'official',
        officialQuote: '8630 元/吨', source: '中国棉花信息网 · 涤纶短纤', period: '2026-09-24' }
    }
  },

  viscose: {
    label: '粘胶',
    unit: '千克',
    tiers: {
      staple_fiber: { label: '粘胶短纤', unitPrice: 14.65, spec: '短纤', grade: 'official',
        officialQuote: '14650 元/吨', source: '中国棉花信息网 · 粘胶短纤', period: '2026-09-24' }
    }
  }
};

/**
 * 明确缺官方数据源的纤维 —— 留档，避免下次又去找一遍，也避免有人"顺手填一个"。
 * 代码遇到这些纤维必须走降级，不许拿 estimate 价冒充 official。
 *
 * 【维护规则】`services/recognize.js` 的 FIBER_TERMS 能识别出的每一种纤维，
 * **必须**在这里或 FIBERS 里有一条落点。否则识别命中反而落空 ——
 * 用户看到的是"识别到了，但价格表里没这个东西"，而那个失败还是静默的
 * （reason 会是兜底的"该纤维不在价格表中"，说不清为什么）。校验脚本守着这条。
 */
const PENDING_FIBERS = {
  lyocell: { label: '莱赛尔 / 天丝', reason: '国内无公开官方指数，面料价只能沿用轻纺城同类估算' },
  linen: { label: '亚麻', reason: '国内无公开政府逐条报价；国际亚麻价格以欧元计，待接' },
  nylon: { label: '锦纶 / 尼龙', reason: '无逐条官方报价；可参考台华新材等上市公司面料毛利率间接校验' },
  acrylic: { label: '腈纶', reason: '无官方逐条报价' },
  spandex: { label: '氨纶', reason: '无官方逐条报价' },
  // 下面这几条是常见毛类 —— 水洗标上真的会出现（马海毛、兔毛、羊驼毛），
  // 而且都和羊毛 / 羊绒长得很像，不收进来会被当成"认不出的词"丢掉
  rabbit: { label: '兔毛', reason: '无官方逐条报价；另有"安哥拉兔毛"写法' },
  mohair: { label: '马海毛', reason: '无官方逐条报价（安哥拉山羊毛），国际报价以美元计，待接' },
  alpaca: { label: '羊驼毛', reason: '无官方逐条报价；秘鲁产地报价为主，待接' },
  // 再生纤维素纤维里最常见、但价格表还没收的两个
  modal: { label: '莫代尔', reason: '无官方逐条报价；与粘胶同属再生纤维素纤维，可参照粘胶短纤价上浮估算' },
  acetate: { label: '醋酸纤维 / 醋酯纤维', reason: '无官方逐条报价' },
  // 合成纤维里还没收的常见一种
  polypropylene: { label: '丙纶 / 聚丙烯纤维', reason: '无官方逐条报价；多见于产业用与运动内衣' },
  pu: { label: 'PU 合成革', reason: '无官方逐条报价' },
  leather: { label: '真皮', reason: '无官方逐条报价；按平方英尺计价，与米制不通用' }
};

/**
 * 面料价格表（元/米，真皮为元/平方英尺）—— 按规格档。
 *
 * fibers 字段声明该面料的纤维成分，用于与 FIBERS 表联动校验（成分和须为 1）。
 */
const FABRICS = {
  cotton_twill: {
    label: '全棉轧染纱卡',
    unit: '米',
    unitPrice: 15.6,
    grade: 'official',
    spec: '148cm 20S×16S、128×60 全工艺环保',
    fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }],
    source: '绍兴e价通 · 中国轻纺城畅销面料排行榜第②位',
    period: '2026-06-22'
  },
  rayon_print: {
    label: '数码印花人棉布',
    unit: '米',
    unitPrice: 9.5,
    grade: 'official',
    spec: '145cm 60S×60S、100×80',
    fibers: [{ fiber: 'viscose', tier: 'staple_fiber', pct: 1 }],
    source: '绍兴e价通 · 中国轻纺城畅销面料排行榜第⑤位',
    period: '2026-06-22'
  },
  tencel_cotton: {
    label: '天丝棉时装布',
    unit: '米',
    unitPrice: 30.5,
    grade: 'official',
    spec: '150cm 360 克/米',
    fibers: [{ fiber: 'lyocell', pct: 0.6 }, { fiber: 'cotton', tier: 'grade_3128B', pct: 0.4 }],
    source: '绍兴e价通 · 中国轻纺城畅销面料排行榜第⑩位',
    period: '2026-06-22'
  },
  nylon_cotton_knit: {
    label: '针织锦棉拉架',
    unit: '米',
    unitPrice: 13.41,
    grade: 'official',
    officialQuote: '32.50 元/公斤',
    spec: '165cm 250 克/平方米',
    fibers: [{ fiber: 'nylon', pct: 0.5 }, { fiber: 'cotton', tier: 'grade_3128B', pct: 0.45 }, { fiber: 'spandex', pct: 0.05 }],
    source: '绍兴e价通 · 中国轻纺城畅销面料排行榜第⑧位',
    period: '2026-06-22',
    note: '按 1.65m × 0.25kg/㎡ = 0.4125kg/米 折算'
  },
  poly_fleece_printed: {
    label: '涤纶针织印花双面绒',
    unit: '米',
    unitPrice: 6.94,
    grade: 'official',
    officialQuote: '18.50 元/公斤',
    spec: '150cm 150D 半光 FDY×100D DTY',
    fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 1 }],
    source: '绍兴e价通 · 中国轻纺城畅销面料排行榜第③位',
    period: '2026-06-22',
    note: '幅宽 150cm、按 250g/㎡ 折算（克重未公布，取双面绒常见区间中值）'
  },
  poly_fleece_brushed: {
    label: '涤纶针织双刷单摇摇粒绒',
    unit: '米',
    unitPrice: 10.84,
    grade: 'official',
    officialQuote: '25.80 元/公斤',
    spec: '150cm 涤纶 DTY144F',
    fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 1 }],
    source: '绍兴e价通 · 中国轻纺城畅销面料排行榜第④位',
    period: '2026-06-22',
    note: '幅宽 150cm、按 280g/㎡ 折算（克重未公布，取摇粒绒常见区间中值）'
  },
  wool_poly_blend: {
    label: '羊毛 / 涤纶混纺呢',
    unit: '米',
    unitPrice: 29.5,
    grade: 'semi',
    spec: '150cm 450 克/米',
    fibers: [{ fiber: 'wool', tier: 'wool_21_5', pct: 0.6 }, { fiber: 'polyester', tier: 'staple_fiber', pct: 0.4 }],
    source: '柯桥纺织指数官方站「热门面料」报价',
    period: '快照（待接指数滚动）',
    note: '成分比例为常见配比，非官方披露；实际配比随款变化'
  },
  poly_viscose_serge: {
    label: '涤粘中厚呢（T/R 70/30）',
    unit: '米',
    unitPrice: 16.5,
    grade: 'semi',
    spec: '150cm 430 克/米',
    fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 0.7 }, { fiber: 'viscose', tier: 'staple_fiber', pct: 0.3 }],
    source: '柯桥纺织指数官方站「热门面料」报价',
    period: '快照（待接指数滚动）'
  },
  cotton_poplin: {
    label: '全棉府绸（衬衣料）',
    unit: '米',
    unitPrice: 9.2,
    grade: 'estimate',
    spec: '140cm 60×60 本白',
    fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }],
    source: '无官方逐条报价，按轻纺城同类现货区间取中值',
    period: '—'
  },
  cotton_corduroy: {
    label: '全棉灯芯绒',
    unit: '米',
    unitPrice: 13.5,
    grade: 'estimate',
    spec: '16W 无弹梭织',
    fibers: [{ fiber: 'cotton', tier: 'grade_3128B', pct: 1 }],
    source: '无官方逐条报价，按轻纺城同类现货区间取中值',
    period: '—'
  },
  tc_serge: {
    label: '涤棉纱卡（T/C 工装料）',
    unit: '米',
    unitPrice: 9.7,
    grade: 'estimate',
    spec: '抗静电条子工装布',
    fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 0.65 }, { fiber: 'cotton', tier: 'grade_3128B', pct: 0.35 }],
    source: '无官方逐条报价，按轻纺城同类现货区间取中值',
    period: '—'
  },
  windproof_parka: {
    label: '风衣 / 派克面料',
    unit: '米',
    unitPrice: 18.5,
    grade: 'estimate',
    spec: '春秋款 男女装',
    fibers: [{ fiber: 'polyester', tier: 'staple_fiber', pct: 1 }],
    source: '无官方逐条报价，按轻纺城同类现货区间取中值',
    period: '—'
  },
  down_filling: {
    label: '羽绒填充',
    unit: '克',
    unitPrice: 0.5675,
    grade: 'official',
    officialQuote: '90% 白鸭绒 567.48 元/公斤',
    spec: '90% 白鸭绒（GB/T 14272-2021）',
    fibers: [{ fiber: 'down', tier: 'white_duck_90', pct: 1 }],
    source: '中国羽绒信息网 · 羽绒价格走势',
    period: '2026-09-18',
    note: '**仅代表 90% 白鸭绒这一档**。要按实际含绒量/绒种取价请直接用 FIBERS.down.tiers，'
      + '70% 灰鸭绒到 95% 白鹅绒价差可达 3 倍'
  },
  linen: {
    label: '亚麻',
    unit: '米',
    unitPrice: 48,
    grade: 'estimate',
    spec: '常规亚麻平纹',
    fibers: [{ fiber: 'linen', pct: 1 }],
    source: '国内无公开政府逐条报价，按同类行情估算',
    period: '—'
  },
  silk: {
    label: '真丝（双绉 / 素绉缎）',
    unit: '米',
    unitPrice: 95,
    grade: 'estimate',
    spec: '常规厚度',
    fibers: [{ fiber: 'silk', tier: 'silk_3A_4A', pct: 1 }],
    source: '国内无公开面料逐条报价；生丝价有官方口径（见 FIBERS.silk），面料折算系数待补',
    period: '—'
  },
  cashmere: {
    label: '羊绒呢',
    unit: '米',
    unitPrice: 360,
    grade: 'estimate',
    spec: '常规羊绒呢',
    fibers: [{ fiber: 'cashmere', tier: 'fine_14_5um', pct: 1 }],
    source: '国内无公开面料逐条报价；羊绒原料价见 FIBERS.cashmere，面料折算系数待补',
    period: '—'
  },
  leather_pu: {
    label: 'PU 合成革',
    unit: '米',
    unitPrice: 30,
    grade: 'estimate',
    spec: '常规 PU 底布',
    fibers: [{ fiber: 'pu', pct: 1 }],
    source: '无官方逐条报价，待补数据源',
    period: '—'
  },
  leather_real: {
    label: '真皮',
    unit: '平方英尺',
    unitPrice: 25,
    grade: 'estimate',
    spec: '头层牛皮',
    fibers: [{ fiber: 'leather', pct: 1 }],
    source: '无官方逐条报价，待补数据源',
    period: '—'
  }
};

/**
 * 面料 → 适用品类（**导航元数据，不是价格数据**，所以不带 source/period）。
 *
 * 【为什么单独一张表，而不是写进每条记录里】
 *   它是"这块布通常拿来做哪类衣服"的事实性归属，判据是布料本身的常规用途，
 *   与价格出处是两套来源。集中成一张表才能一眼审完 18 条 —— 散在 18 处，
 *   改一个品类要翻 200 行，迟早漏一条。
 *
 * 【为什么是数组】面料本来就跨品类：纱卡既做工装裤也做夹克，亚麻的衬衫、
 *   裙子、裤子都用它。只挂一个品类等于抹掉它真实的用途范围。
 *
 * 【为什么只用来排序分组、不用来过滤】用户可能拿着一件用途很偏的衣服
 *   （真丝卫衣、皮革衬衫），硬过滤会让他在列表里找不到面料，
 *   那比"列表长一点"更糟。所以界面把适用的排前面并标记，其余收进"其他"。
 *
 * 【缺登记怎么办】没登记 → 视为"全品类适用"，**不许因为漏登记就把它藏起来**。
 */
const FABRIC_CATEGORY = {
  cotton_twill: { categories: ['apparel_pants', 'apparel_outerwear', 'apparel_shirt'], focus: '工装裤 / 夹克 / 工装衬衫' },
  rayon_print: { categories: ['apparel_dress', 'apparel_shirt'], focus: '印花连衣裙 / 轻薄衬衫' },
  tencel_cotton: { categories: ['apparel_dress', 'apparel_shirt'], focus: '时装裙装 / 时装衬衫' },
  nylon_cotton_knit: { categories: ['apparel_knit', 'apparel_pants'], focus: '针织上衣 / 针织运动裤' },
  poly_fleece_printed: { categories: ['apparel_knit', 'apparel_outerwear'], focus: '印花卫衣 / 抓绒内搭' },
  poly_fleece_brushed: { categories: ['apparel_outerwear', 'apparel_knit'], focus: '抓绒外套 / 摇粒绒卫衣' },
  wool_poly_blend: { categories: ['apparel_suit', 'apparel_outerwear'], focus: '西服 / 羊毛大衣' },
  poly_viscose_serge: { categories: ['apparel_suit', 'apparel_pants'], focus: '西服 / 西裤' },
  cotton_poplin: { categories: ['apparel_shirt'], focus: '衬衣料' },
  cotton_corduroy: { categories: ['apparel_pants', 'apparel_outerwear'], focus: '灯芯绒裤 / 灯芯绒夹克' },
  tc_serge: { categories: ['apparel_pants', 'apparel_outerwear'], focus: '工装裤 / 工装外套' },
  windproof_parka: { categories: ['apparel_outerwear', 'apparel_down'], focus: '风衣 / 派克 / 羽绒服外皮' },
  down_filling: { categories: ['apparel_down'], focus: '羽绒服填充' },
  linen: { categories: ['apparel_shirt', 'apparel_dress', 'apparel_pants'], focus: '亚麻衬衫 / 裙 / 裤' },
  silk: { categories: ['apparel_dress', 'apparel_shirt'], focus: '真丝裙装 / 真丝衬衫' },
  cashmere: { categories: ['apparel_outerwear', 'apparel_knit'], focus: '羊绒大衣 / 羊绒衫' },
  leather_pu: { categories: ['apparel_outerwear', 'apparel_accessory'], focus: 'PU 皮衣 / 配饰' },
  leather_real: { categories: ['apparel_outerwear', 'apparel_accessory'], focus: '真皮衣 / 皮带' }
};

/**
 * 克重与幅宽 —— 把「元/千克」的纤维原料价换算成「元/米」的用量价，所必需的桥。
 *
 * 【为什么必须有这一层】
 *   纤维原料价一律按**千克**发布（中国棉花信息网、中国羽绒信息网…），
 *   而用户填的用量是**米**。没有克重 × 幅宽这个桥，两个单位会**裸乘**：
 *   17.37 元/千克 × 1.6 米 = 27.79 —— 这个数没有任何物理意义，
 *   而且它是**静默的**（不报错、不降级，直接给出一个错数），
 *   比缺数据更危险。缺数据至少能看见，单位裸乘看不见。
 *
 * 【规格来源等级】
 *   official —— 公开页面同时公布了克重与幅宽（如绍兴e价通「165cm 250 克/平方米」）
 *   estimate —— 行业常见克重区间取中值。**这不是官方逐条公布的数据**，
 *               界面必须把假设的克重与幅宽显示出来，并允许用户改成自己知道的实测值。
 *
 * 克重一律 **g/m²**，幅宽一律 **m**；每米重量 = gsm / 1000 × width（kg/米）。
 */
const FABRIC_SPEC_DEFAULT = {
  width: 1.5,
  widthRange: '1.40~1.65',
  note: '服装面料通行幅宽 1.40~1.65m，默认取 1.50m；用户可改'
};

/**
 * 典型克重（g/m²）—— 按「品类 × 部位」。
 *
 * 数值取各品类常见克重区间的**中值**，range 字段写明区间便于核对。
 * 全部标 estimate：这些是行业常见值，不是官方逐条公布的数据。
 * 用户知道实测克重时应以用户输入为准（界面要让改）。
 */
const FABRIC_WEIGHT = {
  byCategory: {
    apparel_knit: {
      shell: { gsm: 180, range: '160~220', note: '针织 T 恤 / 卫衣类' },
      lining: { gsm: 70, range: '60~90' }
    },
    apparel_shirt: {
      shell: { gsm: 120, range: '110~140', note: '衬衫府绸 / 牛津纺' },
      lining: { gsm: 70, range: '60~90' }
    },
    apparel_pants: {
      shell: { gsm: 260, range: '200~320', note: '斜纹 / 牛仔类' },
      lining: { gsm: 70, range: '60~90' }
    },
    apparel_outerwear: {
      shell: { gsm: 240, range: '200~300', note: '风衣 / 夹克' },
      lining: { gsm: 80, range: '70~110' }
    },
    apparel_down: {
      shell: { gsm: 90, range: '80~110', note: '防绒面料，克重偏轻' },
      lining: { gsm: 70, range: '60~90' }
    },
    apparel_dress: {
      shell: { gsm: 130, range: '110~160' },
      lining: { gsm: 70, range: '60~90' }
    },
    apparel_suit: {
      shell: { gsm: 260, range: '230~300', note: '精纺呢面' },
      lining: { gsm: 80, range: '70~100' }
    },
    apparel_accessory: {
      shell: { gsm: 200, range: '150~280' },
      lining: { gsm: 80, range: '60~120' }
    }
  },
  /** 按部位兜底（品类查不到时用） */
  byPart: {
    shell: { gsm: 180, range: '110~320' },
    lining: { gsm: 70, range: '60~90' },
    interlining: { gsm: 60, range: '40~90' }
  },
  default: { gsm: 180, range: '110~320' }
};

/**
 * 某些面料在价格表里已经同时公布了幅宽与克重，这时不靠估算 —— 直接读。
 * 由 FABRICS[x].spec 解析出的**已公开规格**，grade 记为 official。
 */
const FABRIC_WEIGHT_KNOWN = {
  nylon_cotton_knit: { gsm: 250, width: 1.65, grade: 'official',
    source: '绍兴e价通条目原文「165cm 250 克/平方米」' },
  tencel_cotton: { gsm: 360, width: 1.5, grade: 'official', gramsPerMeter: true,
    source: '绍兴e价通条目原文「150cm 360 克/米」' },
  cotton_twill: { width: 1.48, grade: 'official',
    source: '绍兴e价通条目原文「148cm 20S×16S、128×60」' },
  rayon_print: { width: 1.45, grade: 'official',
    source: '绍兴e价通条目原文「145cm 60S×60S、100×80」' },
  poly_fleece_printed: { gsm: 250, width: 1.5, grade: 'estimate',
    source: '幅宽取自条目「150cm」，克重未公布，取双面绒常见区间中值' },
  poly_fleece_brushed: { gsm: 280, width: 1.5, grade: 'estimate',
    source: '幅宽取自条目「150cm」，克重未公布，取摇粒绒常见区间中值' }
};

/**
 * 辅料成本比例：辅料（拉链、扣子、衬布、里布、五金）成本 = 主料成本 × ratio。
 *
 * 【已知缺陷】按品类给一个固定比例是"一概而论"，比面料还粗：
 * YKK 拉链与普通拉链价差 5~10 倍，在这里完全看不见。
 * 正确做法是按件单列辅料条目（见 AGENTS.md 9.3），但辅料缺官方报价源，
 * **在补到数据源之前不许随便编单价**，所以先用比例兜底并全部标 estimate。
 */
const AUXILIARY_RATIO = {
  apparel_knit: 0.12,
  apparel_shirt: 0.18,
  apparel_pants: 0.15,
  apparel_outerwear: 0.30,
  apparel_down: 0.25,
  apparel_dress: 0.15,
  apparel_suit: 0.45,
  apparel_accessory: 0.15
};

const DEFAULT_AUXILIARY_RATIO = 0.20;

/**
 * 辅料条目 —— 结构先留好，**价格一律为 null**。
 * 因为查不到官方报价源，填任何数字都违反"不许编数字"。
 * 补数据源的路径：代工厂辅料报价单 / 中国五金制品协会 / 拉链行业标准报价。
 */
const AUXILIARY_ITEMS = {
  zipper_ykk: { label: '拉链（YKK 等品牌）', unit: '条', unitPrice: null, grade: 'missing',
    reason: '无官方报价源；YKK 与普通拉链价差 5~10 倍，必须单列' },
  zipper_generic: { label: '拉链（普通）', unit: '条', unitPrice: null, grade: 'missing',
    reason: '无官方报价源' },
  button: { label: '纽扣', unit: '个', unitPrice: null, grade: 'missing', reason: '无官方报价源' },
  thread: { label: '缝纫线', unit: '米', unitPrice: null, grade: 'missing', reason: '无官方报价源' },
  interlining: { label: '衬布 / 粘合衬', unit: '米', unitPrice: null, grade: 'missing', reason: '无官方报价源' },
  label: { label: '吊牌 / 洗标 / 主唛', unit: '套', unitPrice: null, grade: 'missing', reason: '无官方报价源' },
  packaging: { label: '包装袋 / 防尘袋', unit: '个', unitPrice: null, grade: 'missing', reason: '无官方报价源' }
};

/**
 * 品类 × 部位的**典型单件用料重量（克/件）** —— 把"这件衣服用了多少料"变成能填的数字。
 *
 * 与下面的 UNIT_CONSUMPTION（米/件）为什么两条路：
 *   - 米/件：需要成衣用料定额资料（行业标准或代工厂 BOM），手上没有可靠出处 → 留空
 *   - 克/件：**是可称量的** —— 把自己那件放秤上就有数，行业区间也稳定得多。
 *     所以这里给常见区间**中值**，全部标 estimate，界面允许改，并提示"称一下最准"。
 *
 * 数值口径：整件用量（含排料损耗前的净重），不是克重（g/㎡）。
 */
const UNIT_WEIGHT = {
  byCategory: {
    apparel_knit: {
      shell: { g: 200, range: '150~260', note: 'T 恤 / 卫衣面料' }
    },
    apparel_shirt: {
      shell: { g: 180, range: '140~220', note: '衬衫面料' }
    },
    apparel_pants: {
      shell: { g: 350, range: '280~450', note: '裤装面料' },
      lining: { g: 60, range: '40~90' }
    },
    apparel_outerwear: {
      shell: { g: 400, range: '300~550', note: '风衣 / 夹克面料' },
      lining: { g: 100, range: '70~140' }
    },
    apparel_down: {
      shell: { g: 220, range: '180~280', note: '防绒面料' },
      lining: { g: 120, range: '90~160' },
      filling: { g: 180, range: '120~250', note: '充绒量，与款式长短差很多' }
    },
    apparel_dress: {
      shell: { g: 220, range: '160~300' },
      lining: { g: 80, range: '60~110' }
    },
    apparel_suit: {
      shell: { g: 400, range: '350~500', note: '精纺呢面' },
      lining: { g: 120, range: '90~160' }
    },
    apparel_accessory: {
      shell: { g: 150, range: '100~220' }
    }
  },
  /** 按部位兜底 */
  byPart: {
    shell: { g: 250, range: '150~400' },
    lining: { g: 90, range: '60~140' },
    filling: { g: 180, range: '120~250' }
  },
  default: { g: 250, range: '150~400' },
  grade: 'estimate',
  note: '行业常见区间取中值，不是官方公布值。把自己那件放秤上称一下最准，界面允许改'
};

/**
 * 品类典型单耗（米/件）—— **故意留空**。
 * 用户填不出"用了几米布"是真实痛点，但典型单耗需要成衣用料定额资料
 * （如服装用料定额行业标准 / 代工厂 BOM 样本），现在手上没有可靠出处，
 * 填一个"看起来合理"的数字等于编数据。补到出处前，用量必须由用户输入。
 *
 * 注：按重量（克）填报的路径见上面的 UNIT_WEIGHT —— 那条能给出可用默认值，
 * 因为成衣重量是可称量的；米数不行，所以这条仍然留空。
 */
const UNIT_CONSUMPTION = {
  _pending: true,
  reason: '缺成衣用料定额的权威出处（需行业标准或代工厂 BOM 样本），补到之前不许填数',
  byCategory: {}
};

module.exports = {
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
};
