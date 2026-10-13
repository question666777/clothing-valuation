// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js

/**
 * 品牌库 —— 逐品牌、逐系列记录官方口径的毛利率，派生加价倍率。
 *
 * 【硬规则】本文件每条毛利率都必须带 period + source；查不到的靠 tier 兜底并标 estimate。
 * 不许按"无品牌/普通/知名/奢侈"四档一刀切 —— 实测同集团内差 28 个百分点
 * （波司登主品牌 69.1% vs 雪中飞 40.9%），四档只会把数据抹平。
 *
 * 换算（派生值，禁止手填）：
 *   markup       = 1 / (1 - grossMargin)      —— 零售价 ÷ 出厂成本 的倍数
 *   premiumRate  = grossMargin / (1 - grossMargin) —— = markup - 1
 *
 * 【口径警告 · 必读】grossMargin 来自上市公司"综合毛利率"，其分母是品牌方的
 * 营业成本（面辅料采购 + 代工费 + 制造费用），与本模型"材料 + 加工"大体对应但不等价；
 * 而且毛利率**已经包含了渠道费用与利润**，直接拿它当模型里的"品牌溢价率"会与
 * "允许溢出"重复计算。**这是已知未解决的口径冲突，见 AGENTS.md 第 9.1 节。**
 *
 * grade 含义（品牌库专用，与面料表的 official 略有不同）：
 *   official  —— 上市公司定期报告直接口径（报道明确引用财报数字）
 *   semi      —— 经券商研报或媒体二手汇总，未直接核对原始财报
 *   estimate  —— 无公开数据，按板块基准或档位兜底
 */

const BRAND_SNAPSHOT = {
  updatedAt: '2026-09-26',
  note: '各品牌期次不同（有半年报、有财年），比对时务必看 period 字段，不要跨期混比'
};

/**
 * 板块基准（广发证券《纺织服装行业中报总结》口径，2025H1）。
 * 用途：单个品牌查不到时按板块兜底；也可用于判断某品牌是否明显异常。
 */
const INDUSTRY_BENCHMARK = {
  period: '2025H1',
  source: '广发证券 2025 年上半年纺织服装行业中报总结（经中华网、新浪财经报道引用）',
  grade: 'semi',
  segments: {
    industry_all: { label: '纺织服装行业整体', grossMargin: 0.348 },
    textile_mfg: { label: '纺织制造板块', grossMargin: 0.187 },
    apparel_home: { label: '服装家纺板块', grossMargin: 0.505 },
    womenswear: { label: '女装', grossMargin: 0.677 },
    outdoor_sport: { label: '户外体育', grossMargin: 0.559 },
    home_textile: { label: '家纺', grossMargin: 0.516 },
    casual: { label: '休闲服装', grossMargin: 0.45 }
  },
  /** 央视口径的定位分档（粗，仅作说明用，不作为计算依据） */
  positioning: [
    { label: '大众快时尚', grossMarginFloor: 0.4 },
    { label: '中高端', grossMarginFloor: 0.5, grossMarginCeil: 0.7 },
    { label: '奢侈品', grossMarginFloor: 0.7 }
  ]
};

