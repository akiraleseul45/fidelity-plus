import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { apiCreateReport } from '../store/api';
import { colors, radius, spacing, typography } from '../theme/theme';

/**
 * "Signaler un problème" — a button that opens a small modal where a
 * signed-in client or partner describes an issue. The report is sent to the
 * admin console. Reusable on both the client and partner sides.
 */
export const ReportProblemButton: React.FC<{ context?: string }> = ({ context }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const valid = message.trim().length >= 5;

  const close = () => {
    setOpen(false);
    setMessage('');
    setDone(false);
  };

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    const res = await apiCreateReport(message.trim(), context);
    setSending(false);
    if (res.success) {
      setDone(true);
    } else if (Platform.OS === 'web') {
      window.alert(res.error || "Envoi impossible. Réessaie.");
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.85 }]}
        hitSlop={6}
      >
        <Text style={styles.triggerText}>🚩 Signaler un problème</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>Signaler un problème</Text>
              <Pressable onPress={close} hitSlop={8}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            {done ? (
              <View style={styles.doneBox}>
                <Text style={styles.doneTitle}>✅ Merci !</Text>
                <Text style={styles.doneBody}>
                  Ton signalement a bien été envoyé. Nous le traiterons au plus vite.
                </Text>
                <Pressable onPress={close} style={styles.submit}>
                  <Text style={styles.submitText}>Fermer</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.sub}>
                  Décris le problème rencontré. Ton message est envoyé à l'équipe Fidelity Plus.
                </Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Explique ce qui ne va pas…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  multiline
                  numberOfLines={5}
                  maxLength={2000}
                  textAlignVertical="top"
                  accessibilityLabel="Description du problème"
                />
                <Pressable
                  onPress={submit}
                  disabled={!valid || sending}
                  style={({ pressed }) => [
                    styles.submit,
                    (!valid || sending) && { opacity: 0.5 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.submitText}>{sending ? 'Envoi…' : 'Envoyer'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  triggerText: { ...typography.body, color: colors.text, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h2, color: colors.text },
  close: { ...typography.h2, color: colors.textMuted },
  sub: { ...typography.small, color: colors.textMuted },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 120,
    backgroundColor: colors.surface,
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitText: { ...typography.body, color: '#fff', fontWeight: '800' },
  doneBox: { gap: spacing.sm, paddingVertical: spacing.md },
  doneTitle: { ...typography.h3, color: colors.text },
  doneBody: { ...typography.body, color: colors.textMuted },
});
