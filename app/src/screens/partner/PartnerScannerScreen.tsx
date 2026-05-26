import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView } from 'expo-camera';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CameraPermissionGate } from '../../components/CameraPermissionGate';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerScanner'>;

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'pending' }
  | { kind: 'done'; pseudonym: string; points: number; reached: boolean }
  | { kind: 'error'; message: string };

/**
 * Scanner screen.
 *
 * The QR contains a SIGNED JWT (issued by /api/loyalty/qr to the client).
 * We extract the raw token string and POST /api/loyalty/scan — the server
 * verifies signature, expiration, nonce and atomically adds a point.
 *
 * There is no more confirmation step: the server side already handles
 * anti-replay (single-use nonce), so we directly show the outcome.
 */
export const PartnerScannerScreen: React.FC<Props> = ({ navigation }) => {
  const { user, scanQr, logout } = useApp();
  const partner = user?.role === 'partner' ? user : null;
  const [state, setState] = useState<ScanState>({ kind: 'scanning' });

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (state.kind !== 'scanning') return;
      setState({ kind: 'pending' });

      // Accept both raw JWT strings AND legacy JSON wrappers (best-effort).
      let qrToken = (data || '').trim();
      if (qrToken.startsWith('{')) {
        try {
          const parsed = JSON.parse(qrToken);
          qrToken = parsed.token || parsed.qrToken || qrToken;
        } catch {
          /* ignore */
        }
      }

      const res = await scanQr(qrToken);
      if (!res.success) {
        setState({ kind: 'error', message: res.error || 'Scan impossible.' });
        return;
      }
      setState({
        kind: 'done',
        pseudonym: res.pseudonym || 'Client',
        points: res.points ?? 0,
        reached: !!res.reached,
      });
    },
    [state.kind, scanQr],
  );

  const onLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (!partner) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
        <Button title="Retour" onPress={onLogout} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraPermissionGate>
        {state.kind === 'scanning' && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        )}

        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            <Text style={styles.restoName}>{partner.companyName}</Text>
            <Pressable onPress={onLogout} hitSlop={12}>
              <Text style={styles.logout}>Déconnexion</Text>
            </Pressable>
          </View>
        </View>

        {state.kind === 'scanning' && (
          <View style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.reticle} />
            <Text style={styles.bottomText}>Pointe la caméra sur le QR du client</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                title="Tableau de bord"
                variant="secondary"
                onPress={() => navigation.navigate('PartnerDashboard')}
                style={{ flex: 1 }}
              />
              <Button
                title="Fidélité"
                variant="secondary"
                onPress={() => navigation.navigate('PartnerSettings')}
                style={{ flex: 1 }}
              />
            </View>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              hitSlop={8}
              style={{ paddingTop: spacing.sm }}
            >
              <Text style={{ color: '#fff', opacity: 0.85, textDecorationLine: 'underline' }}>
                Mon compte
              </Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'pending' && (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Vérification…</Text>
          </View>
        )}

        {state.kind === 'done' && (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>+1 point</Text>
            <Text style={styles.sheetName}>{state.pseudonym}</Text>
            <Text style={styles.bigPoints}>{state.points} pts</Text>
            {state.reached && (
              <Text style={styles.reward}>🎉 Récompense atteinte — offre-la au client !</Text>
            )}
            <Button
              title="Scanner le suivant"
              onPress={() => setState({ kind: 'scanning' })}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}

        {state.kind === 'error' && (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitleError}>⚠️ Scan refusé</Text>
            <Text style={styles.sheetQ}>{state.message}</Text>
            <Button
              title="Réessayer"
              onPress={() => setState({ kind: 'scanning' })}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}
      </CameraPermissionGate>
    </View>
  );
};

const styles = StyleSheet.create({
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  restoName: { ...typography.h3, color: '#fff' },
  logout: { ...typography.small, color: '#fff', opacity: 0.9 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  reticle: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: radius.md,
    opacity: 0.9,
    marginBottom: spacing.sm,
  },
  bottomText: { ...typography.body, color: '#fff' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetTitle: { ...typography.h3, color: colors.textMuted },
  sheetTitleError: { ...typography.h3, color: colors.danger },
  sheetName: { ...typography.h1, color: colors.text, marginTop: 4 },
  sheetQ: { ...typography.body, color: colors.text, marginTop: spacing.md },
  bigPoints: { ...typography.mega, color: colors.primary, lineHeight: 100 },
  reward: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
