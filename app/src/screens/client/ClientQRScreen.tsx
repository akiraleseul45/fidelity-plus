import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { confirm } from '../../stores/confirmStore';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientQR'>;

/**
 * Client home screen.
 *
 * The QR shown here is a short-lived SIGNED JWT issued by the backend.
 * It expires after 60 seconds, so we auto-refresh every 45 seconds while
 * this screen is visible. This kills any photographed-QR attack.
 */
const QR_REFRESH_INTERVAL_MS = 45_000;

export const ClientQRScreen: React.FC<Props> = ({ navigation }) => {
  const { user, refreshQr, logout, refreshClientLoyalty, clientLoyalty } = useApp();
  const { width } = useWindowDimensions();
  const qrSize = Math.min(width - spacing.lg * 4, 280);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const client = user?.role === 'client' ? user : null;

  useEffect(() => {
    if (!client) return;
    let alive = true;

    const fetchQr = async () => {
      const token = await refreshQr();
      if (!alive) return;
      if (token) {
        setQrToken(token);
        setError(null);
      } else {
        setError('Impossible de générer le QR code. Vérifie ta connexion.');
      }
    };

    const startTimer = () => {
      if (timerRef.current) return;
      timerRef.current = setInterval(fetchQr, QR_REFRESH_INTERVAL_MS);
    };
    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    // Pause/resume on tab visibility (web) — saves battery + bandwidth
    // when the user is on another tab. On focus we immediately fetch a
    // fresh QR (the previous one may have expired during the pause).
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        stopTimer();
      } else {
        fetchQr();
        startTimer();
      }
    };

    fetchQr();
    startTimer();
    refreshClientLoyalty();

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      alive = false;
      stopTimer();
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [client, refreshQr, refreshClientLoyalty]);

  const onLogout = async () => {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message: 'Tu devras retaper ton code à la prochaine visite.',
      confirmLabel: 'Se déconnecter',
      danger: true,
    });
    if (!ok) return;
    await logout();
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

  const totalPoints = clientLoyalty.reduce((sum, item) => sum + item.points, 0);

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
            {qrToken ? (
              <QRCode value={qrToken} size={qrSize} color={colors.text} backgroundColor="#FFFFFF" />
            ) : (
              <View style={{ width: qrSize, height: qrSize, alignItems: 'center', justifyContent: 'center' }}>
                {error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : (
                  <ActivityIndicator color={colors.primary} size="large" />
                )}
              </View>
            )}
          </View>

          {totalPoints > 0 ? (
            <View style={styles.codePill}>
              <Text style={styles.codePillLabel}>Total points cumulés</Text>
              <Text style={styles.codePillValue}>{totalPoints}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title="Mes récompenses"
              variant="pillAccent"
              onPress={() => navigation.navigate('ClientRewards')}
              style={{ flex: 1 }}
            />
            <Button
              title="Partenaires"
              variant="pillLight"
              onPress={() => navigation.navigate('ClientPartners')}
              style={{ flex: 1 }}
            />
          </View>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            hitSlop={8}
            style={styles.profileLink}
          >
            <Text style={styles.profileLinkText}>Mon compte</Text>
          </Pressable>
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
  errorText: { ...typography.small, color: colors.danger, textAlign: 'center', padding: spacing.md },
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
  },
  footer: { paddingBottom: spacing.md, gap: spacing.sm },
  profileLink: { alignSelf: 'center', paddingVertical: spacing.xs },
  profileLinkText: { ...typography.small, color: colors.heroText, opacity: 0.8, textDecorationLine: 'underline' },
  muted: { ...typography.body, color: colors.textMuted },
});
