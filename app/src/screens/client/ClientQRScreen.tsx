import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientQR'>;

/**
 * Client home: shows the universal QR code that works at every partner. The
 * client lands here right after login or signup. From here they can browse
 * partners, log out, or simply present their QR.
 */
export const ClientQRScreen: React.FC<Props> = ({ navigation }) => {
  const { client, logoutClient } = useApp();
  const { width } = useWindowDimensions();
  const qrSize = Math.min(width - spacing.lg * 4, 280);

  const payload = useMemo(() => {
    if (!client) return '';
    return JSON.stringify({ v: 1, clientId: client.id, pseudonym: client.pseudonym });
  }, [client]);

  const onLogout = async () => {
    const confirm =
      Platform.OS === 'web'
        ? typeof window !== 'undefined'
          ? window.confirm('Se déconnecter ? Tu devras retaper ton code.')
          : true
        : await new Promise<boolean>((resolve) =>
            Alert.alert('Déconnexion', 'Tu devras retaper ton code.', [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Se déconnecter', style: 'destructive', onPress: () => resolve(true) },
            ]),
          );
    if (!confirm) return;
    await logoutClient();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (!client) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.muted}>Aucun client connecté.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>Fidelity Plus</Text>
          <Pressable onPress={onLogout} hitSlop={12}>
            <Text style={styles.logout}>Déconnexion</Text>
          </Pressable>
        </View>

        <View style={styles.center}>
          <Text style={styles.greeting}>Salut {client.pseudonym}</Text>
          <Text style={styles.tagline}>Ton QR universel — montre-le chez tes partenaires</Text>

          <View style={[styles.qrCard, { width: qrSize + spacing.lg * 2 }]}>
            <QRCode
              value={payload}
              size={qrSize}
              color={colors.text}
              backgroundColor="#FFFFFF"
            />
          </View>

          <View style={styles.codePill}>
            <Text style={styles.codePillLabel}>Ton code</Text>
            <Text style={styles.codePillValue}>{client.loginCode}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            title="Voir les partenaires"
            variant="pillLight"
            onPress={() => navigation.navigate('ClientRestaurants')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.heroBg },
  safe: { flex: 1, paddingHorizontal: spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  brand: { ...typography.h3, color: colors.heroText, fontWeight: '800', letterSpacing: -0.3 },
  logout: { ...typography.small, color: colors.heroText, fontWeight: '700', opacity: 0.9 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  greeting: { ...typography.h1, color: colors.heroText, fontSize: 32 },
  tagline: {
    ...typography.body,
    color: colors.heroText,
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  codePillLabel: {
    ...typography.small,
    color: colors.onAccent,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  codePillValue: {
    fontSize: 18,
    color: colors.onAccent,
    fontWeight: '800',
    letterSpacing: 4,
  },
  footer: { paddingBottom: spacing.md },
  muted: { ...typography.body, color: colors.textMuted },
});
