import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * 根布局。
 *
 * 路由结构：
 *   index      → 登录 / 欢迎页（入口）
 *   (tabs)     → 登录后的主应用：首页（录入） + 我的（面板）
 *   valuation  → 价值拆解页（从首页推入）
 */
export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F5F7' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="valuation" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
