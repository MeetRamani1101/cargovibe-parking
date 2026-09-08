import type { ParkingRequest, ParkingRequestStatus, TruckType } from '@cargovibe/shared';

export interface ParkingRequestFilter {
  status?: ParkingRequestStatus[];
  truckType?: TruckType[];
}

/**
 * Persistence boundary.
 *
 * Every method is async even though the current implementation is synchronous,
 * so swapping the in-memory store for Cosmos DB / Table Storage / Postgres is a
 * change of one line in `container.ts` and nothing else. The service layer only
 * ever talks to this interface.
 */
export interface ParkingRequestRepository {
  list(filter?: ParkingRequestFilter): Promise<ParkingRequest[]>;
  findById(id: string): Promise<ParkingRequest | null>;
  create(request: ParkingRequest): Promise<ParkingRequest>;
  /** Returns `null` when the id does not exist. */
  update(id: string, patch: Partial<Omit<ParkingRequest, 'id' | 'createdAt'>>): Promise<ParkingRequest | null>;
  /** Returns `false` when the id did not exist. */
  delete(id: string): Promise<boolean>;
}
