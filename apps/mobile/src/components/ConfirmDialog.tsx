import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { Button } from './Button';

export interface ConfirmDialogInput {
  label: string;
  placeholder?: string;
  initialValue?: string;
  /** Return an error message to block confirmation, or `null` when valid. */
  validate?: (value: string) => string | null;
}

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  /** When set, the dialog also collects a value (used for the parking spot). */
  input?: ConfirmDialogInput;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

/**
 * A confirmation modal that works identically on web and native.
 *
 * `Alert.alert` is not implemented on react-native-web, so a `Modal` is the
 * only way to have one confirmation flow across all three targets. It doubles
 * as the prompt for the parking spot, since approving a request is exactly the
 * case where the operator has to supply one more piece of information.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  busy = false,
  input,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState(input?.initialValue ?? '');
  const [touched, setTouched] = useState(false);

  // Reset whenever the dialog is opened, so a previous attempt never leaks in.
  useEffect(() => {
    if (visible) {
      setValue(input?.initialValue ?? '');
      setTouched(false);
    }
  }, [visible, input?.initialValue]);

  const validationError = input?.validate ? input.validate(value.trim()) : null;
  const canConfirm = !busy && validationError === null;

  const handleConfirm = () => {
    setTouched(true);
    if (!canConfirm) return;
    onConfirm(input ? value.trim() : undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityRole={Platform.OS === 'web' ? 'none' : undefined}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {input ? (
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>{input.label}</Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={input.placeholder ?? ''}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, touched && validationError ? styles.inputError : null]}
                accessibilityLabel={input.label}
                onSubmitEditing={handleConfirm}
                returnKeyType="done"
              />
              {touched && validationError ? (
                <Text style={styles.validationError}>{validationError}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.action} />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={handleConfirm}
              loading={busy}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  message: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  inputBlock: { gap: spacing.xs },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  validationError: { fontSize: 12, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  action: { flex: 1 },
});
