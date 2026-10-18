import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

type Props = NativeStackScreenProps<RootStackParamList, 'ClientSignup'>;

export const ClientSignupScreen: React.FC<Props> = ({ navigation }) => {
  const { signupClient } = useApp();
  const [pseudonym, setPseudonym] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const emailValid = email.trim() === '' || /.+@.+\..+/.test(email);
  const valid = pseudonym.trim().length >= 2 && emailValid && consent;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const res = await signupClient(pseudonym, email);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const u = res.user as { pseudonym: string; email?: string | null };
    navigation.replace('ClientSignupSuccess', {
      code: res.loginCode,
      pseudonym: u.pseudonym,
      email: u.email || undefined,
    });
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🍔</Text>
            </View>
            <Text style={styles.title}>Créer un compte{'\n'}Fidelity Plus</Text>
            <Text style={styles.sub}>
              On te génère un code à 5 chiffres. Note-le bien — c'est lui qui te servira à te
              connecter.
            </Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <Field
              label="Pseudonyme"
              value={pseudonym}
              onChange={setPseudonym}
              placeholder="Max, TomTom…"
            />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="ton@email.com"
              keyboardType="email-address"
              optional
              hint="Pour recevoir ton code par email (recommandé)"
            />
          </View>

          <Pressable
            onPress={() => setConsent((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            accessibilityLabel="J'accepte que mes données soient utilisées pour gérer mon compte de fidélité"
            style={({ pressed }) => [styles.consentRow, pressed && { opacity: 0.8 }]}
            hitSlop={6}
          >
            <View style={[styles.checkbox, consent && styles.checkboxOn]}>
              {consent ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.consentText}>
              J'accepte que mes données soient utilisées pour gérer mon compte de fidélité
              (consentement RGPD requis).
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Legal', {})}
            hitSlop={6}
            style={{ marginTop: spacing.xs }}
          >
            <Text style={styles.legalNote}>
              En créant un compte, tu acceptes les CGU et la politique de confidentialité.
            </Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              title="Créer mon compte"
              variant="primary"
              onPress={submit}
              disabled={!valid || loading}
              loading={loading}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Déjà un compte ?</Text>
          <Pressable onPress={() => navigation.replace('ClientLogin')} hitSlop={8}>
            <Text style={styles.footerLink}>Se connecter</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
  optional?: boolean;
  hint?: string;
}> = ({ label, value, onChange, placeholder, keyboardType = 'default', optional, hint }) => (
  <View style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {optional ? <Text style={styles.optional}>(facultatif)</Text> : null}
    </View>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      autoCorrect={keyboardType !== 'email-address'}
      keyboardType={keyboardType}
      style={styles.input}
    />
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, paddingHorizontal: spacing.lg },
  topBar: { paddingTop: spacing.sm },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg },
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
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  optional: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  hint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  footerText: { ...typography.body, color: colors.textMuted },
  footerLink: { ...typography.body, color: colors.primary, fontWeight: '700' },
  error: { ...typography.small, color: colors.primary, textAlign: 'center', marginTop: spacing.md },
  consentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  consentText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 18 },
  legalNote: { ...typography.small, color: colors.primary, textDecorationLine: 'underline' },
});
