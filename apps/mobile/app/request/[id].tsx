import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  STATUS_LABELS,
  TRANSITION_LABELS,
  allowedTransitionsFrom,
  isFinalStatus,
  requiresParkingSpot,
  type ParkingRequestStatus,
} from '@cargovibe/shared';

import { Button } from '../../src/components/Button';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { FeedbackBanner, type Feedback } from '../../src/components/FeedbackBanner';
import { ErrorState, LoadingState, errorMessage } from '../../src/components/ScreenState';
import { StatusBadge } from '../../src/components/StatusBadge';
import { StatusTransitionDialog } from '../../src/components/StatusTransitionDialog';
import {
  useDeleteParkingRequest,
  useParkingRequest,
  useUpdateParkingRequestStatus,
} from '../../src/hooks/useParkingRequests';
import { CONTENT_MAX_WIDTH, WIDE_LAYOUT_BREAKPOINT, colors, radius, spacing } from '../../src/theme';
import { formatDateTime, formatDuration } from '../../src/utils/format';

/**
 * Screen 2 - request detail.
 *
 * Shows every field of a `ParkingRequest` except `note` (as specified), the
 * current status, and only those status actions the state machine currently
 * allows. Which actions exist is read from the shared package, so the buttons
 * can never drift from what the API will accept.
 */
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;

  const requestId = typeof id === 'string' ? id : '';
  const { data: request, isPending, isError, error, refetch, isRefetching } = useParkingRequest(requestId);

  const [pendingTarget, setPendingTarget] = useState<ParkingRequestStatus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const updateStatus = useUpdateParkingRequestStatus(requestId);
  const removeRequest = useDeleteParkingRequest(requestId);

  const dismissFeedback = useCallback(() => setFeedback(null), []);

  const applyTransition = (target: ParkingRequestStatus, parkingSpotId?: string) => {
    updateStatus.mutate(
      { status: target, ...(parkingSpotId ? { parkingSpotId } : {}) },
      {
        onSuccess: (updated) => {
          setPendingTarget(null);
          setFeedback({
            tone: 'success',
            message: `Status updated to “${STATUS_LABELS[updated.status]}”.`,
          });
        },
        onError: (mutationError) => {
          // Keep the dialog open on failure so the operator can correct the
          // input (for example an empty parking spot) and try again.
          setFeedback({ tone: 'error', message: errorMessage(mutationError) });
        },
      },
    );
  };

  if (isPending) return <LoadingState label="Loading request…" />;
  if (isError || !request) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const nextStatuses = allowedTransitionsFrom(request.status);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: request.driverName }} />

      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <FeedbackBanner feedback={feedback} onDismiss={dismissFeedback} />

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current status</Text>
          <StatusBadge status={request.status} size="lg" />
          {isFinalStatus(request.status) ? (
            <Text style={styles.finalHint}>
              This is a final status — it can no longer be changed.
            </Text>
          ) : null}
        </View>

        <Section title="Request">
          <Field label="Driver" value={request.driverName} />
          <Field label="License plate" value={request.licensePlate} />
          <Field label="Truck type" value={request.truckType} />
          <Field label="Status" value={STATUS_LABELS[request.status]} />
          <Field label="Parking spot" value={request.parkingSpotId ?? 'Not assigned'} />
        </Section>

        <Section title="Requested window">
          <Field label="From" value={formatDateTime(request.requestedFrom)} />
          <Field label="Until" value={formatDateTime(request.requestedUntil)} />
          <Field
            label="Duration"
            value={formatDuration(request.requestedFrom, request.requestedUntil)}
          />
        </Section>

        <Section title="Record">
          <Field label="ID" value={request.id} monospace />
          <Field label="Created" value={formatDateTime(request.createdAt)} />
          <Field label="Last updated" value={formatDateTime(request.updatedAt)} />
        </Section>

        <Section title="Actions">
          {nextStatuses.length === 0 ? (
            <Text style={styles.noActions}>
              No status changes are possible from “{STATUS_LABELS[request.status]}”.
            </Text>
          ) : (
            <View style={styles.actions}>
              {nextStatuses.map((target) => (
                <Button
                  key={target}
                  label={TRANSITION_LABELS[target]}
                  variant={isFinalStatus(target) ? 'danger' : 'primary'}
                  loading={updateStatus.isPending && pendingTarget === target}
                  disabled={updateStatus.isPending}
                  style={styles.actionButton}
                  accessibilityHint={
                    isFinalStatus(target) || requiresParkingSpot(target)
                      ? 'Asks for confirmation first'
                      : undefined
                  }
                  onPress={() => {
                    setFeedback(null);
                    // A transition into a final state, or one that needs a
                    // parking spot, goes through the confirmation dialog.
                    // Anything else applies straight away.
                    if (isFinalStatus(target) || requiresParkingSpot(target)) {
                      setPendingTarget(target);
                    } else {
                      setPendingTarget(target);
                      applyTransition(target);
                    }
                  }}
                />
              ))}
            </View>
          )}

          <Button
            label="Delete request"
            variant="secondary"
            style={styles.deleteButton}
            disabled={removeRequest.isPending}
            onPress={() => {
              setFeedback(null);
              setConfirmingDelete(true);
            }}
          />
        </Section>
      </ScrollView>

      <StatusTransitionDialog
        request={request}
        target={
          pendingTarget && (isFinalStatus(pendingTarget) || requiresParkingSpot(pendingTarget))
            ? pendingTarget
            : null
        }
        busy={updateStatus.isPending}
        onCancel={() => setPendingTarget(null)}
        onConfirm={(parkingSpotId) => {
          if (pendingTarget) applyTransition(pendingTarget, parkingSpotId);
        }}
      />

      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this request?"
        message={`${request.driverName} (${request.licensePlate}) will be removed permanently. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={removeRequest.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          removeRequest.mutate(undefined, {
            onSuccess: () => {
              setConfirmingDelete(false);
              router.back();
            },
            onError: (deleteError) => {
              setConfirmingDelete(false);
              setFeedback({ tone: 'error', message: errorMessage(deleteError) });
            },
          });
        }}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, monospace && styles.fieldValueMono]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // No `alignItems: 'center'` here: on a flex column that would shrink the
  // ScrollView to its content width. Centring happens on the content container.
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, width: '100%' },
  contentWide: { maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  statusLabel: { fontSize: 13, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  finalHint: { fontSize: 13, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fieldLabel: { fontSize: 14, color: colors.textMuted },
  fieldValue: { flex: 1, fontSize: 14, color: colors.text, textAlign: 'right' },
  fieldValueMono: { fontSize: 12, fontFamily: 'monospace' },
  actions: { gap: spacing.md, paddingVertical: spacing.md },
  actionButton: { width: '100%' },
  deleteButton: { marginTop: spacing.sm },
  noActions: { fontSize: 14, color: colors.textMuted, paddingVertical: spacing.md },
});
