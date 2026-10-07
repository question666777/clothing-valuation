import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { estimate } from '../../core/valuation/index.js';
import { PRICE_SNAPSHOT } from '../../config/index.js';
import { colors, radius, spacing } from '../theme';
import BreakdownCard from '../components/BreakdownCard';

const PART_META = [
  { key: 'materialCost', label: '材料成本', color: colors.material, hint: '面料 + 辅料' },
  { key: 'processingCost', label: '加工成本', color: colors.processing, hint: '裁剪缝制（按件计）' },
  { key: 'designCost', label: '设计成本', color: colors.design, hint: '打版 / 样衣 / 设计' },
  { key: 'brandPremium', label: '品牌溢价', color: colors.brand, hint: '牌子本身值多少' },
  { key: 'overflow', label: '允许溢出', color: colors.overflow, hint: '运费 / 人工 / 销售' }
];

const GRADE_LABEL = {
  official: '政府公布报价',
  semi: '纺织指数报价',
  estimate: '行业估算 · 数据缺口'
};

const GRADE_STYLE = {
  official: { bg: colors.goodBg, fg: colors.good },
  semi: { bg: '#E0EAFF', fg: '#3B5BDB' },
  estimate: { bg: colors.warnBg, fg: colors.warn }
};

const TONE_STYLE = {
  warn: { bg: colors.warnBg, fg: colors.warn },
  good: { bg: colors.goodBg, fg: colors.good },
  flat: { bg: colors.flatBg, fg: colors.flat }
};

