import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../stores/authStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLogin'>;

export const AdminLoginScreen: React.FC<Props> = ({ navigation }) => {
  const loginAdmin = useAuthStore((s) => s.loginAdmin);
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Already an admin session → go straight to the dashboard.
  useEffect(() => {
    if (user?.role === 'admin') {
      navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
    }
  }, [user, navigation]);

  const onChange = (v: string) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
  const valid = code.length === 12;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      const res = await loginAdmin(code);
      if (!res.ok) {
        if (Platform.OS === 'web') window.alert(res.error);
        else Alert.alert('Connexion impossible', res.error);
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.navigate('Home')} />
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🛡️</Text>
            </View>
            <Text style={styles.title}>Espace administrateur</Text>
            <Text style={styles.sub}>Réservé au gestionnaire de Fidelity Plus.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Code administrateur</Text>
            <TextInput
              value={code}
              onChangeText={onChange}
              placeholder="••••••••••••"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              autoFocus
              style={styles.input}
              onSubmitEditing={submit}
              accessibilityLabel="Code administrateur"
            />
            <Text style={styles.hint}>12 caractères — fourni une seule fois à la création.</Text>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Button title="Connexion" onPress={submit} disabled={!valid || loading} loading={loading} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, paddingHorizontal: spacing.lg },
  topBar: { paddingTop: spacing.sm },
  content: { flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 38 },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  form: { gap: 6 },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    letterSpacing: 6,
    textAlign: 'center',
  },
  hint: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
});
