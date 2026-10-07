import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '../../src/theme';

/**
 * 主应用底部标签栏。
 * 只放两个一级入口：估价（首页）与我的（个人面板）。
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
          borderTopColor: colors.lineSoft,
          backgroundColor: colors.card
        },
        tabBarLabelStyle: {
          fontSize: font.size.tiny,
          fontWeight: font.weight.semi
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '估价',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan-outline" size={size} color={color} />
          )
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          )
        }}
      />
    </Tabs>
  );
}
