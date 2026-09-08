import type { ParkingRequest } from '@cargovibe/shared';

/**
 * Sample data for local development.
 *
 * Timestamps are generated relative to "now" rather than hard-coded, so that
 * assistant queries like "which requests are scheduled for tonight?" stay
 * meaningful whenever the API is started.
 */
export function buildSeedData(now: Date = new Date()): ParkingRequest[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const at = (dayOffset: number, hour: number, minute = 0): string => {
    const date = new Date(startOfToday);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  const createdAt = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  const rows: Array<Omit<ParkingRequest, 'createdAt' | 'updatedAt'>> = [
    {
      id: 'parking_9f1c1d1e-1f4a-4c2b-8a7d-1b2c3d4e5f60',
      driverName: 'Ana Kovač',
      licensePlate: 'HH-CV 1234',
      truckType: 'semi',
      requestedFrom: at(0, 19, 30),
      requestedUntil: at(1, 5, 30),
      status: 'pending',
      note: 'Refrigerated trailer, needs a power hookup.',
    },
    {
      id: 'parking_2b8e4a77-9c31-4d0f-9a55-6e7f8a9b0c1d',
      driverName: 'Tomasz Nowak',
      licensePlate: 'PL-KR 88214',
      truckType: 'tanker',
      requestedFrom: at(0, 21, 0),
      requestedUntil: at(1, 7, 0),
      status: 'approved',
      parkingSpotId: 'HAZ-03',
      note: 'ADR class 3, hazardous goods bay required.',
    },
    {
      id: 'parking_5d3f6b02-7ab4-4f8e-bb31-2c4d6e8f0a12',
      driverName: 'Miguel Santos',
      licensePlate: 'E-4471 KLM',
      truckType: 'solo',
      requestedFrom: at(0, 8, 0),
      requestedUntil: at(0, 16, 0),
      status: 'checked_in',
      parkingSpotId: 'B-12',
    },
    {
      id: 'parking_7c0a1e44-3d5b-4c9a-8f21-9b0c1d2e3f45',
      driverName: 'Lena Fischer',
      licensePlate: 'M-LF 9090',
      truckType: 'semi',
      requestedFrom: at(-1, 18, 0),
      requestedUntil: at(0, 6, 0),
      status: 'checked_out',
      parkingSpotId: 'A-04',
    },
    {
      id: 'parking_1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9',
      driverName: 'Petr Dvořák',
      licensePlate: 'CZ-3A2 8811',
      truckType: 'tanker',
      requestedFrom: at(1, 6, 0),
      // Deliberately long: exercises the "unusually long request" assistant query.
      requestedUntil: at(4, 18, 0),
      status: 'pending',
      note: 'Waiting for a customs slot, may need to stay several days.',
    },
    {
      id: 'parking_8e7d6c5b-4a39-4281-b170-0f1e2d3c4b5a',
      driverName: 'Sofia Rossi',
      licensePlate: 'IT-GE 55231',
      truckType: 'solo',
      requestedFrom: at(2, 9, 0),
      requestedUntil: at(2, 17, 30),
      status: 'rejected',
      note: 'Yard fully booked for that slot.',
    },
  ];

  return rows.map((row) => ({ ...row, createdAt, updatedAt: createdAt }));
}
