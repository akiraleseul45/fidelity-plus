import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { usePartnerHeader } from '../../components/PartnerMenu';
import { apiProUpdateProfile } from '../../store/api';
import { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../stores/authStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerVitrineEdit'>;

export const PartnerVitrineEditScreen: React.FC<Props> = ({ navigation }) => {
  usePartnerHeader(navigation);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const partner = user?.role === 'partner' ? user : null;

  const [description, setDescription] = useState(partner?.description ?? '');
  const [imageUrl, setImageUrl] = useState(partner?.imageUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!partner) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
      </Screen>
    );
  }

  const trimmedUrl = imageUrl.trim();
  const urlValid = trimmedUrl === '' || /^https:\/\/.+/i.test(trimmedUrl);

  const save = async () => {
    setError(null);
    setSaved(false);
    if (!urlValid) {
      setError('L’URL de l’image doit commencer par https://');
      return;
    }
    setSaving(true);
    const res = await apiProUpdateProfile({
      description: description.trim(),
      imageUrl: trimmedUrl,
    });
    setSaving(false);
    if (!res.success || !res.partner) {
      setError(res.error || 'Enregistrement impossible.');
      return;
    }
    setUser(res.partner);
    setSaved(true);
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Ces informations composent ta page publique de présentation.
        </Text>

        {!partner.modVitrine ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Le module Vitrine est désactivé — ta page publique n’est pas visible. Active-le dans
              « Modules » pour la publier.
            </Text>
          </View>
        ) : (
          <View style={styles.okBox}>
            <Text style={styles.okText}>Ta page publique est visible (module Vitrine activé).</Text>
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Présente ton établissement, tes spécialités…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={5}
            style={[styles.input, styles.multiline]}
            textAlignVertical="top"
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Image de couverture (URL https)</Text>
          <TextInput
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="https://…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          {!urlValid ? <Text style={styles.error}>L’URL doit commencer par https://</Text> : null}
          {urlValid && trimmedUrl ? (
            <Image source={{ uri: trimmedUrl }} style={styles.preview} resizeMode="cover" />
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.success}>Enregistré.</Text> : null}

        <Button title="Enregistrer" onPress={save} loading={saving} disabled={saving} />
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  intro: { ...typography.body, color: colors.textMuted },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  multiline: { minHeight: 120 },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
  },
  error: { ...typography.small, color: colors.danger, fontWeight: '600' },
  success: { ...typography.small, color: colors.success, fontWeight: '600' },
  noteBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  noteText: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  okBox: { backgroundColor: '#EAF7EE', borderRadius: radius.md, padding: spacing.md },
  okText: { ...typography.small, color: '#0B6B2E', lineHeight: 18 },
});
