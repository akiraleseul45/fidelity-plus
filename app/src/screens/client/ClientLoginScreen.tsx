import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientLogin'>;

export const ClientLoginScreen: React.FC<Props> = ({ navigation }) => {
  const { loginClient } = useApp();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (v: string) => setCode(v.replace(/\D/g, '').slice(0, 5));

  const submit = async () => {
    if (code.length !== 5 || loading) return;
    setLoading(true);
    try {
      const res = await loginClient(code);
      if (!res.ok) {
        if (Platform.OS === 'web') {
          window.alert(res.error);
        } else {
          Alert.alert('Connexion impossible', res.error);
        }
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'ClientQR' }] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.navigate('Home')} />
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🍽️</Text>
            </View>
            <Text style={styles.title}>Se connecter à{'\n'}Fidelity Plus</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Code à 5 chiffres</Text>
            <TextInput
              value={code}
              onChangeText={onChange}
              placeholder="•••••"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              autoFocus
              style={styles.input}
              onSubmitEditing={submit}
            />
            <Text style={styles.hintRight}>Le code généré à l'inscription</Text>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Button
              title="Connexion"
              variant="primary"
              onPress={submit}
              disabled={code.length !== 5 || loading}
              loading={loading}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Nouveau sur Fidelity Plus ?</Text>
          <Pressable onPress={() => navigation.replace('ClientSignup')} hitSlop={8}>
            <Text style={styles.footerLink}>S'inscrire</Text>
          </Pressable>
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
  header: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 40 },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', lineHeight: 40 },
  form: { gap: 6 },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    letterSpacing: 12,
    textAlign: 'center',
  },
  hintRight: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  footerText: { ...typography.body, color: colors.textMuted },
  footerLink: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
