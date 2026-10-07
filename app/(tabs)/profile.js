import { useRouter } from 'expo-router';
import ProfileScreen from '../../src/screens/ProfileScreen';

/** 我的：个人面板 */
export default function ProfileTab() {
  const router = useRouter();

  return (
    <ProfileScreen
      userName="游客"
      defaultOverflow={0.55}
      defaultBrandTier="known"
      onExit={() => router.replace('/')}
    />
  );
}
