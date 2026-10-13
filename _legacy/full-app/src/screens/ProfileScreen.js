import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, spacing, radius, shadow, alpha } from '../theme';
import { listCategories, listFabrics, listBrandTiers, PRICE_SNAPSHOT } from '../../config';

/**
 * 个人面板。
 *
 * 数据全部来自 config 实算 —— 不写占位数字。
 * 用户行为类数据（估价次数等）当前无来源，一律用空状态如实呈现。
 */

const GRADE_META = {
  official: { label: '政府公布', color: colors.good },
  semi: { label: '指数报价', color: colors.design },
  estimate: { label: '行业估算', color: colors.warn }
};

export default function ProfileScreen({
  userName = '游客',
  defaultOverflow = 0.5,
  defaultBrandTier = 'common',
  onOpenOverflowSetting,
  onOpenSourceSetting,
  onOpenDisclaimer,
  onExit
}) {
  const stats = useMemo(() => {
    const fabrics = listFabrics();
    const categories = listCategories();
    const tiers = listBrandTiers();
    const byGrade = { official: 0, semi: 0, estimate: 0 };

    fabrics.forEach((f) => {
      if (byGrade[f.grade] !== undefined) byGrade[f.grade] += 1;
    });

    const total = fabrics.length || 1;

    return {
      fabricCount: fabrics.length,
      categoryCount: categories.length,
      tierCount: tiers.length,
      byGrade,
      officialRatio: byGrade.official / total,
      semiRatio: byGrade.semi / total,
      estimateRatio: byGrade.estimate / total,
      total
    };
  }, []);

  const tierLabel = useMemo(() => {
    const found = listBrandTiers().find((t) => t.key === defaultBrandTier);
    return found ? found.label : '普通品牌';
  }, [defaultBrandTier]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.gradientFrom, colors.gradientMid, colors.primary]}
        locations={[0, 0.6, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.header}
      >
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color="#FFFFFF" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{userName}</Text>
          <View style={styles.tag}>
            <Text style={styles.tagText}>本机数据 · 未同步云端</Text>
          </View>
        </View>
      </LinearGradient>

      {/* 概览卡：上浮压在头部之上 */}
      <View style={[styles.overview, shadow.card]}>
        <Stat value={stats.fabricCount} label="面料库" />
        <View style={styles.statDivider} />
        <Stat value={stats.categoryCount} label="覆盖品类" />
        <View style={styles.statDivider} />
        <Stat value={stats.byGrade.official} label="官方报价" accent />
      </View>

      <Section title="数据可信度" hint={`共 ${stats.total} 种面料，按出处分级`}>
        <View style={styles.gradeBar}>
          {['official', 'semi', 'estimate'].map((key) => {
            const ratioKey = `${key}Ratio`;
            const width = stats[ratioKey];
            if (!width) return null;
            return (
              <View
                key={key}
                style={{
                  flex: width,
                  height: 8,
                  backgroundColor: GRADE_META[key].color
                }}
              />
            );
          })}
        </View>
        <View style={styles.legend}>
          {['official', 'semi', 'estimate'].map((key) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: GRADE_META[key].color }]} />
              <Text style={styles.legendText}>
                {GRADE_META[key].label} {stats.byGrade[key]}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.snapshot}>
          价格快照：{PRICE_SNAPSHOT}　·　官方源：绍兴e价通、商务部商务预报、中国棉花信息网
        </Text>
      </Section>

      <Section title="我的估价偏好">
        <Row
          icon="options-outline"
          label="默认溢出比例"
          value={`${Math.round(defaultOverflow * 100)}%`}
          onPress={onOpenOverflowSetting}
        />
        <Row
          icon="pricetag-outline"
          label="默认品牌档位"
          value={tierLabel}
          onPress={onOpenOverflowSetting}
        />
        <Text style={styles.tip}>
          溢出比例在结果页可随时拖动调整，这里只是每次打开时的默认值
        </Text>
      </Section>

      <Section title="我的记录">
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={22} color={colors.faint} />
          <Text style={styles.emptyText}>还没有估价记录</Text>
          <Text style={styles.emptySub}>拍第一件东西后，这里会留下它的价值拆解</Text>
        </View>
      </Section>

      <Section title="关于">
        <Row icon="layers-outline" label="数据来源说明" chevron onPress={onOpenSourceSetting} />
        <Row icon="document-text-outline" label="免责声明" chevron onPress={onOpenDisclaimer} />
        <Row icon="information-circle-outline" label="版本" value="0.1.0" />
      </Section>

      <Pressable style={styles.exitBtn} onPress={onExit}>
        <Text style={styles.exitText}>退出登录</Text>
      </Pressable>

      <Text style={styles.disclaimer}>估值仅供参考，不构成购买建议</Text>
    </ScrollView>
  );
}

function Stat({ value, label, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.primary }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, hint, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, chevron, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={18} color={colors.sub} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.faint} style={styles.chevron} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.huge },

  header: {
    paddingTop: 72,
    paddingBottom: 62,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: alpha('#FFFFFF', 0.18),
    borderWidth: 1,
    borderColor: alpha('#FFFFFF', 0.28),
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerText: { marginLeft: spacing.lg, flex: 1 },
  name: { fontSize: font.size.h1, fontWeight: font.weight.bold, color: '#FFFFFF' },
  tag: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: alpha('#FFFFFF', 0.16)
  },
  tagText: { fontSize: font.size.tiny, color: alpha('#FFFFFF', 0.9) },

  overview: {
    flexDirection: 'row',
    marginTop: -40,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center'
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: font.size.h1, fontWeight: font.weight.bold, color: colors.text },
  statLabel: { marginTop: spacing.xs, fontSize: font.size.tiny, color: colors.sub },
  statDivider: { width: 1, height: 26, backgroundColor: colors.lineSoft },

  section: { marginTop: spacing.xl, marginHorizontal: spacing.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  sectionTitle: { fontSize: font.size.small, fontWeight: font.weight.semi, color: colors.sub },
  sectionHint: { fontSize: font.size.tiny, color: colors.faint },
  sectionBody: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    ...shadow.card
  },

  gradeBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.lg,
    backgroundColor: colors.lineSoft
  },
  legend: { flexDirection: 'row', marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.lg },
  dot: { width: 7, height: 7, borderRadius: radius.pill, marginRight: spacing.xs },
  legendText: { fontSize: font.size.tiny, color: colors.sub },
  snapshot: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    fontSize: font.size.tiny,
    color: colors.faint,
    lineHeight: 17
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineSoft
  },
  rowPressed: { opacity: 0.6 },
  rowLabel: { flex: 1, marginLeft: spacing.md, fontSize: font.size.body, color: colors.text },
  rowValue: { fontSize: font.size.small, color: colors.sub },
  chevron: { marginLeft: spacing.sm },

  tip: {
    paddingVertical: spacing.md,
    fontSize: font.size.tiny,
    color: colors.faint,
    lineHeight: 17
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyText: { marginTop: spacing.sm, fontSize: font.size.body, color: colors.sub },
  emptySub: { marginTop: spacing.xs, fontSize: font.size.tiny, color: colors.faint },

  exitBtn: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card
  },
  exitText: { fontSize: font.size.body, color: colors.sub },

  disclaimer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: font.size.tiny,
    color: colors.faint
  }
});
