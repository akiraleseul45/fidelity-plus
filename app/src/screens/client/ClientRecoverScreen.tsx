import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
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
import { apiClientRecover } from '../../store/api';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientRecover'>;

export const ClientRecoverScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const valid = /.+@.+\..+/.test(email.trim());

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    await apiClientRecover(email.trim());
    setLoading(false);
    // Always show the same confirmation (no enumeration).
    setDone(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Code de connexion oublié</Text>
          {done ? (
            <View style={styles.info}>
              <Text style={styles.infoTitle}>📧 Vérifie ta boîte email</Text>
              <Text style={styles.infoBody}>
                Si un compte est associé à cet email, un nouveau code de connexion vient d'être
                envoyé. Ton ancien code ne fonctionne plus.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sub}>
                Entre l'email associé à ton compte. Nous t'enverrons un nouveau code de connexion.
              </Text>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="ton@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                accessibilityLabel="Email associé au compte"
              />
            </>
          )}
        </View>
        <View style={styles.footer}>
          {done ? (
            <Button title="Retour à la connexion" onPress={() => navigation.goBack()} />
          ) : (
            <Button
              title="Envoyer un nouveau code"
              onPress={submit}
              disabled={!valid || loading}
              loading={loading}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  flex: { flex: 1 },
  topBar: { paddingTop: spacing.sm },
  content: { flex: 1, gap: spacing.md, paddingTop: spacing.lg },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted },
  label: { ...typography.small, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  info: { backgroundColor: '#EAF4FF', borderRadius: radius.md, padding: spacing.md, gap: 6 },
  infoTitle: { ...typography.body, color: '#0B4A8C', fontWeight: '700' },
  infoBody: { ...typography.small, color: '#0B4A8C', lineHeight: 18 },
  footer: { paddingBottom: spacing.lg },
});
