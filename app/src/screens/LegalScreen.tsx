import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { LEGAL_DOCS, LegalDoc } from '../legal/content';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

const ORDER: LegalDoc['key'][] = ['mentions', 'privacy', 'terms', 'program'];

export const LegalScreen: React.FC<Props> = ({ navigation, route }) => {
  const key = route.params?.doc;

  // Hub: list of documents.
  if (!key) {
    return (
      <Screen padded={false}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.h1}>Informations légales</Text>
          {ORDER.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              onPress={() => navigation.push('Legal', { doc: k })}
              style={styles.linkRow}
            >
              <Text style={styles.linkText}>{LEGAL_DOCS[k].title}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  const doc = LEGAL_DOCS[key];
  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>{doc.title}</Text>
        <Text style={styles.updated}>Dernière mise à jour : {doc.updated}</Text>
        <Text style={styles.body}>{doc.body}</Text>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  h1: { ...typography.h1, color: colors.text },
  updated: { ...typography.small, color: colors.textMuted },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  linkText: { ...typography.body, color: colors.text, fontWeight: '600' },
  chevron: { ...typography.h3, color: colors.textMuted },
});
