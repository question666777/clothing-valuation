// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js

/**
 * 物品识别服务。
 *
 * 当前只有文本兜底实现（本地关键词匹配），用于打通链路。
 * 接入多模态大模型时必须走服务端中转：App 前端直连会让 API Key 随包分发，
 * 违反 AGENTS.md 第 4 节密钥红线。
 *
 * 对外契约：输入原始文本，输出
 * { category, brandTier, fabricKey, fiberHints, hintNote, confidence, source }。
 *
 * `fiberHints` 是**推测**，不是识别到的事实：商品名说明不了成分。界面必须标明
 * 「按商品名推测，请核对」，绝不许当成识别结果直接算价。
 * `fabricKey` 只在该面料档**真实存在于** config/fabric.js 的 FABRICS 里时才给 ——
 * 给一个查不到价的 key，识别命中反而落空，用户看到的是"识别到了但用不了"。
 */

// 顺序敏感：先匹配更具体的子类，避免"羽绒裤"被"裤"抢先命中
//
// **只收衣物**（2026-09-27 收窄）：鞋与包已移出，另见 UNSUPPORTED_CATEGORIES。
const CATEGORY_RULES = [
  { category: 'apparel_down', words: ['羽绒', '鹅绒', '鸭绒', '冲锋衣'] },
  { category: 'apparel_suit', words: ['西装', '西服', '礼服', '正装'] },
  { category: 'apparel_accessory', words: ['帽', '围巾', '腰带', '皮带', '手套', '袜子', '领带'] },
  { category: 'apparel_dress', words: ['裙', '连衣裙', '旗袍'] },
  { category: 'apparel_shirt', words: ['衬衫', '衬衣', 'polo'] },
  { category: 'apparel_pants', words: ['裤', '牛仔裤', '短裤', '运动裤', '休闲裤'] },
  { category: 'apparel_outerwear', words: ['外套', '夹克', '大衣', '风衣', '棉服', '皮衣'] },
  { category: 'apparel_knit', words: ['t恤', 'tee', '卫衣', '毛衣', '针织', '打底衫', '背心', '羊绒衫'] }
];

/**
 * MVP 不做的品类 —— **不是删掉，是明确告知**。
 *
 * 用户输入"运动鞋"时，如果界面什么都不发生，他分不清是「没识别出来」还是
 * 「本来就不做」；前者他会重试、换词，后者才是事实。所以单独留一张表，
 * 命中就如实说清"暂不支持"，并给出理由。
 *
 * 为什么不做：鞋与包的成本大头是鞋底 / 模具 / 五金 / 版型开发，不是面料 ——
 * 用「面料价 × 用量」推出来的数字会严重偏离，比不做更坏（AGENTS.md 1.3 同源）。
 */
const UNSUPPORTED_CATEGORIES = [
  { label: '鞋', words: ['鞋', '球鞋', '皮鞋', '靴', '拖鞋', '凉鞋'] },
  { label: '包', words: ['背包', '手提包', '单肩包', '钱包', '双肩包', '皮包', '包袋'] }
];

const BRAND_RULES = [
  { brandTier: 'luxury', words: ['爱马仕', 'hermes', '香奈儿', 'chanel', 'lv', '路易威登', 'gucci', '古驰', '普拉达', 'prada', 'dior', '迪奥', '巴黎世家', 'burberry', '巴宝莉'] },
  { brandTier: 'known', words: ['耐克', 'nike', '阿迪达斯', 'adidas', '北面', 'thenorthface', 'lululemon', '优衣库', 'uniqlo', 'zara', '李宁', '安踏', '波司登', '海澜之家', '太平鸟'] }
];

/**
 * 面料 / 款式词 → **纤维线索**（不是面料档）。
 *
 * 为什么不能直接给面料 key：官方报价只按「纤维 × 规格档」发布，
 * 没有"牛仔布""雪纺""摇粒绒"这类面料名的报价档（见 AGENTS.md 5.1）。
 * 老实现直接产出面料 key，16 个里 10 个在 FABRICS 里不存在，
 * 而落空的恰好是商品名里最常见的词（牛仔、棉、涤纶、卫衣…）——
 * 命中反而等于没识别。现在改成给纤维线索：牛仔 ≈ 棉、摇粒绒 ≈ 涤纶，
 * 落到真正有权威价的档上。
 *
 * `fibers` 为空的项是**故意不猜**：针织是织法、加厚是厚度、混纺没给比例，
 * 这些说明不了成分。猜错会把整个估价建在假成分上，比不猜更坏（AGENTS.md 1.3）。
 */
