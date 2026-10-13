import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ValuationScreen from '../src/screens/ValuationScreen';
import { colors, font, spacing, radius } from '../src/theme';

/** 价值拆解页：从首页推入，参数由 query 传入 */
export default function ValuationRoute() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const data = useMemo(() => {
    try {
      return JSON.parse(params.payload);
    } catch (e) {
      return null;
    }
  }, [params.payload]);

  if (!data) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>没有拿到估价数据，可能页面被直接打开了</Text>
        <Pressable style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>返回重新估算</Text>
        </Pressable>
      </View>
    );
  }

  return <ValuationScreen data={data} onBack={() => router.back()} />;
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl
  },
  emptyText: { fontSize: font.size.body, color: colors.sub, textAlign: 'center' },
  btn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnText: { color: '#FFFFFF', fontSize: font.size.body, fontWeight: font.weight.semi }
});
