import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { PARKING_REQUEST_STATUSES, STATUS_LABELS, type ParkingRequestStatus } from '@cargovibe/shared';

import { colors, radius, spacing } from '../theme';

export type StatusFilter = ParkingRequestStatus | 'all';

interface Props {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  /** Number of requests per status, shown on each chip. */
  counts: Record<ParkingRequestStatus, number>;
  total: number;
}

/**
 * Filtering is applied client-side against the already-fetched list rather than
 * by re-querying the API. The dataset an operator looks at is small, and this
 * keeps switching filters instant and works offline from cache. The API does
 * support `?status=`, and switching to server-side filtering would only mean
 * passing the value into the query key.
 */
export function StatusFilterBar({ value, onChange, counts, total }: Props) {
  const options: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: total },
    ...PARKING_REQUEST_STATUSES.map((status) => ({
      key: status as StatusFilter,
      label: STATUS_LABELS[status],
      count: counts[status],
    })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // `flexGrow: 0` stops the bar from claiming the leftover vertical space
      // (and stretching the chips) when it sits inside a flex column.
      style={styles.bar}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label}, ${option.count} requests`}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {option.label} ({option.count})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ScrollView's own base style is `{ flexGrow: 1, flexShrink: 1 }`. Both have
  // to be overridden: `flexGrow: 0` stops the bar claiming leftover vertical
  // space (which stretched the chips), and `flexShrink: 0` stops the list below
  // squeezing it (which clipped the chips on Android). Setting only one of the
  // two fixes one symptom and leaves the other.
  bar: { flexGrow: 0, flexShrink: 0 },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 13, color: colors.text },
  labelSelected: { color: colors.primaryText, fontWeight: '600' },
});