const FABRIC_HINTS = [
  // 顺序敏感：先具体后笼统，否则"羊绒"会被"羊毛"抢、"棉涤混纺"会被"棉"抢
  { words: ['混纺'], fabricKey: '', fibers: [],
    note: '只提到混纺、没给比例。成分比例是国标强制标注的，拍水洗标能直接读到' },
  { words: ['羊绒', '山羊绒'], fabricKey: 'cashmere', fibers: [{ fiber: 'cashmere', pct: 100 }] },
  { words: ['真丝', '丝绸', '桑蚕丝'], fabricKey: 'silk', fibers: [{ fiber: 'silk', pct: 100 }] },
  { words: ['亚麻', '麻布'], fabricKey: 'linen', fibers: [{ fiber: 'linen', pct: 100 }] },
  { words: ['真皮', '牛皮', '羊皮', '头层皮'], fabricKey: 'leather_real',
    fibers: [{ fiber: 'leather', pct: 100 }] },
  { words: ['人造革', '合成革', 'pu皮'], fabricKey: 'leather_pu',
    fibers: [{ fiber: 'pu', pct: 100 }] },
  { words: ['羽绒', '鸭绒', '鹅绒'], fabricKey: 'down_filling',
    fibers: [{ fiber: 'down', pct: 100 }],
    note: '含绒量未知 —— 羽绒价按含绒量分 16 档，70% 与 95% 差 167%，请选准档位' },
  { words: ['羊毛', '毛呢', '呢子'], fabricKey: '', fibers: [{ fiber: 'wool', pct: 100 }],
    note: '羊毛价按细度分档；若是毛涤混纺，请把成分改成实际比例' },
  { words: ['牛仔'], fabricKey: '', fibers: [{ fiber: 'cotton', pct: 100 }],
    note: '牛仔布多为纯棉或棉涤混纺。官方没有"牛仔布"这个报价档，这里按棉估算' },
  { words: ['帆布'], fabricKey: '', fibers: [{ fiber: 'cotton', pct: 100 }], note: '按棉估算' },
  { words: ['摇粒绒', '抓绒', '网布', '网眼', '速干', '雪纺'], fabricKey: '',
    fibers: [{ fiber: 'polyester', pct: 100 }],
    note: '这几类基本是聚酯纤维；雪纺也可能是真丝，若为真丝请改成分' },
  { words: ['纯棉', '全棉', '棉'], fabricKey: '', fibers: [{ fiber: 'cotton', pct: 100 }] },
  { words: ['涤纶', '聚酯'], fabricKey: '', fibers: [{ fiber: 'polyester', pct: 100 }] },
  { words: ['粘胶', '黏胶', '人造丝'], fabricKey: '', fibers: [{ fiber: 'viscose', pct: 100 }] },
  // 说明不了成分的 —— 故意留空，由界面如实告知
  { words: ['针织', '罗纹'], fabricKey: '', fibers: [],
    note: '针织 / 罗纹是织法、不是成分 —— 棉、羊毛、涤纶都可能是，无法据此定价' },
  { words: ['加厚', '毛圈', '卫衣'], fabricKey: '', fibers: [],
    note: '厚薄说明不了成分，请拍水洗标或手动填实际成分' }
];

// ---------------------------------------------------------------- 水洗标成分解析

