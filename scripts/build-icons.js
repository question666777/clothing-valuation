/**
 * 生成 App 图标与启动图。
 *
 * 为什么不用 AI 原图直接当图标：
 *   1. 原图右下角带平台水印，不能作为品牌资产
 *   2. 原图渐变色由模型自由发挥，与登录页的品牌渐变对不上
 *
 * 做法：从 AI 图里**只取符号的 alpha 通道**（按亮度做软阈值，边缘平滑），
 * 底色由本脚本按品牌色逐像素绘制。成品无水印，且与 src/theme.js 的
 * gradientFrom / gradientMid / gradientTo 完全一致。
 *
 * 运行：
 *   node scripts/build-icons.js [可选:源图路径]
 */

const path = require('path');
const fs = require('fs');

// jimp 装在 Node 隔离工作区（App 包不该背这个依赖）。
// 优先从本地 node_modules 取，取不到再回退到隔离工作区，保证脚本可复跑。
const ISOLATED_MODULES = 'C:/Users/cos/.workbuddy/binaries/node/workspace/node_modules';
let Jimp;
try {
  ({ Jimp } = require('jimp'));
} catch (e) {
  ({ Jimp } = require(path.join(ISOLATED_MODULES, 'jimp')));
}

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

/** 品牌渐变，与 src/theme.js 保持一致 */
const STOPS = [
  { at: 0, rgb: [0x1e, 0x22, 0x2c] },
  { at: 0.55, rgb: [0x3a, 0x2a, 0x26] },
  { at: 1, rgb: [0xc7, 0x5b, 0x39] }
];

/** 水印所在区域（右下角）。提符号时强制透明，合成本来就重画底色，双重保险 */
const WATERMARK = { x0: 790, y0: 830 };

/** 二值化亮度阈值：符号近白色，背景最亮处（橙色）约 118，取 195 能干净分开 */
const MASK_LEVEL = 195;
/** 掩膜模糊次数：3 次 3x3 均值 ≈ 3px 过渡，用来做抗锯齿 */
const BLUR_PASSES = 3;
/**
 * 连通域最小面积。原图背景里有一条浅色斜纹，二值化后会混进掩膜，
 * 靠面积把它筛掉 —— 它是细长条，面积远小于符号笔画。
 */
const MIN_COMPONENT_AREA = 3000;

function gradientAt(t) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    if (clamped >= STOPS[i].at && clamped <= STOPS[i + 1].at) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const span = b.at - a.at || 1;
  const k = (clamped - a.at) / span;
  return [
    a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k,
    a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k,
    a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k
  ];
}

function findSource() {
  const files = fs
    .readdirSync(ASSETS)
    .filter((f) => f.startsWith('App_icon_design') && f.toLowerCase().endsWith('.png'));
  if (!files.length) {
    throw new Error('assets/ 里没找到 AI 生成的源图（App_icon_design*.png）');
  }
  return path.join(ASSETS, files[0]);
}

/** 只保留面积达标的连通域，滤掉背景噪点 */
function filterComponents(src, size, minArea) {
  const labels = new Int32Array(size * size);
  const areas = [0];
  const stack = new Int32Array(size * size);
  let current = 0;

  for (let start = 0; start < src.length; start += 1) {
    if (src[start] !== 1 || labels[start] !== 0) continue;

    current += 1;
    let sp = 0;
    stack[sp] = start;
    sp += 1;
    labels[start] = current;
    let area = 0;

    while (sp > 0) {
      sp -= 1;
      const idx = stack[sp];
      area += 1;
      const x = idx % size;
      const y = (idx - x) / size;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const nIdx = ny * size + nx;
          if (src[nIdx] === 1 && labels[nIdx] === 0) {
            labels[nIdx] = current;
            stack[sp] = nIdx;
            sp += 1;
          }
        }
      }
    }

    areas[current] = area;
  }

  const out = new Float32Array(size * size);
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === 1 && areas[labels[i]] >= minArea) out[i] = 1;
  }
  return out;
}

/** 3x3 均值模糊。反复做几次即可把二值掩膜磨成平滑边缘 */
function blur3(src, size) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          sum += sampleAlpha(src, size, x + dx, y + dy);
        }
      }
      out[y * size + x] = sum / 9;
    }
  }
  return out;
}

/** 线性插值采样 alpha，用于符号缩放时的抗锯齿 */
function sampleAlpha(alpha, size, x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) return 0;
  return alpha[y * size + x];
}

