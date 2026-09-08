import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { PARKING_REQUEST_STATUSES, type ParkingRequest, type ParkingRequestStatus } from '@cargovibe/shared';

import { Button } from '../src/components/Button';
import { RequestCard } from '../src/components/RequestCard';
import { EmptyState, ErrorState, LoadingState } from '../src/components/ScreenState';
import { StatusFilterBar, type StatusFilter } from '../src/components/StatusFilterBar';
import { useParkingRequests } from '../src/hooks/useParkingRequests';
import { CONTENT_MAX_WIDTH, WIDE_LAYOUT_BREAKPOINT, colors, spacing } from '../src/theme';

/**
 * Screen 1 - the request list.
 *
 * Responsiveness: on a phone this is a single column; from `WIDE_LAYOUT_BREAKPOINT`
 * upwards it becomes a two-column grid inside a centred, width-capped container,
 * so the same code reads well in a desktop browser without a separate web build.
 */
export default function RequestListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { data, isPending, isError, error, refetch, isRefetching } = useParkingRequests();

  const counts = useMemo(() => countByStatus(data ?? []), [data]);
  const visible = useMemo(
    () => (statusFilter === 'all' ? (data ?? []) : (data ?? []).filter((r) => r.status === statusFilter)),
    [data, statusFilter],
  );

  // First load only. A refetch keeps the current list on screen and shows the
  // pull-to-refresh spinner instead, so the list never blanks out.
  if (isPending) return <LoadingState label="Loading parking requests…" />;

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View style={styles.screen}>
      <View style={[styles.container, isWide && styles.containerWide]}>
        <View style={styles.toolbar}>
          <Text style={styles.summary}>
            {data.length} request{data.length === 1 ? '' : 's'}
          </Text>
          <Button
            label="Ask assistant"
            variant="secondary"
            onPress={() => router.push('/assistant')}
            accessibilityHint="Opens the parking assistant"
          />
        </View>

        <StatusFilterBar
          value={statusFilter}
          onChange={setStatusFilter}
          counts={counts}
          total={data.length}
        />

        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          // `key` forces a fresh list when the column count changes: FlatList
          // cannot switch numColumns on an existing instance.
          key={isWide ? 'grid' : 'list'}
          numColumns={isWide ? 2 : 1}
          {...(isWide ? { columnWrapperStyle: styles.column } : {})}
          contentContainerStyle={[styles.listContent, visible.length === 0 && styles.listEmpty]}
          renderItem={({ item }) => (
            <View style={isWide ? styles.gridItem : undefined}>
              <RequestCard request={item} onPress={() => router.push(`/request/${item.id}`)} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={statusFilter === 'all' ? 'No parking requests' : 'Nothing to show'}
              message={
                statusFilter === 'all'
                  ? 'Requests created through the API will appear here. Pull down to refresh.'
                  : `There are no requests with this status. Pick a different filter.`
              }
            />
          }
        />
      </View>
    </View>
  );
}

function countByStatus(requests: ParkingRequest[]): Record<ParkingRequestStatus, number> {
  const counts = Object.fromEntries(
    PARKING_REQUEST_STATUSES.map((status) => [status, 0]),
  ) as Record<ParkingRequestStatus, number>;

  for (const request of requests) counts[request.status] += 1;
  return counts;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  container: { flex: 1, width: '100%' },
  containerWide: { maxWidth: CONTENT_MAX_WIDTH },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  summary: { fontSize: 14, color: colors.textMuted },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, gap: 0 },
  listEmpty: { flexGrow: 1 },
  column: { gap: spacing.md },
  gridItem: { flex: 1 },
  separator: { height: spacing.md },
});
