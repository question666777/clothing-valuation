import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, spacing, radius, shadow, alpha } from '../theme';

/**
 * 登录 / 欢迎页。
 *
 * 设计依据（2026-09-26 调研）：
 * - 品牌前置：顶部渐变品牌区承载产品名与定位语，表单落在下方白色卡片
 * - 手势可达：主按钮置于拇指区，高度 52
 * - 状态完整：获取验证码倒计时、错误内联到字段下方、字段未合法前主按钮禁用
 * - 合规：协议勾选框 + 可点击的《用户协议》《隐私政策》，未勾选不放行
 *
 * 与 AGENTS.md 第 6 节的关系：该节写明「不做用户账号体系」。
 * 因此本页当前**只呈现交互与视觉**，提交时不做真实鉴权 ——
 * 后端阶段接入真实短信与账号前，登录按钮走的是演示路径。
 */

const PHONE_RE = /^1[3-9]\d{9}$/;

export default function LoginScreen({ onGuestEnter, onLoginSubmit }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const phoneValid = PHONE_RE.test(phone);
  const codeValid = code.length === 6;
  const canSubmit = phoneValid && codeValid && agreed && !loading;
  const canSendCode = phoneValid && countdown === 0;

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function handleSendCode() {
    if (!canSendCode) return;
    setError('');
    setCountdown(60);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    // 后端未接入：仅演示过渡，不发起请求
    setTimeout(() => {
      setLoading(false);
      if (typeof onLoginSubmit === 'function') {
        onLoginSubmit({ phone, code, verified: false, demo: true });
      }
    }, 700);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.gradientFrom, colors.gradientMid, colors.primary]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.brand}
        >
          <View style={[styles.halo, styles.haloA]} />
          <View style={[styles.halo, styles.haloB]} />

          <View style={styles.brandInner}>
            <View style={styles.mark}>
              <Ionicons name="scan-outline" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.brandName}>看光光</Text>
            <Text style={styles.brandSlogan}>拍一下，看清它到底值多少钱</Text>
          </View>
        </LinearGradient>

        <View style={styles.sheet}>
          <Text style={styles.title}>手机号登录</Text>
          <Text style={styles.subtitle}>未注册的手机号将自动创建账号</Text>

          <View style={[styles.field, error && !phoneValid ? styles.fieldError : null]}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>+86</Text>
              <View style={styles.prefixDivider} />
            </View>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/\D/g, '').slice(0, 11));
                if (error) setError('');
              }}
              placeholder="请输入手机号"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              maxLength={11}
              textContentType="telephoneNumber"
            />
          </View>

          <View style={styles.field}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.faint} />
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 位验证码"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              maxLength={6}
              textContentType="oneTimeCode"
            />
            <Pressable
              onPress={handleSendCode}
              disabled={!canSendCode}
              hitSlop={8}
              style={styles.codeBtn}
            >
              <Text style={[styles.codeBtnText, !canSendCode && styles.codeBtnTextOff]}>
                {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
              </Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.warn} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable style={styles.agreeRow} onPress={() => setAgreed((v) => !v)} hitSlop={6}>
            <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
              {agreed ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
            </View>
            <Text style={styles.agreeText}>
              我已阅读并同意
              <Text style={styles.link}>《用户协议》</Text>
              与
              <Text style={styles.link}>《隐私政策》</Text>
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primaryBtn,
              !canSubmit && styles.primaryBtnOff,
              pressed && canSubmit && styles.primaryBtnPressed
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>登录 / 注册</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={onGuestEnter}
            style={({ pressed }) => [styles.ghostBtn, pressed && styles.ghostBtnPressed]}
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.ghostBtnText}>先随便看看（游客模式）</Text>
          </Pressable>

          <Text style={styles.hint}>
            账号服务尚未接入，当前可直接使用游客模式，数据仅保存在本机
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },

  brand: {
    paddingTop: 92,
    paddingBottom: 78,
    paddingHorizontal: spacing.xl,
    overflow: 'hidden'
  },
  halo: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: alpha('#FFFFFF', 0.08)
  },
  haloA: { width: 200, height: 200, top: -60, right: -50 },
  haloB: { width: 130, height: 130, bottom: -40, left: -30 },
  brandInner: { alignItems: 'center' },
  mark: {
    width: 58,
    height: 58,
    borderRadius: radius.xl,
    backgroundColor: alpha('#FFFFFF', 0.16),
    borderWidth: 1,
    borderColor: alpha('#FFFFFF', 0.24),
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandName: {
    marginTop: spacing.lg,
    fontSize: font.size.display,
    fontWeight: font.weight.bold,
    color: '#FFFFFF',
    letterSpacing: 4
  },
  brandSlogan: {
    marginTop: spacing.sm,
    fontSize: font.size.small,
    color: alpha('#FFFFFF', 0.78),
    letterSpacing: 0.5
  },

  sheet: {
    flex: 1,
    marginTop: -42,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl + 8,
    borderTopRightRadius: radius.xl + 8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl
  },
  title: { fontSize: font.size.h1, fontWeight: font.weight.bold, color: colors.text },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    fontSize: font.size.small,
    color: colors.sub
  },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md
  },
  fieldError: { borderColor: colors.warn, backgroundColor: colors.warnBg },
  prefix: { flexDirection: 'row', alignItems: 'center' },
  prefixText: { fontSize: font.size.body, color: colors.text, fontWeight: font.weight.semi },
  prefixDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.line,
    marginHorizontal: spacing.md
  },
  input: {
    flex: 1,
    fontSize: font.size.body,
    color: colors.text,
    paddingVertical: 0,
    marginLeft: spacing.xs
  },
  codeBtn: { paddingLeft: spacing.md },
  codeBtnText: { fontSize: font.size.small, color: colors.primary, fontWeight: font.weight.semi },
  codeBtnTextOff: { color: colors.faint, fontWeight: font.weight.normal },

  errorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  errorText: { marginLeft: spacing.xs, fontSize: font.size.small, color: colors.warn },

  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 1
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  agreeText: { flex: 1, fontSize: font.size.tiny, color: colors.sub, lineHeight: 18 },
  link: { color: colors.primary },

  primaryBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card
  },
  primaryBtnOff: { backgroundColor: '#D8DADF', shadowOpacity: 0, elevation: 0 },
  primaryBtnPressed: { backgroundColor: colors.primaryDark },
  primaryBtnText: {
    fontSize: font.size.h3,
    fontWeight: font.weight.semi,
    color: '#FFFFFF',
    letterSpacing: 1
  },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xl },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.lineSoft },
  dividerText: { marginHorizontal: spacing.md, fontSize: font.size.tiny, color: colors.faint },

  ghostBtn: {
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.35),
    backgroundColor: colors.primaryGhost,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  ghostBtnPressed: { backgroundColor: colors.primarySoft },
  ghostBtnText: {
    marginLeft: spacing.sm,
    fontSize: font.size.body,
    color: colors.primary,
    fontWeight: font.weight.semi
  },

  hint: {
    marginTop: spacing.lg,
    fontSize: font.size.tiny,
    color: colors.faint,
    textAlign: 'center',
    lineHeight: 17
  }
});
