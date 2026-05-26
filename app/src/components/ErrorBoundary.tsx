import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../theme/theme';

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { hasError: boolean; message?: string };

/**
 * Catches render errors in a sub-tree so a single broken component (e.g. the
 * map) cannot blank out the whole screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.box}>
          <Text style={styles.title}>Une erreur est survenue ici</Text>
          {this.state.message ? <Text style={styles.msg}>{this.state.message}</Text> : null}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#FFE2A0',
    gap: spacing.xs,
  },
  title: { ...typography.body, color: '#7A5A00', fontWeight: '700' },
  msg: { ...typography.small, color: '#7A5A00' },
});
