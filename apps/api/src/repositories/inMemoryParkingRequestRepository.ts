import type { ParkingRequest } from '@cargovibe/shared';
import type {
  ParkingRequestFilter,
  ParkingRequestRepository,
} from './parkingRequestRepository';

/** Structured-clone based copy, so nothing outside the store holds a live reference. */
function clone(request: ParkingRequest): ParkingRequest {
  return { ...request };
}

/**
 * In-memory implementation, sufficient for the case study.
 *
 * Two deliberate details:
 *  - every read and write copies, so a caller mutating a returned object cannot
 *    corrupt the store (a real database would give the same guarantee for free);
 *  - results are sorted by `requestedFrom`, which is the order an operator wants
 *    to see the yard in, and it makes list responses deterministic for tests.
 */
export class InMemoryParkingRequestRepository implements ParkingRequestRepository {
  private readonly store = new Map<string, ParkingRequest>();

  constructor(seed: ParkingRequest[] = []) {
    for (const request of seed) {
      this.store.set(request.id, clone(request));
    }
  }

  async list(filter?: ParkingRequestFilter): Promise<ParkingRequest[]> {
    let results = [...this.store.values()];

    if (filter?.status?.length) {
      const wanted = new Set(filter.status);
      results = results.filter((request) => wanted.has(request.status));
    }
    if (filter?.truckType?.length) {
      const wanted = new Set(filter.truckType);
      results = results.filter((request) => wanted.has(request.truckType));
    }

    results.sort((a, b) => {
      const byStart = Date.parse(a.requestedFrom) - Date.parse(b.requestedFrom);
      return byStart !== 0 ? byStart : a.id.localeCompare(b.id);
    });

    return results.map(clone);
  }

  async findById(id: string): Promise<ParkingRequest | null> {
    const found = this.store.get(id);
    return found ? clone(found) : null;
  }

  async create(request: ParkingRequest): Promise<ParkingRequest> {
    this.store.set(request.id, clone(request));
    return clone(request);
  }

  async update(
    id: string,
    patch: Partial<Omit<ParkingRequest, 'id' | 'createdAt'>>,
  ): Promise<ParkingRequest | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated: ParkingRequest = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt };
    this.store.set(id, updated);
    return clone(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /** Test helper - not part of the repository interface. */
  size(): number {
    return this.store.size;
  }
}