/**
 * 纤维规范名词典。
 *
 * 依据 GB/T 11951（天然纤维）/ GB/T 4146.1（化学纤维）/ GB/T 17685（羽绒羽毛），
 * **只收规范名与公认等价写法**。商品名、营销词一律不收（见 MARKETING_WORDS）。
 * 匹配按"最长命中"取，避免「麻」抢了「亚麻」、「丝」抢了「桑蚕丝」。
 *
 * 【落点规则】表里的 fiber 值必须能在 config/fabric.js 里找到落点 ——
 * 要么在 FIBERS（有价），要么在 PENDING_FIBERS（已登记"暂无权威出处"）。
 * 两处都没有 = 识别命中却查不到价，而且连原因都说不清（会落到兜底的
 * "该纤维不在价格表中"）。校验脚本守着这条，新增词时一起补登记。
 *
 * 查不到价的（亚麻、锦纶、氨纶…）也照收 —— 先如实识别出来，
 * 再由价格层告诉用户"这个纤维暂时取不到官方报价"，不许假装没看见。
 */
const FIBER_TERMS = [
  { fiber: 'cashmere', words: ['山羊绒', '羊绒'] },
  { fiber: 'wool', words: ['绵羊毛', '羊毛', '美利奴', '美丽诺'] },
  { fiber: 'mohair', words: ['马海毛', '安哥拉山羊毛'] },
  { fiber: 'alpaca', words: ['羊驼毛', '阿尔帕卡'] },
  { fiber: 'rabbit', words: ['安哥拉兔毛', '兔毛'] },
  { fiber: 'silk', words: ['桑蚕丝', '柞蚕丝', '真丝', '蚕丝', '生丝'] },
  { fiber: 'down', words: ['鸭绒', '鹅绒', '羽绒'] },
  { fiber: 'cotton', words: ['棉'] },
  { fiber: 'polyester', words: ['聚酯纤维', '聚酯', '涤纶'] },
  { fiber: 'polypropylene', words: ['聚丙烯纤维', '丙纶'] },
  { fiber: 'viscose', words: ['粘胶纤维', '粘胶', '黏胶', '人造丝'] },
  { fiber: 'linen', words: ['亚麻', '苎麻', '大麻'] },
  { fiber: 'nylon', words: ['聚酰胺纤维', '聚酰胺', '锦纶', '尼龙'] },
  { fiber: 'spandex', words: ['聚氨酯弹性纤维', '氨纶', '莱卡'] },
  { fiber: 'acrylic', words: ['聚丙烯腈纤维', '聚丙烯腈', '腈纶'] },
  { fiber: 'modal', words: ['莫代尔'] },
  { fiber: 'lyocell', words: ['莱赛尔', '天丝'] },
  { fiber: 'acetate', words: ['醋酸纤维', '醋酯纤维'] },
  { fiber: 'leather', words: ['头层牛皮', '牛皮', '羊皮', '真皮'] },
  { fiber: 'pu', words: ['人造革', '合成革'] },
  // 国标允许的一种**非纤维**标注：两种以上各 ≤5% 且合计 ≤15% 时集中标"其他纤维"。
  // 收进来是为了让占比能凑到 100% —— 否则用户为了通过校验只能瞎填一个纤维。
  // 它没有价，价格层会把它如实记为"未定价"（见 config 的 OTHER_FIBER）。
  { fiber: '__other__', words: ['其他纤维', '其它纤维'] }
];

/**
 * 营销词黑名单 —— 这些**不是纤维名**，读到必须拒绝。
 *
 * 「云朵棉」里含「棉」、「冰感丝」里含「丝」，直接拿去查价会把整个估价
 * 建立在一个假成分上。做法是**先把这些词整段抠掉**，再解析剩下的文字。
 */
const MARKETING_WORDS = [
  '云朵棉', '冰感丝', '冰丝', '恒温羊绒', '空气棉', '牛奶丝', '柔丝', '暖绒',
  '珍珠纤维', '石墨烯', '负离子', '远红外', '抗菌棉', '生态棉', '亲肤棉',
  '大豆纤维', '太空棉', '记忆棉', '芦荟棉'
];

/** 部位标记。顺序敏感：里料/填充要先于面料判断，"面料"太泛放最后。 */
const PART_TERMS = [
  { part: 'lining', words: ['里料', '里布', '内衬', '衬里'] },
  { part: 'filling', words: ['填充物', '填充', '充绒'] },
  { part: 'shell', words: ['面料', '大身', '主料', '面层'] }
];

const PART_LABEL = { shell: '面料', lining: '里料', filling: '填充', trim: '辅料', hardware: '五金' };

