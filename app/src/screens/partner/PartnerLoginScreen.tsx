import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerLogin'>;

export const PartnerLoginScreen: React.FC<Props> = ({ navigation }) => {
  const { loginPartner } = useApp();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await loginPartner(code);
      if (!res.ok) {
        if (Platform.OS === 'web') {
          window.alert(res.error);
        } else {
          Alert.alert('Connexion impossible', res.error);
        }
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'PartnerScanner' }] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          <Text style={styles.h1}>Ton code</Text>
          <Text style={styles.sub}>Entre le code reçu par email lors de la validation.</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="XXXXXXXX"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            style={styles.input}
            onSubmitEditing={submit}
          />
          <Text style={styles.hint}>Code reçu par email lors de la validation.</Text>
        </View>
        <View style={{ paddingBottom: spacing.lg }}>
          <Button title="Se connecter" onPress={submit} disabled={!code.trim() || loading} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  h1: { ...typography.h1, color: colors.text, marginTop: spacing.lg },
  sub: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xl },
  input: {
    ...typography.h2,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    letterSpacing: 4,
    textAlign: 'center',
  },
  hint: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
});
