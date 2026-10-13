import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

/**
 * 四段拆解卡片。
 * parts: [{ key, label, value, percent, color, hint }]
 */
export default function BreakdownCard({ parts, total }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>钱花在哪</Text>

      {parts.map(function (part) {
        return (
          <View key={part.key} style={styles.part}>
            <View style={styles.head}>
              <Text style={styles.label}>{part.label}</Text>
              <Text style={styles.value}>¥{part.value}</Text>
            </View>
            <View style={styles.bar}>
              <View
                style={[
                  styles.fill,
                  { width: part.percent + '%', backgroundColor: part.color }
                ]}
              />
            </View>
            <View style={styles.foot}>
              <Text style={styles.hint}>{part.hint}</Text>
              <Text style={styles.percent}>{part.percent}%</Text>
            </View>
          </View>
        );
      })}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>合计</Text>
        <Text style={styles.totalValue}>¥{total}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md
  },
  part: {
    marginBottom: spacing.md
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs
  },
  label: {
    fontSize: 14,
    color: colors.text
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text
  },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bg,
    overflow: 'hidden'
  },
  fill: {
    height: 8,
    borderRadius: 4
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs
  },
  hint: {
    fontSize: 11,
    color: colors.faint
  },
  percent: {
    fontSize: 11,
    color: colors.faint
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    marginTop: spacing.xs
  },
  totalLabel: {
    fontSize: 14,
    color: colors.sub
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text
  }
});
