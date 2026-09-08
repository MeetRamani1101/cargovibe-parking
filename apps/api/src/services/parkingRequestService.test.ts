import { beforeEach, describe, expect, it } from 'vitest';
import type { ParkingRequest } from '@cargovibe/shared';

import { InvalidTransitionError, NotFoundError, ValidationError } from '../domain/errors';
import { InMemoryParkingRequestRepository } from '../repositories/inMemoryParkingRequestRepository';
import { ParkingRequestService } from './parkingRequestService';

const FIXED_NOW = new Date('2026-09-06T12:00:00.000Z');

const basePayload = {
  driverName: 'Ana Kovač',
  licensePlate: 'HH-CV 1234',
  truckType: 'semi',
  requestedFrom: '2026-09-10T18:00:00.000Z',
  requestedUntil: '2026-09-11T06:00:00.000Z',
};

function makeService(seed: ParkingRequest[] = []) {
  const repository = new InMemoryParkingRequestRepository(seed);
  let counter = 0;
  const service = new ParkingRequestService(repository, {
    now: () => FIXED_NOW,
    newId: () => `parking_test-${++counter}`,
  });
  return { repository, service };
}

describe('ParkingRequestService.create', () => {
  let service: ParkingRequestService;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('creates a pending request with generated id and timestamps', async () => {
    const created = await service.create(basePayload);

    expect(created).toMatchObject({
      id: 'parking_test-1',
      driverName: 'Ana Kovač',
      status: 'pending',
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
    });
    expect(created.parkingSpotId).toBeUndefined();
  });

  it('rejects an invalid payload with a ValidationError listing every problem', async () => {
    const error = await service.create({ driverName: 'Ana' }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.httpStatus).toBe(400);
    expect(error.details.map((issue: { field: string }) => issue.field).sort()).toEqual([
      'licensePlate',
      'requestedFrom',
      'requestedUntil',
      'truckType',
    ]);
  });

  it('rejects a request whose end is not after its start', async () => {
    const error = await service
      .create({ ...basePayload, requestedUntil: '2026-09-10T17:00:00.000Z' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details[0].field).toBe('requestedUntil');
  });
});

describe('ParkingRequestService.updateStatus', () => {
  it('walks the full happy path pending -> approved -> checked_in -> checked_out', async () => {
    const { service } = makeService();
    const created = await service.create(basePayload);

    const approved = await service.updateStatus(created.id, {
      status: 'approved',
      parkingSpotId: 'A-07',
    });
    expect(approved.status).toBe('approved');
    expect(approved.parkingSpotId).toBe('A-07');

    const checkedIn = await service.updateStatus(created.id, { status: 'checked_in' });
    expect(checkedIn.status).toBe('checked_in');
    // The spot assigned at approval survives later transitions.
    expect(checkedIn.parkingSpotId).toBe('A-07');

    const checkedOut = await service.updateStatus(created.id, { status: 'checked_out' });
    expect(checkedOut.status).toBe('checked_out');
  });

  it('requires a parkingSpotId when approving, and reports it as a validation error', async () => {
    const { service } = makeService();
    const created = await service.create(basePayload);

    const error = await service.updateStatus(created.id, { status: 'approved' }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details[0].field).toBe('parkingSpotId');

    // And the request was left untouched.
    expect((await service.getById(created.id)).status).toBe('pending');
  });

  it('rejects skipping a step with a 409 that names the allowed transitions', async () => {
    const { service } = makeService();
    const created = await service.create(basePayload);

    const error = await service.updateStatus(created.id, { status: 'checked_in' }).catch((e) => e);

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect(error.httpStatus).toBe(409);
    expect(error.code).toBe('invalid_transition');
    expect(error.allowed).toEqual(['approved', 'rejected']);
    expect(error.message).toContain('approved, rejected');
  });

  it('refuses any change once a request has reached a final state', async () => {
    const { service } = makeService();
    const created = await service.create(basePayload);
    await service.updateStatus(created.id, { status: 'rejected' });

    for (const status of ['approved', 'pending', 'checked_in', 'checked_out'] as const) {
      const error = await service.updateStatus(created.id, { status }).catch((e) => e);
      expect(error).toBeInstanceOf(InvalidTransitionError);
      expect(error.message).toContain('final status');
    }

    expect((await service.getById(created.id)).status).toBe('rejected');
  });

  it('checks existence before payload validity', async () => {
    const { service } = makeService();
    const error = await service.updateStatus('parking_missing', { status: 'nonsense' }).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.httpStatus).toBe(404);
  });

  it('bumps updatedAt but never createdAt', async () => {
    const repository = new InMemoryParkingRequestRepository();
    let now = new Date('2026-09-06T12:00:00.000Z');
    const service = new ParkingRequestService(repository, {
      now: () => now,
      newId: () => 'parking_fixed',
    });

    const created = await service.create(basePayload);
    now = new Date('2026-09-06T13:30:00.000Z');
    const updated = await service.updateStatus(created.id, { status: 'approved', parkingSpotId: 'A-1' });

    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe('2026-09-06T13:30:00.000Z');
  });
});

describe('ParkingRequestService list / get / delete', () => {
  it('filters by status and sorts by requested start time', async () => {
    const { service } = makeService();
    const later = await service.create(basePayload);
    const earlier = await service.create({
      ...basePayload,
      driverName: 'Early Bird',
      requestedFrom: '2026-09-08T06:00:00.000Z',
      requestedUntil: '2026-09-08T18:00:00.000Z',
    });
    await service.updateStatus(later.id, { status: 'approved', parkingSpotId: 'A-1' });

    const all = await service.list();
    expect(all.map((r) => r.id)).toEqual([earlier.id, later.id]);

    const pending = await service.list({ status: ['pending'] });
    expect(pending.map((r) => r.id)).toEqual([earlier.id]);
  });

  it('does not let a caller mutate the stored request through a returned object', async () => {
    const { service } = makeService();
    const created = await service.create(basePayload);

    const fetched = await service.getById(created.id);
    fetched.status = 'checked_out';
    fetched.driverName = 'Someone Else';

    const refetched = await service.getById(created.id);
    expect(refetched.status).toBe('pending');
    expect(refetched.driverName).toBe('Ana Kovač');
  });

  it('deletes an existing request and 404s on a second attempt', async () => {
    const { service } = makeService();
    const created = await service.create(basePayload);

    await expect(service.delete(created.id)).resolves.toBeUndefined();
    await expect(service.delete(created.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getById(created.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
