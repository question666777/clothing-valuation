import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import ValuationScreen from './src/screens/ValuationScreen';
import { colors } from './src/theme';

export default function App() {
  const [data, setData] = useState(null);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {data ? (
        <ValuationScreen data={data} onBack={function () { setData(null); }} />
      ) : (
        <HomeScreen onSubmit={setData} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 44
  }
});
