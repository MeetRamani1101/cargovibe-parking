import {
  STATUS_LABELS,
  TRANSITION_LABELS,
  isFinalStatus,
  requiresParkingSpot,
  type ParkingRequest,
  type ParkingRequestStatus,
} from '@cargovibe/shared';

import { ConfirmDialog, type ConfirmDialogInput } from './ConfirmDialog';

interface Props {
  request: ParkingRequest;
  /** The transition being confirmed, or `null` when no dialog is open. */
  target: ParkingRequestStatus | null;
  busy: boolean;
  onConfirm: (parkingSpotId?: string) => void;
  onCancel: () => void;
}

/**
 * Decides *how* a given transition has to be confirmed, in one place used by
 * both the detail screen and the assistant.
 *
 * Two rules, both driven by the shared domain package rather than by hard-coded
 * status names in the UI:
 *  - a transition into a final state (`rejected`, `checked_out`) always needs an
 *    explicit confirmation, because it cannot be undone;
 *  - a transition into a state that requires a parking spot also collects one.
 */
export function StatusTransitionDialog({ request, target, busy, onConfirm, onCancel }: Props) {
  if (!target) return null;

  const needsSpot = requiresParkingSpot(target);
  const isFinal = isFinalStatus(target);

  const input: ConfirmDialogInput | undefined = needsSpot
    ? {
        label: 'Parking spot',
        placeholder: 'e.g. A-12',
        ...(request.parkingSpotId ? { initialValue: request.parkingSpotId } : {}),
        validate: (value) =>
          value.length === 0 ? 'A parking spot must be assigned before approving.' : null,
      }
    : undefined;

  return (
    <ConfirmDialog
      visible
      title={`${TRANSITION_LABELS[target]} this request?`}
      message={buildMessage(request, target, isFinal, needsSpot)}
      confirmLabel={TRANSITION_LABELS[target]}
      destructive={isFinal}
      busy={busy}
      {...(input ? { input } : {})}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function buildMessage(
  request: ParkingRequest,
  target: ParkingRequestStatus,
  isFinal: boolean,
  needsSpot: boolean,
): string {
  const subject = `${request.driverName} (${request.licensePlate})`;
  const base = `${subject} will move from “${STATUS_LABELS[request.status]}” to “${STATUS_LABELS[target]}”.`;

  if (isFinal) {
    return `${base}\n\n“${STATUS_LABELS[target]}” is a final status: the request cannot be changed again afterwards.`;
  }
  if (needsSpot) {
    return `${base}\n\nAssign the parking spot the truck should use.`;
  }
  return base;
}
