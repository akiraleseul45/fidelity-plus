import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { RootStackParamList } from '../navigation';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { client, currentRestoId } = useApp();

  const goLogin = () => {
    navigation.navigate(client ? 'ClientQR' : 'ClientLogin');
  };

  const goSignup = () => {
    navigation.navigate(client ? 'ClientQR' : 'ClientSignup');
  };

  const goResto = () => {
    navigation.navigate(currentRestoId ? 'RestoScanner' : 'RestoAuthHome');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={goResto}
            hitSlop={12}
            style={({ pressed }) => [styles.restoBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.restoBtnText}>Professionnel ›</Text>
          </Pressable>
        </View>

        <View style={styles.center}>
          <Text style={styles.brand}>Fidelity Plus</Text>
          <Text style={styles.tagline}>Ta carte de fidélité, partout.</Text>
        </View>

        <View style={styles.bottom}>
          <Button title="Connexion" variant="pillLight" onPress={goLogin} style={{ flex: 1 }} />
          <Button title="Inscription" variant="pillAccent" onPress={goSignup} style={{ flex: 1 }} />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.heroBg },
  safe: { flex: 1, paddingHorizontal: spacing.lg },
  topBar: { alignItems: 'flex-end', paddingTop: spacing.sm },
  restoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  restoBtnText: { ...typography.small, color: colors.onAccent, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: {
    ...typography.h1,
    fontSize: 44,
    color: colors.heroText,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tagline: {
    ...typography.body,
    color: colors.heroText,
    opacity: 0.9,
    marginTop: spacing.md,
  },
  bottom: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
});
