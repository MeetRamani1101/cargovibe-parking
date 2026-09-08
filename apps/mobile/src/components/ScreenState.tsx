import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { colors, spacing } from '../theme';
import { Button } from './Button';

/**
 * The loading / empty / error trio, in one place.
 *
 * Both list and detail screens need all three, and keeping them here means the
 * wording and layout of "something went wrong" is identical everywhere.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={[styles.title, styles.errorTitle]}>{errorTitle(error)}</Text>
      <Text style={styles.message}>{errorMessage(error)}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} style={styles.retry} /> : null}
    </View>
  );
}

/** Turns any thrown value into something an operator can act on. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details.map((issue) => `${issue.field}: ${issue.message}`).join('\n');
    return details.length > 0 ? `${error.message}\n${details}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

function errorTitle(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network_error') return 'Cannot reach the API';
    if (error.code === 'not_found') return 'Not found';
    if (error.code === 'invalid_transition') return 'Status change not allowed';
  }
  return 'Something went wrong';
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, textAlign: 'center' },
  errorTitle: { color: colors.danger },
  message: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retry: { marginTop: spacing.md, minWidth: 160 },
});
