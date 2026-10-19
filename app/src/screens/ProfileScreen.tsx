import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { ReportProblemButton } from '../components/ReportProblemButton';
import { Screen } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { confirm } from '../stores/confirmStore';
import { useCookieStore } from '../stores/cookieStore';
import { useApp } from '../store/AppContext';
import { useThemeStore } from '../stores/themeStore';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

/**
 * Profile screen — works for both client and partner roles.
 *
 * Exposes:
 *  - logged user info (read-only)
 *  - logout
 *  - GDPR delete account (irreversible, with confirm)
 *  - links to legal docs (terms, privacy)
 */
export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { user, logout, deleteAccount } = useApp();
  const themePref = useThemeStore((s) => s.preference);
  const setThemePref = useThemeStore((s) => s.setPreference);
  const analytics = useCookieStore((s) => s.analytics);
  const setAnalytics = useCookieStore((s) => s.setAnalytics);
  const [deleting, setDeleting] = useState(false);

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

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Supprimer mon compte ?',
      message: 'Cette action est IRRÉVERSIBLE. Tes points et ton historique seront perdus.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    const res = await deleteAccount();
    setDeleting(false);
    if (!res.ok) {
      if (Platform.OS === 'web') window.alert(res.error);
      else Alert.alert('Erreur', res.error);
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (!user) {
    return (
      <Screen>
        <Text style={styles.muted}>Non connecté.</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <Text style={styles.h1}>Mon compte</Text>
          <Text style={styles.sub}>{user.role === 'client' ? 'Compte client' : 'Compte professionnel'}</Text>
        </View>

        <View style={styles.card}>
          {user.role === 'client' ? (
            <>
              <Row label="Pseudonyme" value={user.pseudonym} />
              <Row label="Email" value={user.email || '—'} />
            </>
          ) : user.role === 'partner' ? (
            <>
              <Row label="Nom du domaine" value={user.ownerName} />
              <Row label="Entreprise" value={user.companyName} />
              <Row label="Adresse" value={user.address} />
              <Row label="Email" value={user.email || '—'} />
              <Row label="Téléphone fixe" value={user.phoneFixed || '—'} />
              <Row label="Téléphone mobile" value={user.phoneMobile || '—'} />
              <Row label="Statut" value={user.status} />
            </>
          ) : (
            <Row label="Email" value={user.email || '—'} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Confidentialité (RGPD)</Text>
          <Text style={styles.sub}>
            Tes données personnelles sont stockées de manière sécurisée. Tu peux supprimer
            définitivement ton compte à tout moment.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
            style={styles.linkRow}
          >
            <Text style={styles.link}>Politique de confidentialité →</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
            style={styles.linkRow}
          >
            <Text style={styles.link}>Conditions générales d'utilisation →</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Legal', {})}
            style={styles.linkRow}
          >
            <Text style={styles.link}>Mentions légales →</Text>
          </Pressable>
        </View>

        {user.role === 'client' ? (
          <View style={styles.section}>
            <Text style={styles.h2}>Mon activité</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('ClientHistory')}
              style={styles.linkRow}
            >
              <Text style={styles.link}>📜 Historique de mes actions →</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.h2}>Cookies</Text>
          <View style={styles.cookieRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cookieName}>Essentiels</Text>
              <Text style={styles.sub}>Nécessaires pour rester connecté. Toujours actifs.</Text>
            </View>
            <Text style={styles.alwaysOn}>Actif</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: analytics }}
            onPress={() => setAnalytics(!analytics)}
            style={styles.cookieRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cookieName}>Mesure d'audience</Text>
              <Text style={styles.sub}>Optionnel — nous aide à améliorer l'app.</Text>
            </View>
            <View style={[styles.toggle, analytics && styles.toggleOn]}>
              <View style={[styles.knob, analytics && styles.knobOn]} />
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Aide & support</Text>
          <Text style={styles.sub}>Un bug, une question, un souci ? Dis-le-nous.</Text>
          <View style={{ marginTop: spacing.sm }}>
            <ReportProblemButton context={user.role === 'partner' ? 'Profil pro' : 'Profil client'} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Apparence</Text>
          <View style={styles.themeRow}>
            {(['system', 'light', 'dark'] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setThemePref(p)}
                style={[styles.themeChip, themePref === p && styles.themeChipActive]}
              >
                <Text style={[styles.themeChipText, themePref === p && styles.themeChipTextActive]}>
                  {p === 'system' ? '🖥️ Auto' : p === 'light' ? '☀️ Clair' : '🌙 Sombre'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Button title="Se déconnecter" variant="secondary" onPress={onLogout} />
        </View>

        <View style={styles.section}>
          <Text style={styles.dangerHeader}>Zone dangereuse</Text>
          <Button
            title={deleting ? 'Suppression…' : 'Supprimer mon compte définitivement'}
            variant="ghost"
            onPress={onDelete}
            disabled={deleting}
            style={styles.dangerBtn}
          />
        </View>
      </ScrollView>
    </Screen>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  h1: { ...typography.h1, color: colors.text },
  h2: { ...typography.h2, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted },
  muted: { ...typography.body, color: colors.textMuted },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLabel: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  rowValue: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: 'right' },
  linkRow: { paddingVertical: 4 },
  link: { ...typography.body, color: colors.primary, fontWeight: '600' },
  cookieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  cookieName: { ...typography.body, color: colors.text, fontWeight: '700' },
  alwaysOn: { ...typography.small, color: colors.textMuted, fontWeight: '700' },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  dangerHeader: { ...typography.small, color: colors.danger, fontWeight: '700', letterSpacing: 0.5 },
  dangerBtn: { borderWidth: 1, borderColor: colors.danger },
  themeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  themeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  themeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  themeChipText: { ...typography.small, color: colors.text, fontWeight: '600' },
  themeChipTextActive: { color: '#fff' },
});
