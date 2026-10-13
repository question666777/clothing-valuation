import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  listCategories,
  listBrandTiers,
  listFabrics,
  estimateMaterialCost,
  resolveCoefficients
} from '../../config/index.js';
import { recognizeByText, recognizeByImage } from '../../services/recognize.js';
import { colors, font, spacing, radius, shadow, alpha } from '../theme';
import OptionChips from '../components/OptionChips';

const CATEGORIES = listCategories();
const BRAND_TIERS = listBrandTiers();
const FABRICS = listFabrics();

const GRADE_LABEL = {
  official: '政府公布报价',
  semi: '纺织指数报价',
  estimate: '行业估算'
};

const GRADE_TONE = {
  official: { bg: colors.goodBg, fg: colors.good },
  semi: { bg: '#E0EAFF', fg: '#3B5BDB' },
  estimate: { bg: colors.warnBg, fg: colors.warn }
};

export default function HomeScreen({ onSubmit }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [fabricKey, setFabricKey] = useState(FABRICS[0].key);
  const [amountText, setAmountText] = useState('1.5');
  const [brandTier, setBrandTier] = useState('common');
  const [retailText, setRetailText] = useState('');
  const [hint, setHint] = useState('');

  const amount = parseFloat(amountText) || 0;
  const material = estimateMaterialCost({
    fabricKey: fabricKey,
    amount: amount,
    category: category
  });
  const gradeTone = GRADE_TONE[material.grade] || GRADE_TONE.estimate;

  function handleRecognize() {
    recognizeByImage().catch(function (err) {
      setHint(err.message);
    });
  }

  function handleNameBlur() {
    const guessed = recognizeByText(name);
    if (guessed.category) setCategory(guessed.category);
    // 只接受价格表里真实存在的面料档。识别层可能给出查不到价的 key，
    // 直接 set 进去会让取价静默落空 —— 宁可保持用户原来的选择。
    if (guessed.fabricKey && FABRICS.some(function (f) { return f.key === guessed.fabricKey; })) {
      setFabricKey(guessed.fabricKey);
    }
    if (guessed.brandTier) setBrandTier(guessed.brandTier);
  }

  function handleSubmit() {
    const item = {
      name: name || '未命名单品',
      category: category,
      brandTier: brandTier,
      // core 的 material 契约为 { unitPrice, amount }；
      // 这里 unitPrice 承载「主料 + 辅料」的总材料成本，amount 固定为 1
      material: { unitPrice: material.materialCost, amount: 1 }
    };

    onSubmit({
      item: item,
      materialDetail: material,
      amount: amount,
      retailPrice: parseFloat(retailText) || 0,
      // 溢出比例初值取自品类默认，进入结果页后由用户自己拖
      defaultOverflowRatio: resolveCoefficients({ category: category }).overflowRatio
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.gradientFrom, colors.gradientMid, colors.primary]}
          locations={[0, 0.6, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.header}
        >
          <Text style={styles.brand}>看光光</Text>
          <Text style={styles.slogan}>看清一件衣服的钱，到底花在哪</Text>

          <Pressable
            onPress={handleRecognize}
            style={({ pressed }) => [styles.camera, pressed && styles.cameraPressed]}
          >
            <View style={styles.cameraIcon}>
              <Ionicons name="camera-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.cameraTexts}>
              <Text style={styles.cameraTitle}>拍照识别服饰</Text>
              <Text style={styles.cameraSub}>需服务端接入，当前请手动录入</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={alpha('#FFFFFF', 0.7)} />
          </Pressable>
        </LinearGradient>

        <View style={styles.sheet}>
          {hint ? (
            <View style={styles.hint}>
              <Ionicons name="information-circle" size={14} color={colors.warn} />
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          ) : null}

          <Field label="商品名称 / 描述">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              onBlur={handleNameBlur}
              placeholder="例如：全棉纱卡工装外套"
              placeholderTextColor={colors.faint}
            />
          </Field>

          <Field label="品类">
            <OptionChips options={CATEGORIES} value={category} onChange={setCategory} />
          </Field>

          <Field label="面料">
            <OptionChips options={FABRICS} value={fabricKey} onChange={setFabricKey} />
          </Field>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Field label={`用料（${material.unit || '米'}）`}>
                <TextInput
                  style={styles.input}
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  placeholder="1.5"
                  placeholderTextColor={colors.faint}
                />
              </Field>
            </View>
            <View style={styles.col}>
              <Field label="实际售价（可选）">
                <TextInput
                  style={styles.input}
                  value={retailText}
                  onChangeText={setRetailText}
                  keyboardType="decimal-pad"
                  placeholder="899"
                  placeholderTextColor={colors.faint}
                />
              </Field>
            </View>
          </View>

          <Field label="品牌档位">
            <OptionChips options={BRAND_TIERS} value={brandTier} onChange={setBrandTier} />
          </Field>

          <View style={styles.preview}>
            <View style={styles.previewHead}>
              <Text style={styles.previewLabel}>材料成本预估</Text>
              <View style={[styles.gradeTag, { backgroundColor: gradeTone.bg }]}>
                <Text style={[styles.gradeText, { color: gradeTone.fg }]}>
                  {GRADE_LABEL[material.grade] || '来源未知'}
                </Text>
              </View>
            </View>

            <Text style={styles.previewValue}>¥{material.materialCost}</Text>
            <Text style={styles.previewHint}>
              主料 ¥{material.mainCost} + 辅料 ¥{material.auxiliaryCost}
            </Text>
            <Text style={styles.previewSource}>
              {material.fabricLabel} ¥{material.unitPrice}/{material.unit}
              {material.spec ? ` · ${material.spec}` : ''}
            </Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
          >
            <Text style={styles.submitText}>估算真实价值</Text>
          </Pressable>

          <Text style={styles.disclaimer}>估值仅供参考，不构成购买建议</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingBottom: spacing.xl },

  header: {
    paddingTop: 62,
    paddingHorizontal: spacing.lg,
    paddingBottom: 58
  },
  brand: {
    fontSize: font.size.h1,
    fontWeight: font.weight.bold,
    color: '#FFFFFF',
    letterSpacing: 3
  },
  slogan: {
    marginTop: spacing.xs,
    fontSize: font.size.small,
    color: alpha('#FFFFFF', 0.78)
  },
  camera: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: alpha('#FFFFFF', 0.14),
    borderWidth: 1,
    borderColor: alpha('#FFFFFF', 0.22)
  },
  cameraPressed: { backgroundColor: alpha('#FFFFFF', 0.2) },
  cameraIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: alpha('#FFFFFF', 0.18),
    alignItems: 'center',
    justifyContent: 'center'
  },
  cameraTexts: { flex: 1, marginLeft: spacing.md },
  cameraTitle: { fontSize: font.size.body, fontWeight: font.weight.semi, color: '#FFFFFF' },
  cameraSub: { marginTop: 2, fontSize: font.size.tiny, color: alpha('#FFFFFF', 0.7) },

  sheet: {
    marginTop: -34,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl
  },

  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warnBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  hintText: { marginLeft: spacing.sm, flex: 1, fontSize: font.size.tiny, color: colors.warn },

  field: { marginTop: spacing.lg },
  label: {
    fontSize: font.size.small,
    fontWeight: font.weight.semi,
    color: colors.text,
    marginBottom: spacing.sm
  },
  input: {
    height: 50,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    fontSize: font.size.body,
    color: colors.text
  },

  row2: { flexDirection: 'row', marginHorizontal: -spacing.sm },
  col: { flex: 1, paddingHorizontal: spacing.sm },

  preview: {
    marginTop: spacing.xl,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.16),
    padding: spacing.lg
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  previewLabel: { fontSize: font.size.small, color: colors.primary },
  gradeTag: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  gradeText: { fontSize: font.size.tiny, fontWeight: font.weight.semi },
  previewValue: {
    marginTop: spacing.sm,
    fontSize: font.size.display - 6,
    fontWeight: font.weight.bold,
    color: colors.primary
  },
  previewHint: { marginTop: spacing.xs, fontSize: font.size.tiny, color: colors.sub },
  previewSource: {
    marginTop: spacing.sm,
    fontSize: font.size.tiny,
    color: colors.faint,
    lineHeight: 16
  },

  submit: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card
  },
  submitPressed: { backgroundColor: colors.primaryDark },
  submitText: {
    fontSize: font.size.h3,
    fontWeight: font.weight.semi,
    color: '#FFFFFF',
    letterSpacing: 1
  },

  disclaimer: {
    marginTop: spacing.lg,
    fontSize: font.size.tiny,
    color: colors.faint,
    textAlign: 'center'
  }
});
