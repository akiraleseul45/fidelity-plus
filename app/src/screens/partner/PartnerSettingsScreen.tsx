import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerSettings'>;

type RewardType = 'free_meal' | 'discount';

export const PartnerSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, updatePartnerSettings } = useApp();
  const partner = user?.role === 'partner' ? user : null;

  const [threshold, setThreshold] = useState(String(partner?.rewardThreshold ?? 10));
  const [type, setType] = useState<RewardType>(partner?.rewardType ?? 'free_meal');
  const [value, setValue] = useState(String(partner?.rewardValue ?? 10));
  const [saving, setSaving] = useState(false);

  if (!partner) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
      </Screen>
    );
  }

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
    else Alert.alert(title, msg);
  };

  const save = async () => {
    const n = parseInt(threshold, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 1000) {
      return showAlert('Seuil invalide', 'Entre un nombre de points entre 1 et 1000.');
    }
    const v = type === 'discount' ? parseInt(value, 10) : undefined;
    if (type === 'discount' && (!Number.isFinite(v!) || v! <= 0 || v! > 100)) {
      return showAlert('Réduction invalide', 'Entre un pourcentage entre 1 et 100.');
    }
    setSaving(true);
    const res = await updatePartnerSettings({
      rewardThreshold: n,
      rewardType: type,
      rewardValue: v,
    });
    setSaving(false);
    if (!res.ok) {
      return showAlert('Erreur', res.error);
    }
    showAlert('Sauvegardé', 'Les paramètres ont été mis à jour.');
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={{ flex: 1, gap: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Points nécessaires</Text>
          <TextInput
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Type de récompense</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip label="Gratuit seulement" active={type === 'free_meal'} onPress={() => setType('free_meal')} />
            <Chip label="Réduction %" active={type === 'discount'} onPress={() => setType('discount')} />
          </View>
        </View>

        {type === 'discount' && (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Réduction (%)</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
        )}
      </View>

      <View style={{ paddingBottom: spacing.lg }}>
        <Button title="Sauvegarder" onPress={save} loading={saving} disabled={saving} />
      </View>
    </Screen>
  );
};

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
  >
    <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    ...typography.h3,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipText: { ...typography.body, color: colors.text, fontWeight: '600' },
});