export default function ValuationScreen({ data, onBack }) {
  const { item, materialDetail, amount, retailPrice } = data;
  const [overflowRatio, setOverflowRatio] = useState(data.defaultOverflowRatio);

  // 溢出比例由用户决定：改动滑块即原样传给估价核心重算
  const result = useMemo(function () {
    return estimate(Object.assign({}, item, { overflowRatio: overflowRatio }));
  }, [item, overflowRatio]);

  const total = result.breakdown.total;

  const parts = PART_META.map(function (meta) {
    const value = result.breakdown[meta.key];
    return {
      key: meta.key,
      label: meta.label,
      color: meta.color,
      hint: meta.hint,
      value: value,
      percent: total > 0 ? Math.round((value / total) * 100) : 0
    };
  });

  const verdict = buildVerdict(retailPrice, result.priceRange);
  const grade = materialDetail.grade;
  const gradeStyle = GRADE_STYLE[grade] || GRADE_STYLE.estimate;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.back} activeOpacity={0.7}>
        <Text style={styles.backText}>← 重新估算</Text>
      </TouchableOpacity>

      <View style={styles.rangeCard}>
        <Text style={styles.rangeLabel}>{item.name} 的真实价值</Text>
        <Text style={styles.rangeValue}>
          ¥{result.priceRange.low} — {result.priceRange.high}
        </Text>
        <Text style={styles.rangeMid}>中位价 ¥{result.priceRange.mid}</Text>
        <Text style={styles.rangeMeta}>
          {result.coefficients.categoryLabel} · {result.coefficients.brandTierLabel}
        </Text>
      </View>

      {verdict ? (
        <View style={[styles.verdict, { backgroundColor: TONE_STYLE[verdict.tone].bg }]}>
          <Text style={[styles.verdictTitle, { color: TONE_STYLE[verdict.tone].fg }]}>
            {verdict.title}
          </Text>
          <Text style={[styles.verdictDetail, { color: TONE_STYLE[verdict.tone].fg }]}>
            实际售价 ¥{retailPrice} · {verdict.detail}
          </Text>
        </View>
      ) : null}

      <BreakdownCard parts={parts} total={total} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>允许溢出，你说了算</Text>
        <Text style={styles.sliderHint}>
          这部分是运费、人工、销售等流通环节的合理加价。给多少取决于你认为多少算合理 ——
          拖一下，上面的结果会跟着变。
        </Text>

        <View style={styles.sliderValueRow}>
          <Text style={styles.sliderValue}>{Math.round(overflowRatio * 100)}%</Text>
          <Text style={styles.sliderSub}>¥{result.breakdown.overflow}</Text>
        </View>

        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.05}
          value={overflowRatio}
          onValueChange={setOverflowRatio}
          minimumTrackTintColor={colors.overflow}
          maximumTrackTintColor={colors.line}
          thumbTintColor={colors.overflow}
        />
        <View style={styles.sliderScale}>
          <Text style={styles.sliderScaleText}>0%</Text>
          <Text style={styles.sliderScaleText}>50%</Text>
          <Text style={styles.sliderScaleText}>100%</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>材料价格来自哪</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{materialDetail.fabricLabel}</Text>
          <Text style={styles.priceValue}>
            ¥{materialDetail.unitPrice}/{materialDetail.unit}
          </Text>
        </View>
        {materialDetail.spec ? (
          <Text style={styles.priceSpec}>{materialDetail.spec}</Text>
        ) : null}

        <View style={[styles.gradeTag, { backgroundColor: gradeStyle.bg }]}>
          <Text style={[styles.gradeText, { color: gradeStyle.fg }]}>
            {GRADE_LABEL[grade] || GRADE_LABEL.estimate}
          </Text>
        </View>

        {materialDetail.note ? (
          <Text style={styles.priceNote}>{materialDetail.note}</Text>
        ) : null}

        <View style={styles.sourceBox}>
          <Text style={styles.sourceTitle}>{PRICE_SNAPSHOT.site}</Text>
          <Text style={styles.sourceLine}>发布机构：{PRICE_SNAPSHOT.publisher}</Text>
          <Text style={styles.sourceLine}>数据期：{PRICE_SNAPSHOT.period}</Text>
          <Text style={styles.sourceLine}>抓取日期：{PRICE_SNAPSHOT.fetchedAt}</Text>
          <Text style={styles.sourceUrl}>{PRICE_SNAPSHOT.url}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>这次用的系数</Text>
        <Row label="加工费（元/件）" value={result.coefficients.processingFee} />
        <Row label="设计费率" value={result.coefficients.designRate} />
        <Row label="品牌溢价率" value={result.coefficients.premiumRate} />
        <Row label="允许溢出比例" value={overflowRatio.toFixed(2) + '（你调的）'} />
        <Row label="区间半宽" value={result.coefficients.spread} />
        <Row label="用料" value={amount + ' ' + (materialDetail.unit || '米')} />
      </View>

      {result.degraded ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>材料成本缺失，本次结果已降级，仅供参考。</Text>
        </View>
      ) : null}

      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function buildVerdict(retailPrice, range) {
  if (!retailPrice || retailPrice <= 0 || range.mid <= 0) {
    return null;
  }

  const ratio = retailPrice / range.mid;
  const times = '约为真实价值的 ' + ratio.toFixed(1) + ' 倍';

  if (ratio >= 1.15) {
    return { tone: 'warn', title: '售价明显高于真实价值', detail: times };
  }
  if (ratio <= 0.87) {
    return { tone: 'good', title: '售价低于真实价值', detail: times };
  }
  return { tone: 'flat', title: '售价接近真实价值', detail: times };
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2
  },
  back: {
    marginBottom: spacing.md
  },
  backText: {
    fontSize: 14,
    color: colors.primary
  },
  rangeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md
  },
  rangeLabel: {
    fontSize: 13,
    color: colors.sub
  },
  rangeValue: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm
  },
  rangeMid: {
    fontSize: 13,
    color: colors.sub,
    marginTop: spacing.xs
  },
  rangeMeta: {
    fontSize: 11,
    color: colors.faint,
    marginTop: spacing.sm
  },
  verdict: {
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  verdictTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  verdictDetail: {
    fontSize: 12,
    marginTop: spacing.xs
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm
  },
  sliderHint: {
    fontSize: 11,
    color: colors.sub,
    lineHeight: 17
  },
  sliderValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md
  },
  sliderValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.overflow
  },
  sliderSub: {
    fontSize: 13,
    color: colors.sub
  },
  slider: {
    width: '100%',
    height: 36
  },
  sliderScale: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  sliderScaleText: {
    fontSize: 10,
    color: colors.faint
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  priceLabel: {
    fontSize: 14,
    color: colors.text,
    flex: 1
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text
  },
  priceSpec: {
    fontSize: 11,
    color: colors.faint,
    marginTop: spacing.xs
  },
  gradeTag: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.sm
  },
  gradeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  priceNote: {
    fontSize: 11,
    color: colors.sub,
    marginTop: spacing.sm,
    lineHeight: 16
  },
  sourceBox: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: spacing.md,
    paddingTop: spacing.md
  },
  sourceTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text
  },
  sourceLine: {
    fontSize: 11,
    color: colors.sub,
    marginTop: 3
  },
  sourceUrl: {
    fontSize: 10,
    color: colors.faint,
    marginTop: 3
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm
  },
  rowLabel: {
    fontSize: 13,
    color: colors.sub
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text
  },
  warnBox: {
    backgroundColor: colors.warnBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  warnText: {
    fontSize: 12,
    color: colors.warn
  },
  disclaimer: {
    fontSize: 11,
    color: colors.faint,
    textAlign: 'center'
  }
});
