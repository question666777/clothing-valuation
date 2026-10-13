// [auto-generated] 由 scripts/sync-miniprogram.js 单向同步生成，勿手改。
// 真源在项目根，改真源后重跑：node scripts/sync-miniprogram.js
// 供页面 JS 取色用（行内样式的动态色），WXSS 侧请改用 styles/theme.wxss 的 CSS 变量。

const colors = {
  "bg": "#F4F5F7",
  "bgDeep": "#12141A",
  "card": "#FFFFFF",
  "cardAlt": "#FAFAFB",
  "text": "#16181D",
  "sub": "#6B7280",
  "faint": "#9CA3AF",
  "line": "#E5E7EB",
  "lineSoft": "#F1F2F4",
  "primary": "#C75B39",
  "primaryDark": "#A8472A",
  "primarySoft": "#FBEDE8",
  "primaryGhost": "#FFF7F3",
  "accent": "#F0A868",
  "gradientFrom": "#1E222C",
  "gradientMid": "#3A2A26",
  "gradientTo": "#C75B39",
  "material": "#C75B39",
  "processing": "#E0A458",
  "design": "#5B8DEF",
  "brand": "#8C6BB1",
  "overflow": "#4A9C8C",
  "warn": "#B45309",
  "warnBg": "#FEF3C7",
  "semi": "#3B5BDB",
  "semiBg": "#E0EAFF",
  "good": "#15803D",
  "goodBg": "#DCFCE7",
  "flat": "#4B5563",
  "flatBg": "#F3F4F6"
};

const font = {
  "size": {
    "display": 34,
    "h1": 26,
    "h2": 20,
    "h3": 17,
    "body": 15,
    "small": 13,
    "tiny": 11
  },
  "weight": {
    "bold": "700",
    "semi": "600",
    "normal": "400"
  },
  "lineHeight": {
    "tight": 1.2,
    "normal": 1.5,
    "loose": 1.75
  }
};

const spacing = {
  "xxs": 2,
  "xs": 4,
  "sm": 8,
  "md": 12,
  "lg": 16,
  "xl": 24,
  "xxl": 32,
  "huge": 44
};

const radius = {
  "sm": 8,
  "md": 12,
  "lg": 16,
  "xl": 22,
  "xxl": 30,
  "pill": 999
};

const shadow = {
  "card": {
    "shadowColor": "#0B0D12",
    "shadowOffset": {
      "width": 0,
      "height": 2
    },
    "shadowOpacity": 0.06,
    "shadowRadius": 10,
    "elevation": 2
  },
  "float": {
    "shadowColor": "#0B0D12",
    "shadowOffset": {
      "width": 0,
      "height": 8
    },
    "shadowOpacity": 0.14,
    "shadowRadius": 20,
    "elevation": 6
  },
  "bar": {
    "shadowColor": "#0B0D12",
    "shadowOffset": {
      "width": 0,
      "height": -2
    },
    "shadowOpacity": 0.06,
    "shadowRadius": 12,
    "elevation": 10
  }
};

function alpha(hex, opacity) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

module.exports = {
  colors: colors,
  alpha: alpha,
  font: font,
  spacing: spacing,
  radius: radius,
  shadow: shadow
};
