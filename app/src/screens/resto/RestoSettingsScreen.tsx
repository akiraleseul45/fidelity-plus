import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { RewardType } from '../../types';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RestoSettings'>;

export const RestoSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { currentRestoId, restaurants, updateRestoSettings } = useApp();
  const resto = restaurants.find((r) => r.id === currentRestoId);

  const [threshold, setThreshold] = useState(String(resto?.rewardThreshold ?? 10));
  const [type, setType] = useState<RewardType>(resto?.rewardType ?? 'free_meal');
  const [value, setValue] = useState(String(resto?.rewardValue ?? 10));

  if (!resto) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
      </Screen>
    );
  }

  const save = async () => {
    const n = parseInt(threshold, 10);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Seuil invalide', 'Entre un nombre de points positif.');
      return;
    }
    const v = type === 'discount' ? parseInt(value, 10) : undefined;
    if (type === 'discount' && (!Number.isFinite(v!) || v! <= 0 || v! > 100)) {
      Alert.alert('Réduction invalide', 'Entre un pourcentage entre 1 et 100.');
      return;
    }
    await updateRestoSettings(resto.id, { rewardThreshold: n, rewardType: type, rewardValue: v });
    Alert.alert('Sauvegardé', 'Les paramètres ont été mis à jour.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
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
            <Chip label="Repas gratuit" active={type === 'free_meal'} onPress={() => setType('free_meal')} />
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
        <Button title="Sauvegarder" onPress={save} />
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