const BRANDS = {
  // ============ 国内 · 港股 ============
  bosideng: {
    label: '波司登',
    company: '波司登国际控股有限公司',
    listing: 'HK:03998',
    tier: 'known',
    aliases: ['波司登', 'Bosideng', 'BOSIDENG'],
    grossMargin: 0.572,
    period: '2025/26财年（截至2026-03-31）',
    source: '港交所《截至2026年3月31日止年度的年度业绩》，经中新经纬、南方财经网报道',
    grade: 'official',
    series: {
      main: { label: '波司登主品牌', grossMargin: 0.691, period: '2025/26财年', grade: 'official' },
      xuezhongfei: { label: '雪中飞', grossMargin: 0.409, period: '2025/26财年', grade: 'official' },
      downwear: { label: '品牌羽绒服业务（整体）', grossMargin: 0.627, period: '2025/26财年', grade: 'official' }
    },
    note: '同集团内主品牌与雪中飞差 28.2 个百分点，是"禁止按档位一刀切"最直接的证据'
  },
  anta: {
    label: '安踏',
    company: '安踏体育用品有限公司',
    listing: 'HK:02020',
    tier: 'known',
    aliases: ['安踏', 'ANTA', 'Anta'],
    grossMargin: 0.62,
    period: '2025财年',
    source: '港交所 2025 年业绩公告，经新华网、南方+报道',
    grade: 'official',
    series: {
      main: { label: '安踏主品牌', grossMargin: 0.536, period: '2025财年', grade: 'official' },
      fila: { label: 'FILA', grossMargin: 0.664, period: '2025财年', grade: 'official' },
      others: { label: '迪桑特 / 可隆等其他品牌', grossMargin: 0.718, period: '2025财年', grade: 'official' }
    }
  },
  lining: {
    label: '李宁',
    company: '李宁有限公司',
    listing: 'HK:02331',
    tier: 'known',
    aliases: ['李宁', 'LI-NING', 'LiNing'],
    grossMargin: 0.49,
    period: '2025财年',
    source: '港交所《截至2025年12月31日年度经审核综合业绩公告》，经证券时报报道',
    grade: 'official'
  },
  xtep: {
    label: '特步',
    company: '特步国际控股有限公司',
    listing: 'HK:01368',
    tier: 'common',
    aliases: ['特步', 'XTEP', 'Xtep'],
    grossMargin: 0.428,
    period: '2025财年',
    source: '港交所 2025 年度业绩公告，经证券时报报道',
    grade: 'official'
  },
  d361: {
    label: '361度',
    company: '361度国际有限公司',
    listing: 'HK:01361',
    tier: 'common',
    aliases: ['361度', '361°', '361'],
    grossMargin: 0.415,
    period: '2025财年',
    source: '2025 年度业绩，经新华网报道引用',
    grade: 'semi'
  },
  jnby: {
    label: '江南布衣',
    company: '江南布衣有限公司',
    listing: 'HK:03306',
    tier: 'known',
    aliases: ['江南布衣', 'JNBY', '速写', 'LESS'],
    grossMargin: 0.656,
    period: '2025财年（截至2025-06-30）',
    source: '2025 财年全年业绩，经南方都市报、大洋网报道',
    grade: 'official',
    series: {
      jnby: { label: 'JNBY（核心品牌）', grossMargin: null, period: '2025财年', grade: 'estimate' },
      growth: { label: '速写 / JNBY by JNBY / LESS', grossMargin: null, period: '2025财年', grade: 'estimate' }
    },
    note: '财报只披露集团整体毛利率 65.6%，未逐品牌披露，系列级留空待补'
  },

  // ============ 国内 · A 股 ============
  hla: {
    label: '海澜之家',
    company: '海澜之家集团股份有限公司',
    listing: 'SH:600398',
    tier: 'common',
    aliases: ['海澜之家', 'HLA'],
    grossMargin: 0.4599,
    period: '2025H1',
    source: '2025 年半年报，经广发证券中报总结转引',
    grade: 'semi'
  },
  semir: {
    label: '森马',
    company: '浙江森马服饰股份有限公司',
    listing: 'SZ:002563',
    tier: 'common',
    aliases: ['森马', 'Semir', '巴拉巴拉', 'Balabala'],
    grossMargin: 0.4781,
    period: '2025H1',
    source: '2025 年半年报，经广发证券中报总结转引',
    grade: 'semi'
  },
  baoxiniao: {
    label: '报喜鸟',
    company: '报喜鸟控股股份有限公司',
    listing: 'SZ:002154',
    tier: 'known',
    aliases: ['报喜鸟', 'BXN'],
    grossMargin: 0.6489,
    period: '2025H1',
    source: '2025 年半年报，经广发证券中报总结转引',
    grade: 'semi'
  },
  ellassay: {
    label: '歌力思',
    company: '深圳歌力思服饰股份有限公司',
    listing: 'SH:603808',
    tier: 'known',
    aliases: ['歌力思', 'ELLASSAY'],
    grossMargin: 0.7091,
    period: '2025H1',
    source: '2025 年半年报，经广发证券中报总结转引',
    grade: 'semi'
  },
  biemlfdlkk: {
    label: '比音勒芬',
    company: '比音勒芬服饰股份有限公司',
    listing: 'SZ:002832',
    tier: 'luxury',
    aliases: ['比音勒芬', 'Biem.l.fdlkk', 'Biemlofen'],
    grossMargin: 0.7588,
    period: '2025H1',
    source: '2026 年半年度报告，经新浪财经、中华网报道',
    grade: 'official',
    note: '毛利率超过同期爱马仕（71.14%），A 股服装板块高位；高毛利率伴随高渠道维护成本'
  },

  // ============ 国际 ============
  uniqlo: {
    label: '优衣库',
    company: '迅销集团（Fast Retailing）',
    listing: 'TYO:9983',
    tier: 'common',
    aliases: ['优衣库', 'UNIQLO', 'Uniqlo', '迅销'],
    grossMargin: 0.538,
    period: '2025财年（截至2025-08-31）',
    source: '迅销集团 2025 财年财务报告，经品牌方舟报道',
    grade: 'official'
  },
  zara: {
    label: 'Zara',
    company: 'Inditex 集团',
    listing: 'BME:ITX',
    tier: 'common',
    aliases: ['Zara', 'ZARA', 'Inditex', '飒拉'],
    grossMargin: 0.583,
    period: 'FY2025（截至2026-01-31）',
    source: 'Inditex 官方 FY2025 业绩发布，经 SGI Europe 报道',
    grade: 'official'
  },
  hm: {
    label: 'H&M',
    company: 'H&M Hennes & Mauritz AB',
    listing: 'STO:HM-B',
    tier: 'common',
    aliases: ['H&M', 'HM', 'Hennes'],
    grossMargin: 0.534,
    period: 'FY2025（截至2025-11-30）',
    source: 'H&M 集团 FY2025 年报',
    grade: 'official'
  },
  hermes: {
    label: '爱马仕',
    company: 'Hermès International',
    listing: 'EPA:RMS',
    tier: 'luxury',
    aliases: ['爱马仕', 'Hermès', 'Hermes'],
    grossMargin: 0.7114,
    period: '2025H1',
    source: '2025 年上半年业绩，经新浪财经、中华网报道引用',
    grade: 'semi'
  },
  adidas: {
    label: '阿迪达斯',
    company: 'adidas AG',
    listing: 'ETR:ADS',
    tier: 'known',
    aliases: ['阿迪达斯', 'adidas', 'Adidas', '阿迪'],
    grossMargin: 0.516,
    period: '2025财年',
    source: '安踏 2025 年业绩报道中作为横向对比引用，未直接核对 adidas 原始财报',
    grade: 'semi'
  },
  nike: {
    label: '耐克',
    company: 'NIKE, Inc.',
    listing: 'NYSE:NKE',
    tier: 'known',
    aliases: ['耐克', 'Nike', 'NIKE'],
    grossMargin: 0.427,
    period: '2025财年',
    source: '安踏 2025 年业绩报道中作为横向对比引用，未直接核对 Nike 原始财报',
    grade: 'semi'
  },
  lululemon: {
    label: 'lululemon',
    company: 'Lululemon Athletica Inc.',
    listing: 'NASDAQ:LULU',
    tier: 'known',
    aliases: ['lululemon', 'Lululemon', '露露乐蒙'],
    grossMargin: 0.566,
    period: '2025财年',
    source: '安踏 2025 年业绩报道中作为横向对比引用，未直接核对原始财报',
    grade: 'semi'
  },
  ralphlauren: {
    label: 'Ralph Lauren',
    company: 'Ralph Lauren Corporation',
    listing: 'NYSE:RL',
    tier: 'known',
    aliases: ['Ralph Lauren', '拉夫劳伦', 'Polo Ralph Lauren'],
    grossMargin: 0.699,
    period: 'FY2025/FY2026 10-K',
    source: '8 家美国上市服装公司 10-K 汇总（eightx.co Apparel Brand Financial Benchmarks 2026）',
    grade: 'semi'
  },
  gap: {
    label: 'Gap',
    company: 'The Gap, Inc.',
    listing: 'NYSE:GAP',
    tier: 'common',
    aliases: ['Gap', 'GAP', '盖璞'],
    grossMargin: 0.408,
    period: 'FY2025/FY2026 10-K',
    source: '8 家美国上市服装公司 10-K 汇总（eightx.co Apparel Brand Financial Benchmarks 2026）',
    grade: 'semi'
  }
};