/** 羽绒标准含绒量档（GB/T 14272 口径），与 config/fabric.js 的档位一一对应 */
const DOWN_TIERS = [70, 80, 90, 95];

/** 这些词后面跟的数字不是成分占比，别当纤维解析（部位词也要挡，否则会被当成纤维名） */
const NOISE_WORDS = [
  '面料', '里料', '里布', '内衬', '填充', '充绒', '含绒量', '绒子含量', '充绒量',
  '克重', '安全技术类别', '执行标准', '产品标准'
];

function normalizeLabelText(text) {
  return String(text || '')
    // 全角字母数字 → 半角
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    })
    .replace(/％/g, '%')
    .replace(/[\u3000\t]+/g, ' ')
    .trim();
}

/** 把营销词整段抠掉，剩下的文字里才不会凭空冒出"棉""丝" */
function stripMarketingWords(text, rejected) {
  let out = text;
  MARKETING_WORDS.forEach(function (w) {
    if (out.indexOf(w) >= 0) {
      rejected.push(w);
      out = out.split(w).join(' ');
    }
  });
  return out;
}

function matchFiberTerm(name) {
  let best = null;
  for (let i = 0; i < FIBER_TERMS.length; i += 1) {
    const term = FIBER_TERMS[i];
    for (let j = 0; j < term.words.length; j += 1) {
      const word = term.words[j];
      if (name.indexOf(word) >= 0 && (!best || word.length > best.word.length)) {
        best = { fiber: term.fiber, word: word };
      }
    }
  }
  return best;
}

function isNoiseName(name) {
  for (let i = 0; i < NOISE_WORDS.length; i += 1) {
    if (name.indexOf(NOISE_WORDS[i]) >= 0) return true;
  }
  return false;
}

/** 含绒量落到标准档：向下取整（85% 记作 80%，不往上抬） */
function nearestDownTier(pct) {
  let best = DOWN_TIERS[0];
  for (let i = 0; i < DOWN_TIERS.length; i += 1) {
    if (pct >= DOWN_TIERS[i]) best = DOWN_TIERS[i];
  }
  return best;
}

/**
 * 羽绒要单独解析：段里的百分比是**含绒量**，不是成分占比。
 * 「白鸭绒 90%」→ 含绒量 90% + 绒种白鸭，对应档位 white_duck_90。
 */
function parseDownSegment(seg) {
  const m = seg.match(/(白|灰)?\s*(鸭|鹅)\s*绒/);
  if (!m) return null;

  const color = m[1] === '灰' ? 'grey' : 'white';
  const bird = m[2] === '鹅' ? 'goose' : 'duck';

  const pm = seg.match(/(\d{2,3}(?:\.\d+)?)\s*%/);
  const declared = pm ? parseFloat(pm[1]) : null;
  const tierPct = declared ? nearestDownTier(declared) : 90;

  return {
    fiber: 'down',
    pct: 100,
    tier: color + '_' + bird + '_' + tierPct,
    declaredDownPct: declared,
    usedDownPct: tierPct,
    word: m[0]
  };
}

/**
 * 按部位词把一段文字切成若干「部位 → 成分串」。
 * OCR 常把多行合成一行，所以不能只按换行切。
 */
function splitByPart(text) {
  const marks = [];
  PART_TERMS.forEach(function (t) {
    t.words.forEach(function (w) {
      let from = 0;
      let idx = text.indexOf(w, from);
      // 同一个部位词在一段里出现多次时只取第一次，避免切出空片
      if (idx >= 0) marks.push({ idx: idx, len: w.length, part: t.part });
    });
  });

  if (marks.length === 0) return [{ part: 'shell', text: text }];

  marks.sort(function (a, b) { return a.idx - b.idx; });

  const out = [];
  if (marks[0].idx > 0) out.push({ part: 'shell', text: text.slice(0, marks[0].idx) });
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].idx + marks[i].len;
    const end = i + 1 < marks.length ? marks[i + 1].idx : text.length;
    if (end <= start) continue;
    out.push({ part: marks[i].part, text: text.slice(start, end) });
  }
  return out;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * 从水洗标 / 吊牌文字里解析纤维成分。
 *
 * 主路径是"拍水洗标 → OCR → 这里解析"。找不到 OCR 时，用户把手洗标上的字
 * 打字进来同样走这个函数，所以**这条链路永远可用**，不依赖任何外部服务。
 *
 * 返回结构：
 *   parts    [{ part, label, fibers: [{ fiber, pct, tier? }], pctSum, balanced }]
 *   rejected 被拒绝的营销词（"云朵棉"这类，必须让用户看见为什么没算）
 *   unknown  读到了但认不出是哪种纤维的词
 *   warnings 需要如实告诉用户的事（成分和不足 100%、格式不像国标写法等）
 *   ok       是否解析出至少一个部位
 */
