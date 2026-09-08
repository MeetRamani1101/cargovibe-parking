import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

export interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

interface Props {
  feedback: Feedback | null;
  onDismiss: () => void;
  /** Success messages disappear on their own; errors stay until dismissed. */
  autoHideMs?: number;
}

/**
 * Inline feedback after a mutation.
 *
 * Deliberately not `Alert.alert`: that is a no-op on web, and this app has to
 * work in a browser as well as on a device.
 */
export function FeedbackBanner({ feedback, onDismiss, autoHideMs = 4000 }: Props) {
  const shouldAutoHide = feedback?.tone === 'success';

  useEffect(() => {
    if (!feedback || !shouldAutoHide) return;
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
  }, [feedback, shouldAutoHide, autoHideMs, onDismiss]);

  if (!feedback) return null;

  const isError = feedback.tone === 'error';

  return (
    <View
      style={[styles.banner, isError ? styles.error : styles.success]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.message, isError ? styles.errorText : styles.successText]}>
        {feedback.message}
      </Text>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss message">
        <Text style={[styles.dismiss, isError ? styles.errorText : styles.successText]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  success: { backgroundColor: '#e4f4ea', borderColor: '#b6ddc6' },
  error: { backgroundColor: '#fdeae7', borderColor: '#f0bdb5' },
  message: { flex: 1, fontSize: 14, lineHeight: 20 },
  successText: { color: colors.success },
  errorText: { color: colors.danger },
  dismiss: { fontSize: 14, fontWeight: '700', paddingHorizontal: spacing.xs },
});