/**
 * 品牌 → 主营品类 + 一句话业务构成（**导航元数据，不是价格数据**）。
 *
 * 【为什么必须分开标】"有些牌子只做衣服，有些只做别的"不是偏见，是事实：
 *   波司登的毛利率 57.2% 来自羽绒服业务，把它摆在一个"要估 T 恤"的人面前，
 *   他要么以为我们在乱推荐，要么挑中了、拿一个羽绒服口径的倍率去估 T 恤。
 *   同理爱马仕的成衣业务和它的皮具箱包不是一回事 —— 本模型只估衣物，
 *   所以 focus 里要写明它的皮具业务不在这套口径里。
 *
 * 【为什么只排序分组、不过滤】品牌跨品类卖货是常态（波司登也出过 T 恤）。
 *   硬过滤会让用户找不到自己的牌子，还以为是我们的库太差 ——
 *   那比"列表长一点"糟得多。所以界面把适合本类的排前面并标记，
 *   其余收进"其他品类"，**一个都不藏**。
 *
 * categories 为 null → 全品类（快时尚 / 基础款这类本来就全做）。
 */
const BRAND_CATEGORY = {
  bosideng: { categories: ['apparel_down'], focus: '羽绒服为主，也做防晒服等功能外套' },
  anta: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '运动服（T恤 / 卫衣 / 运动裤 / 运动外套）' },
  lining: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '运动服（T恤 / 卫衣 / 运动裤 / 运动外套）' },
  xtep: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '运动服（跑鞋占大头，服装以运动外套为主）' },
  d361: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '运动服（跑鞋占大头，服装以运动外套为主）' },
  jnby: { categories: ['apparel_dress', 'apparel_shirt', 'apparel_knit', 'apparel_outerwear'], focus: '女装为主（裙装 / 衬衫 / 针织 / 外套）' },
  hla: { categories: ['apparel_shirt', 'apparel_pants', 'apparel_outerwear', 'apparel_suit'], focus: '男装为主（衬衫 / 裤装 / 外套 / 西服）' },
  semir: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '休闲服（T恤 / 卫衣 / 裤装 / 外套）' },
  baoxiniao: { categories: ['apparel_suit', 'apparel_shirt', 'apparel_pants'], focus: '男装西服为主' },
  ellassay: { categories: ['apparel_dress', 'apparel_shirt', 'apparel_knit', 'apparel_outerwear'], focus: '女装（裙装 / 衬衫 / 针织 / 外套）' },
  biemlfdlkk: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '高尔夫男装（polo / 裤装 / 外套）' },
  uniqlo: { categories: null, focus: '全品类基础款，男女装童装都做' },
  zara: { categories: null, focus: '全品类快时尚' },
  hm: { categories: null, focus: '全品类快时尚' },
  hermes: { categories: ['apparel_outerwear', 'apparel_dress', 'apparel_knit', 'apparel_shirt', 'apparel_accessory'], focus: '成衣与配饰；皮具箱包不在本模型范围（只估衣物）' },
  adidas: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '运动服（鞋类占大头，服装以运动外套 / 卫衣为主）' },
  nike: { categories: ['apparel_knit', 'apparel_pants', 'apparel_outerwear'], focus: '运动服（鞋类占大头，服装以运动外套 / 卫衣为主）' },
  lululemon: { categories: ['apparel_pants', 'apparel_knit', 'apparel_outerwear'], focus: '瑜伽 / 运动服（裤装是主力）' },
  ralphlauren: { categories: ['apparel_shirt', 'apparel_knit', 'apparel_outerwear', 'apparel_pants'], focus: '美式休闲（衬衫 / 针织 / 外套 / 裤装）' },
  gap: { categories: null, focus: '休闲服全品类' }
};

