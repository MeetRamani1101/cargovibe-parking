import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  accessibilityHint,
}: Props) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isInactive && styles.pressed,
        isInactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44, // comfortable touch target on a phone
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: { opacity: 0.75 },
  inactive: { opacity: 0.45 },
  label: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },
  labelSecondary: { color: colors.primary },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
};
