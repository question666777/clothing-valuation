/**
 * 全局视觉常量。所有界面只从这里取色与间距，不写死数值。
 *
 * 扩展于 2026-09-26：加入品牌渐变、字号体系、阴影与胶囊圆角，供登录页与个人面板使用。
 * 原有键一律保留，不得删除（HomeScreen / ValuationScreen / BreakdownCard 仍在引用）。
 */

export const colors = {
  // —— 基础面 ——
  bg: '#F4F5F7',
  bgDeep: '#12141A',
  card: '#FFFFFF',
  cardAlt: '#FAFAFB',
  text: '#16181D',
  sub: '#6B7280',
  faint: '#9CA3AF',
  line: '#E5E7EB',
  lineSoft: '#F1F2F4',

  // —— 品牌 ——
  primary: '#C75B39',
  primaryDark: '#A8472A',
  primarySoft: '#FBEDE8',
  primaryGhost: '#FFF7F3',
  accent: '#F0A868',

  // —— 品牌渐变（登录页头图、App 图标沿用同一组）——
  gradientFrom: '#1E222C',
  gradientMid: '#3A2A26',
  gradientTo: '#C75B39',

  // —— 五段拆解配色，与顺序一一对应 ——
  material: '#C75B39',
  processing: '#E0A458',
  design: '#5B8DEF',
  brand: '#8C6BB1',
  overflow: '#4A9C8C',

  // —— 语义 ——
  warn: '#B45309',
  warnBg: '#FEF3C7',
  // 指数报价（semi）徽章配色。原先散落在各页面里写死，
  // 提到真源后才能让小程序侧的 WXSS 也走变量（见 scripts/verify-miniprogram.js 的写死色检查）
  semi: '#3B5BDB',
  semiBg: '#E0EAFF',
  good: '#15803D',
  goodBg: '#DCFCE7',
  flat: '#4B5563',
  flatBg: '#F3F4F6'
};

/** 透明度辅助：把十六进制色叠加为 rgba，避免各处手写魔法值 */
export function alpha(hex, opacity) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const font = {
  size: {
    display: 34,
    h1: 26,
    h2: 20,
    h3: 17,
    body: 15,
    small: 13,
    tiny: 11
  },
  weight: {
    bold: '700',
    semi: '600',
    normal: '400'
  },
  /** 行高倍数：中文正文比英文需要更大行距 */
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    loose: 1.75
  }
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 44
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 30,
  pill: 999
};

/** RN 的阴影需要 elevation(Android) + shadow*(iOS) 同时给 */
export const shadow = {
  card: {
    shadowColor: '#0B0D12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2
  },
  float: {
    shadowColor: '#0B0D12',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6
  },
  bar: {
    shadowColor: '#0B0D12',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 10
  }
};