/**
 * 口径不明、**故意不录**的品牌，留档免得下次重复找：
 *   LVMH、Kering（Gucci 母公司）—— 公开报道只给到"经营利润率"（Kering 2025 年 11.1%、
 *   LVMH 时尚皮具部门约 22%），与"毛利率"不是一个口径，混用会系统性低估。
 *   要用必须找到原始财报的 gross margin。
 */
const REJECTED_BRANDS = {
  lvmh: { label: 'LVMH', reason: '只查到经营利润率口径（时尚皮具部门约 22%），非毛利率，禁止混用' },
  kering: { label: 'Kering', reason: '只查到经营利润率口径（2025 年 11.1%），非毛利率，禁止混用' }
};

function markupFrom(grossMargin) {
  if (typeof grossMargin !== 'number' || !isFinite(grossMargin)) return null;
  if (grossMargin <= 0 || grossMargin >= 1) return null;
  return 1 / (1 - grossMargin);
}

function premiumRateFrom(grossMargin) {
  const markup = markupFrom(grossMargin);
  return markup === null ? null : markup - 1;
}

module.exports = {
  BRAND_SNAPSHOT,
  INDUSTRY_BENCHMARK,
  BRANDS,
  BRAND_CATEGORY,
  REJECTED_BRANDS,
  markupFrom,
  premiumRateFrom
};