function parseFiberLabelText(text) {
  const out = {
    ok: false,
    parts: [],
    rejected: [],
    unknown: [],
    warnings: []
  };

  const normalized = normalizeLabelText(text);
  if (!normalized) {
    out.warnings.push('没有读到可解析的成分文字');
    return out;
  }

  const cleaned = stripMarketingWords(normalized, out.rejected);

  // 先按换行/分号粗切，再对每片按部位词细切
  const rough = cleaned.split(/[\n;；|]+/).map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });

  const collected = [];
  rough.forEach(function (line) {
    splitByPart(line).forEach(function (piece) {
      if (piece.text.trim()) collected.push(piece);
    });
  });

  // 成分正则：「纤维名 + 可选冒号 + 数字 + %」，这是国标写法。
  // 纤维名长度从 1 字起 —— 「棉」就是单字，写成 {2,} 会把最常见的那种纤维整个漏掉。
  const fiberRe = /([\u4e00-\u9fa5A-Za-z]{1,12})\s*:?\s*(\d{1,3}(?:\.\d+)?)\s*%/g;

  collected.forEach(function (piece) {
    const seg = piece.text;
    const fibers = [];

    // 羽绒先单独处理，否则它那个百分比会被当成分占比
    const down = parseDownSegment(seg);
    if (down) fibers.push(down);

    let m;
    fiberRe.lastIndex = 0;
    while ((m = fiberRe.exec(seg)) !== null) {
      const name = m[1];
      const pct = parseFloat(m[2]);

      if (!(pct > 0) || pct > 100) continue;
      if (isNoiseName(name)) continue;
      if (down && name.indexOf('绒') >= 0) continue; // 羽绒已计入，别重复

      const hit = matchFiberTerm(name);
      if (!hit) {
        if (name.length >= 2) out.unknown.push(name);
        continue;
      }

      const exist = fibers.filter(function (f) { return f.fiber === hit.fiber; })[0];
      if (exist) {
        // 同一部位同一纤维出现两次，通常是 OCR 读重了 —— 合并并提示，不静默吞掉
        exist.pct = round1(exist.pct + pct);
        out.warnings.push('「' + hit.word + '」在同一条用料里出现了两次，已合并计算');
      } else {
        fibers.push({ fiber: hit.fiber, pct: pct, word: hit.word });
      }
    }

    if (fibers.length === 0) return;

    let pctSum = 0;
    fibers.forEach(function (f) { pctSum += f.pct; });
    pctSum = round1(pctSum);

    const balanced = Math.abs(pctSum - 100) <= 1;
    if (!balanced) {
      // 不足 100% 不许静默补齐（AGENTS.md 1.3）
      out.warnings.push(
        (PART_LABEL[piece.part] || piece.part) + '成分合计 ' + pctSum
        + '%，不是 100% —— 按标称值原样计算，未做补齐'
      );
    }

    out.parts.push({
      part: piece.part,
      label: PART_LABEL[piece.part] || piece.part,
      fibers: fibers,
      pctSum: pctSum,
      balanced: balanced
    });
  });

  if (out.rejected.length > 0) {
    out.warnings.push(
      '拒绝 ' + out.rejected.length + ' 个非规范纤维名（' + out.rejected.join('、')
      + '）—— 这类是营销词，不是 GB/T 里的纤维规范名，不能拿去查价'
    );
  }
  if (out.unknown.length > 0) {
    out.warnings.push('认不出这些词属于哪种纤维：' + out.unknown.join('、'));
  }

  out.ok = out.parts.length > 0;
  if (!out.ok) {
    out.warnings.push('没能从这段文字里解出成分，请按「纤维名 + 含量%」格式填写，例如「羊毛 80% 涤纶 20%」');
  }
  return out;
}

