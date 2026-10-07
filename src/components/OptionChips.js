import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

/**
 * 通用选项组。options: [{ key, label }]
 */
export default function OptionChips({ options, value, onChange }) {
  return (
    <View style={styles.wrap}>
      {options.map(function (opt) {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={function () { onChange(opt.key); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.text, active && styles.textActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: spacing.sm,
    marginBottom: spacing.sm
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  text: {
    fontSize: 13,
    color: colors.sub
  },
  textActive: {
    color: colors.primary,
    fontWeight: '600'
  }
});
