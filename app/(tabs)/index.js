import { useRouter } from 'expo-router';
import HomeScreen from '../../src/screens/HomeScreen';

/** 首页：录入物品信息，提交后进入价值拆解页 */
export default function HomeTab() {
  const router = useRouter();

  return (
    <HomeScreen
      onSubmit={(payload) => {
        router.push({
          pathname: '/valuation',
          params: { payload: JSON.stringify(payload) }
        });
      }}
    />
  );
}
