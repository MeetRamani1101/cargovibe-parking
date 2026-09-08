import { StyleSheet, Text, View } from 'react-native';
import { STATUS_LABELS, type ParkingRequestStatus } from '@cargovibe/shared';

import { radius, spacing, statusColors } from '../theme';

interface Props {
  status: ParkingRequestStatus;
  size?: 'sm' | 'lg';
}

/** Labels come from the shared package, so API and UI never disagree. */
export function StatusBadge({ status, size = 'sm' }: Props) {
  const palette = statusColors[status];

  return (
    <View
      style={[styles.badge, size === 'lg' && styles.badgeLarge, { backgroundColor: palette.bg }]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${STATUS_LABELS[status]}`}
    >
      <Text style={[styles.text, size === 'lg' && styles.textLarge, { color: palette.fg }]}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  badgeLarge: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  text: { fontSize: 12, fontWeight: '600' },
  textLarge: { fontSize: 15 },
});