function sampleAlphaBilinear(alpha, size, fx, fy) {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  const a00 = sampleAlpha(alpha, size, x0, y0);
  const a10 = sampleAlpha(alpha, size, x0 + 1, y0);
  const a01 = sampleAlpha(alpha, size, x0, y0 + 1);
  const a11 = sampleAlpha(alpha, size, x0 + 1, y0 + 1);
  const top = a00 * (1 - dx) + a10 * dx;
  const bottom = a01 * (1 - dx) + a11 * dx;
  return top * (1 - dy) + bottom * dy;
}

function compose(alpha, srcSize, opts) {
  const size = opts.size;
  const scale = opts.scale || 1;
  const withBg = opts.withBg !== false;
  const rgb = opts.symbolColor || [255, 255, 255];
  const symbolGain = opts.symbolGain === undefined ? 1 : opts.symbolGain;

  const out = new Jimp({ width: size, height: size, color: 0x00000000 });
  const cx = size / 2;
  const cy = size / 2;
  const buf = out.bitmap.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (withBg) {
        const t = (x + y) / (2 * (size - 1));
        const c = gradientAt(t);
        r = c[0];
        g = c[1];
        b = c[2];
        a = 255;
      }

      const sx = cx + (x - cx) / scale;
      const sy = cy + (y - cy) / scale;
      let sa = sampleAlphaBilinear(alpha, srcSize, sx, sy) * symbolGain;
      if (sa > 1) sa = 1;

      if (sa > 0) {
        const inv = 1 - sa;
        r = r * inv + rgb[0] * sa;
        g = g * inv + rgb[1] * sa;
        b = b * inv + rgb[2] * sa;
        a = Math.max(a, sa * 255);
      }

      const i = (y * size + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a);
    }
  }

  return out;
}

async function main() {
  const source = process.argv[2] ? path.resolve(process.argv[2]) : findSource();
  console.log('源图:', source);

  const img = await Jimp.read(source);
  const S = img.bitmap.width;
  const data = img.bitmap.data;
  console.log('源图尺寸:', S + 'x' + img.bitmap.height);

  // 亮度直方图（用于校验阈值是否卡在符号与背景之间）
  let below = 0;
  let between = 0;
  let above = 0;

  // 1) 二值掩膜。先二值化是为了抹掉原图符号内部的明暗纹理 ——
  //    若直接拿亮度当 alpha，这些纹理会在成品上显成一条条斜纹。
  let mask = new Float32Array(S * S);

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const inWatermark = x > WATERMARK.x0 && y > WATERMARK.y0;

      mask[y * S + x] = !inWatermark && lum > MASK_LEVEL ? 1 : 0;

      if (lum < MASK_LEVEL) below += 1;
      else above += 1;
    }
  }

  // 2) 只保留像样的连通域，滤掉背景里的浅色细纹
  mask = filterComponents(mask, S, MIN_COMPONENT_AREA);

  // 3) 模糊掩膜，把硬边磨成平滑过渡，作为抗锯齿
  for (let pass = 0; pass < BLUR_PASSES; pass += 1) {
    mask = blur3(mask, S);
  }

  const alpha = mask;
  const total = S * S;
  console.log(
    '掩膜占比：背景 ' +
      ((below / total) * 100).toFixed(1) +
      '% / 符号 ' +
      ((above / total) * 100).toFixed(2) +
      '%'
  );

  const targets = [
    { file: 'icon.png', opts: { size: 1024, scale: 1, withBg: true } },
    { file: 'android-icon-background.png', opts: { size: 1024, scale: 1, withBg: true, symbolGain: 0 } },
    { file: 'android-icon-foreground.png', opts: { size: 1024, scale: 0.62, withBg: false } },
    {
      file: 'android-icon-monochrome.png',
      opts: { size: 1024, scale: 0.62, withBg: false, symbolColor: [0, 0, 0] }
    },
    { file: 'splash-icon.png', opts: { size: 512, scale: 0.9, withBg: false } },
    { file: 'favicon.png', opts: { size: 48, scale: 0.92, withBg: true } }
  ];

  for (const target of targets) {
    const image = compose(alpha, S, target.opts);
    const outPath = path.join(ASSETS, target.file);
    await image.write(outPath);
    console.log('  写出 ' + target.file + '  (' + target.opts.size + 'px)');
  }

  console.log('完成，共 ' + targets.length + ' 个文件。');
}

main().catch((err) => {
  console.error('失败:', err.message);
  process.exit(1);
});
