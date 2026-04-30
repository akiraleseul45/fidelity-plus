import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { colors, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RestoAuthHome'>;

export const RestoAuthHomeScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.h1}>Espace professionnel</Text>
        <Text style={styles.sub}>Connecte-toi ou crée un compte pour ton établissement.</Text>
      </View>
      <View style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
        <Button title="J'ai un code" onPress={() => navigation.navigate('RestoLogin')} />
        <Button
          title="S'inscrire"
          variant="secondary"
          onPress={() => navigation.navigate('RestoSignup')}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  top: { flex: 1, paddingTop: spacing.lg, gap: spacing.sm },
  h1: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted },
});
