import { describe, expect, it } from 'vitest';
import { validateCreateParkingRequest, validateUpdateStatusInput } from './validation';
import { allowedTransitionsFrom, canTransition, isFinalStatus } from './status';

const validPayload = {
  driverName: 'Ana Kovač',
  licensePlate: 'HH-CV 1234',
  truckType: 'semi',
  requestedFrom: '2026-09-10T18:00:00.000Z',
  requestedUntil: '2026-09-11T06:00:00.000Z',
};

describe('validateCreateParkingRequest', () => {
  it('accepts a valid payload and normalises dates to UTC ISO strings', () => {
    const result = validateCreateParkingRequest({
      ...validPayload,
      requestedFrom: '2026-09-10T20:00:00+02:00',
      driverName: '  Ana Kovač  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.requestedFrom).toBe('2026-09-10T18:00:00.000Z');
    expect(result.value.driverName).toBe('Ana Kovač');
    expect(result.value.status).toBeUndefined();
  });

  it('reports every missing required field at once rather than failing fast', () => {
    const result = validateCreateParkingRequest({});
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const fields = result.issues.map((i) => i.field).sort();
    expect(fields).toEqual([
      'driverName',
      'licensePlate',
      'requestedFrom',
      'requestedUntil',
      'truckType',
    ]);
  });

  it('rejects requestedUntil that is not later than requestedFrom', () => {
    const equal = validateCreateParkingRequest({
      ...validPayload,
      requestedUntil: validPayload.requestedFrom,
    });
    expect(equal.ok).toBe(false);
    if (equal.ok) return;
    expect(equal.issues).toContainEqual({
      field: 'requestedUntil',
      message: 'requestedUntil must be later than requestedFrom.',
    });
  });

  it('rejects an unknown truckType', () => {
    const result = validateCreateParkingRequest({ ...validPayload, truckType: 'spaceship' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.field).toBe('truckType');
  });

  it('rejects date-like strings that are not ISO 8601', () => {
    const result = validateCreateParkingRequest({ ...validPayload, requestedFrom: '10/09/2026' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toMatch(/ISO 8601/);
  });

  it('requires a parkingSpotId when a request is created as approved', () => {
    const withoutSpot = validateCreateParkingRequest({ ...validPayload, status: 'approved' });
    expect(withoutSpot.ok).toBe(false);
    if (withoutSpot.ok) return;
    expect(withoutSpot.issues[0]?.field).toBe('parkingSpotId');

    const withSpot = validateCreateParkingRequest({
      ...validPayload,
      status: 'approved',
      parkingSpotId: 'A-12',
    });
    expect(withSpot.ok).toBe(true);
  });

  it('does not allow a request to be created directly in a final state', () => {
    const result = validateCreateParkingRequest({ ...validPayload, status: 'checked_out' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.field).toBe('status');
  });

  it('rejects a non-object body', () => {
    for (const body of ['a string', 42, null, ['a'], undefined]) {
      const result = validateCreateParkingRequest(body);
      expect(result.ok).toBe(false);
    }
  });
});

describe('validateUpdateStatusInput', () => {
  it('accepts a known status', () => {
    const result = validateUpdateStatusInput({ status: 'approved', parkingSpotId: 'A-01' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ status: 'approved', parkingSpotId: 'A-01' });
  });

  it('rejects an unknown status', () => {
    const result = validateUpdateStatusInput({ status: 'in_progress' });
    expect(result.ok).toBe(false);
  });

  it('treats an empty parkingSpotId as not provided', () => {
    const result = validateUpdateStatusInput({ status: 'checked_in', parkingSpotId: '   ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parkingSpotId).toBeUndefined();
  });
});

describe('status state machine', () => {
  it('encodes exactly the four specified transitions', () => {
    expect(allowedTransitionsFrom('pending')).toEqual(['approved', 'rejected']);
    expect(allowedTransitionsFrom('approved')).toEqual(['checked_in']);
    expect(allowedTransitionsFrom('checked_in')).toEqual(['checked_out']);
  });

  it('offers no transitions out of a final state', () => {
    expect(allowedTransitionsFrom('rejected')).toEqual([]);
    expect(allowedTransitionsFrom('checked_out')).toEqual([]);
    expect(isFinalStatus('rejected')).toBe(true);
    expect(isFinalStatus('checked_out')).toBe(true);
    expect(isFinalStatus('pending')).toBe(false);
  });

  it('rejects skipping a step and moving backwards', () => {
    expect(canTransition('pending', 'checked_in')).toBe(false);
    expect(canTransition('approved', 'pending')).toBe(false);
    expect(canTransition('checked_out', 'checked_in')).toBe(false);
    expect(canTransition('approved', 'approved')).toBe(false);
  });
});
