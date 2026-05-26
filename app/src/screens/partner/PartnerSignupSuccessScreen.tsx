import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerSignupSuccess'>;

export const PartnerSignupSuccessScreen: React.FC<Props> = ({ navigation, route }) => {
  const { code, email, emailSent, apiError } = route.params;
  return (
    <Screen>
      <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.lg }}>
        <Text style={styles.h1}>Compte créé</Text>

        {emailSent ? (
          <View style={styles.success}>
            <Text style={styles.successTitle}>📧 Email envoyé</Text>
            <Text style={styles.successBody}>
              Un email avec ton code de connexion vient d'être envoyé à{' '}
              <Text style={styles.bold}>{email}</Text>. Vérifie ta boîte (et tes spams).
            </Text>
          </View>
        ) : (
          <View style={styles.warning}>
            <Text style={styles.warnTitle}>⚠️ Email non envoyé</Text>
            <Text style={styles.warnBody}>
              Le serveur n'a pas pu être joint{apiError ? ` (${apiError})` : ''}. Ton compte est
              quand même créé — note bien ton code ci-dessous, c'est lui qui te servira à te
              connecter.
            </Text>
          </View>
        )}

        <Text style={styles.sub}>Ton code de connexion :</Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{code}</Text>
        </View>
        <Text style={styles.hint}>
          {emailSent
            ? 'Ce code est aussi dans l\'email reçu.'
            : 'Garde-le bien — c\'est ton seul moyen de te connecter.'}
        </Text>
      </View>
      <View style={{ paddingBottom: spacing.lg }}>
        <Button title="Se connecter" onPress={() => navigation.replace('PartnerLogin')} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.text, marginTop: spacing.md },
  bold: { fontWeight: '700' },
  codeBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  code: { ...typography.h1, letterSpacing: 4, color: colors.primary },
  hint: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  success: {
    backgroundColor: '#EAF4FF',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  successTitle: { ...typography.body, color: '#0B4A8C', fontWeight: '700' },
  successBody: { ...typography.small, color: '#0B4A8C', lineHeight: 18 },
  warning: {
    backgroundColor: '#FFF8E6',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  warnTitle: { ...typography.body, color: '#7A5A00', fontWeight: '700' },
  warnBody: { ...typography.small, color: '#7A5A00', lineHeight: 18 },
});
