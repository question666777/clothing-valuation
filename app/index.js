import { useRouter } from 'expo-router';
import LoginScreen from '../src/screens/LoginScreen';

/** 应用入口：登录 / 欢迎页 */
export default function LoginEntry() {
  const router = useRouter();

  return (
    <LoginScreen
      onGuestEnter={() => router.replace('/(tabs)')}
      onLoginSubmit={() => router.replace('/(tabs)')}
    />
  );
}