function recognizeByText(text) {
  const input = (text || '').toLowerCase();
  const hint = matchHint(input);
  const unsupported = matchUnsupported(input);
  // 不在做的品类直接短路：**不返回任何线索**。
  // 否则"帆布鞋"会从"帆布"推出棉 100%，用户可能把这件鞋的估价
  // 按衣物表单算下去 —— 那是一条通往错数的静默通道。
  const blocked = !!unsupported;

  return {
    category: blocked ? '' : (matchFirst(CATEGORY_RULES, 'category', input) || ''),
    brandTier: matchFirst(BRAND_RULES, 'brandTier', input) || 'common',
    // 只在该面料档真实存在于 FABRICS 里时才给 key，否则留空交由界面提示
    fabricKey: (!blocked && hint) ? (hint.fabricKey || '') : '',
    // 给的是**纤维线索**不是确定成分。界面必须标明这是按商品名推测的
    fiberHints: (!blocked && hint) ? hint.fibers.map(function (f) {
      return { fiber: f.fiber, pct: f.pct };
    }) : [],
    // 推测理由 / 需要用户确认的点，界面原样展示，不要吞掉
    hintNote: (!blocked && hint) ? (hint.note || '') : '',
    // 品类不支持时的说明。界面必须原样展示 —— 静默无反应最坏
    unsupportedNote: blocked
      ? ('「' + unsupported + '」目前不支持 —— 只估衣物。'
        + unsupported + '的成本大头不在面料（鞋底 / 模具 / 五金 / 版型开发），'
        + '按面料价推算会给出一个看着像样、实际偏得很远的数，所以我们不做')
      : '',
    confidence: input ? 0.4 : 0,
    source: 'text-fallback'
  };
}

function matchUnsupported(input) {
  for (let i = 0; i < UNSUPPORTED_CATEGORIES.length; i += 1) {
    const rule = UNSUPPORTED_CATEGORIES[i];
    for (let j = 0; j < rule.words.length; j += 1) {
      if (input.indexOf(rule.words[j]) >= 0) return rule.label;
    }
  }
  return '';
}

function matchHint(input) {
  for (let i = 0; i < FABRIC_HINTS.length; i += 1) {
    const words = FABRIC_HINTS[i].words;
    for (let j = 0; j < words.length; j += 1) {
      if (input.indexOf(words[j]) >= 0) return FABRIC_HINTS[i];
    }
  }
  return null;
}

function recognizeByImage() {
  // 待服务端识别接口就绪后实现，保持返回结构一致
  return Promise.reject(new Error('图片识别尚未接入，请先手动录入'));
}

function matchFirst(rules, key, input) {
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = 0; j < rules[i].words.length; j += 1) {
      if (input.indexOf(rules[i].words[j]) >= 0) {
        return rules[i][key];
      }
    }
  }
  return '';
}

module.exports = {
  recognizeByText: recognizeByText,
  recognizeByImage: recognizeByImage,
  // 水洗标文字 → 纤维成分。OCR 与手动输入共用这一条链路。
  parseFiberLabelText: parseFiberLabelText,
  // 导出线索表供校验脚本做**静态**一致性检查：
  // 表里每个 fabricKey 都必须真实存在于 FABRICS、每个 fiber 都必须有价或已登记无价。
  // 老实现就栽在这里 —— 16 个 key 有 10 个查不到，且没人发现。
  FABRIC_HINTS: FABRIC_HINTS,
  // 同上：水洗标词典里的每个 fiber 也必须有落点（FIBERS 或 PENDING_FIBERS）
  FIBER_TERMS: FIBER_TERMS,
  // 不做的品类表：校验脚本据此断言"开放品类里不含鞋包"
  UNSUPPORTED_CATEGORIES: UNSUPPORTED_CATEGORIES,
  CATEGORY_RULES: CATEGORY_RULES
};
