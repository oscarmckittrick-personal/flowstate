import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

export default function ShieldScreen() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[theme.colors.backgroundTop, theme.colors.backgroundMid, theme.colors.backgroundBottom]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.title}>Shield</Text>
        <Text style={styles.subtitle}>Placeholder screen for phase 1.</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: theme.fonts.title,
    fontSize: 34,
    color: theme.colors.textLight,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.textLight,
    opacity: 0.8,
  },
});
