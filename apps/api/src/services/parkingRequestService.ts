import {
  allowedTransitionsFrom,
  canTransition,
  requiresParkingSpot,
  validateCreateParkingRequest,
  validateUpdateStatusInput,
  type ParkingRequest,
} from '@cargovibe/shared';

import { InvalidTransitionError, NotFoundError, ValidationError } from '../domain/errors';
import type {
  ParkingRequestFilter,
  ParkingRequestRepository,
} from '../repositories/parkingRequestRepository';

/** Injected so tests get deterministic ids and timestamps. */
export interface ServiceDependencies {
  now: () => Date;
  newId: () => string;
}

const defaultDependencies: ServiceDependencies = {
  now: () => new Date(),
  newId: () => `parking_${randomUuid()}`,
};

function randomUuid(): string {
  // `crypto` is global from Node 19 onwards; the fallback keeps the service
  // usable in any older runtime without pulling in a dependency.
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * All parking-request business rules live here.
 *
 * The HTTP layer above is a thin adapter (parse -> call -> serialise) and the
 * repository below knows nothing about rules, so the state machine has exactly
 * one home and is covered by fast unit tests that never start a Functions host.
 */
export class ParkingRequestService {
  private readonly deps: ServiceDependencies;

  constructor(
    private readonly repository: ParkingRequestRepository,
    deps: Partial<ServiceDependencies> = {},
  ) {
    this.deps = { ...defaultDependencies, ...deps };
  }

  async list(filter?: ParkingRequestFilter): Promise<ParkingRequest[]> {
    return this.repository.list(filter);
  }

  async getById(id: string): Promise<ParkingRequest> {
    const found = await this.repository.findById(id);
    if (!found) throw new NotFoundError(id);
    return found;
  }

  async create(payload: unknown): Promise<ParkingRequest> {
    const validated = validateCreateParkingRequest(payload);
    if (!validated.ok) throw new ValidationError(validated.issues);

    const timestamp = this.deps.now().toISOString();
    const request: ParkingRequest = {
      id: this.deps.newId(),
      driverName: validated.value.driverName,
      licensePlate: validated.value.licensePlate,
      truckType: validated.value.truckType,
      requestedFrom: validated.value.requestedFrom,
      requestedUntil: validated.value.requestedUntil,
      status: validated.value.status ?? 'pending',
      ...(validated.value.parkingSpotId !== undefined
        ? { parkingSpotId: validated.value.parkingSpotId }
        : {}),
      ...(validated.value.note !== undefined ? { note: validated.value.note } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.repository.create(request);
  }

  /**
   * The single write path for status. Order of checks matters and is asserted
   * by tests: existence -> payload shape -> transition legality -> side
   * conditions of the target status. That ordering gives the client the most
   * actionable error rather than the first one we happen to notice.
   */
  async updateStatus(id: string, payload: unknown): Promise<ParkingRequest> {
    const existing = await this.getById(id);

    const validated = validateUpdateStatusInput(payload);
    if (!validated.ok) throw new ValidationError(validated.issues);

    const { status: target, parkingSpotId, note } = validated.value;

    if (!canTransition(existing.status, target)) {
      throw new InvalidTransitionError(existing.status, target, allowedTransitionsFrom(existing.status));
    }

    // A spot has to be known by the time a request is approved. It may come
    // with this call or already be assigned from an earlier one.
    const resolvedSpotId = parkingSpotId ?? existing.parkingSpotId;
    if (requiresParkingSpot(target) && !resolvedSpotId) {
      throw new ValidationError([
        {
          field: 'parkingSpotId',
          message: `parkingSpotId is required when moving a request to '${target}'.`,
        },
      ]);
    }

    const updated = await this.repository.update(id, {
      status: target,
      ...(resolvedSpotId !== undefined ? { parkingSpotId: resolvedSpotId } : {}),
      ...(note !== undefined ? { note } : {}),
      updatedAt: this.deps.now().toISOString(),
    });

    // Only reachable if the row disappeared between the read and the write.
    if (!updated) throw new NotFoundError(id);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new NotFoundError(id);
  }
}
