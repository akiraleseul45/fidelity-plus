import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView } from 'expo-camera';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CameraPermissionGate } from '../../components/CameraPermissionGate';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RestoScanner'>;

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'confirm'; clientId: string; pseudonym: string }
  | { kind: 'done'; pseudonym: string; points: number; reached: boolean };

export const RestoScannerScreen: React.FC<Props> = ({ navigation }) => {
  const { currentRestoId, restaurants, addPoint, logoutResto } = useApp();
  const resto = restaurants.find((r) => r.id === currentRestoId) ?? null;
  const [state, setState] = useState<ScanState>({ kind: 'scanning' });

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (state.kind !== 'scanning') return;
      try {
        const parsed = JSON.parse(data);
        if (!parsed?.clientId || !parsed?.pseudonym) throw new Error('invalid');
        setState({ kind: 'confirm', clientId: parsed.clientId, pseudonym: parsed.pseudonym });
      } catch {
        Alert.alert('QR invalide', 'Ce QR code n\'est pas un client valide.', [
          { text: 'OK', onPress: () => setState({ kind: 'scanning' }) },
        ]);
      }
    },
    [state.kind],
  );

  const confirm = async () => {
    if (state.kind !== 'confirm' || !resto) return;
    const entry = await addPoint(state.clientId, resto.id, state.pseudonym);
    const reached = entry.points >= resto.rewardThreshold;
    setState({ kind: 'done', pseudonym: entry.pseudonym, points: entry.points, reached });
  };

  const logout = async () => {
    await logoutResto();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (!resto) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
        <Button title="Retour" onPress={logout} />
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
            <Text style={styles.restoName}>{resto.name}</Text>
            <Pressable onPress={logout} hitSlop={12}>
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
                onPress={() => navigation.navigate('RestoDashboard')}
                style={{ flex: 1 }}
              />
              <Button
                title="Fidélité"
                variant="secondary"
                onPress={() => navigation.navigate('RestoSettings')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        {state.kind === 'confirm' && (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Client reconnu</Text>
            <Text style={styles.sheetName}>{state.pseudonym}</Text>
            <Text style={styles.sheetQ}>Ajouter 1 point ?</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Button
                title="Annuler"
                variant="secondary"
                onPress={() => setState({ kind: 'scanning' })}
                style={{ flex: 1 }}
              />
              <Button title="Valider" onPress={confirm} style={{ flex: 1 }} />
            </View>
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
  sheetName: { ...typography.h1, color: colors.text, marginTop: 4 },
  sheetQ: { ...typography.body, color: colors.text, marginTop: spacing.md },
  bigPoints: { ...typography.mega, color: colors.primary, lineHeight: 100 },
  reward: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
