import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STATUS_LABELS, type ParkingRequest } from '@cargovibe/shared';

import { colors, radius, spacing } from '../theme';
import { formatDuration, formatRange } from '../utils/format';
import { StatusBadge } from './StatusBadge';

interface Props {
  request: ParkingRequest;
  onPress: () => void;
}

/**
 * One row of the request list: driver, plate, requested window and status -
 * the four things an operator scans for. Everything else is on the detail
 * screen.
 */
export function RequestCard({ request, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${request.driverName}, ${request.licensePlate}, ${STATUS_LABELS[request.status]}`}
      accessibilityHint="Opens the request details"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.driver} numberOfLines={1}>
          {request.driverName}
        </Text>
        <StatusBadge status={request.status} />
      </View>

      <Text style={styles.plate}>
        {request.licensePlate} · {request.truckType}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.window} numberOfLines={1}>
          {formatRange(request.requestedFrom, request.requestedUntil)}
        </Text>
        <Text style={styles.duration}>
          {formatDuration(request.requestedFrom, request.requestedUntil)}
          {request.parkingSpotId ? ` · ${request.parkingSpotId}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  driver: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  plate: { fontSize: 13, color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  window: { flex: 1, fontSize: 13, color: colors.text },
  duration: { fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
