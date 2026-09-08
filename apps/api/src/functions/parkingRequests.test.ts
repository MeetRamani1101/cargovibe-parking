import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { ApiErrorBody, ListResponse, ParkingRequest } from '@cargovibe/shared';

/**
 * Stand in for the Functions host: `app.http` only records the registration so
 * the module can be imported outside a running host, and the recorded calls
 * double as an assertion that the routes are wired up as documented.
 */
const { registrations } = vi.hoisted(() => ({
  registrations: [] as Array<{ name: string; options: { methods: string[]; route: string } }>,
}));

vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, options: { methods: string[]; route: string }) => {
      registrations.push({ name, options });
    },
  },
}));

/**
 * HTTP-layer tests.
 *
 * These exercise the real exported handlers - route params, query parsing,
 * status codes and the error envelope - without starting a Functions host, so
 * they run in milliseconds and need no Core Tools installed. The functions
 * module is imported dynamically after disabling the seed data, so the tests
 * start from an empty store.
 */

process.env['SEED_SAMPLE_DATA'] = 'false';

type Handlers = typeof import('./parkingRequests');
let handlers: Handlers;

beforeAll(async () => {
  handlers = await import('./parkingRequests');
});

interface RequestInit {
  method?: string;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: unknown;
  /** Simulates a body that is not valid JSON. */
  malformedBody?: boolean;
}

function makeRequest(init: RequestInit = {}): HttpRequest {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(init.query ?? {})) {
    for (const single of Array.isArray(value) ? value : [value]) query.append(key, single);
  }

  return {
    method: init.method ?? 'GET',
    params: init.params ?? {},
    query,
    json: async () => {
      if (init.malformedBody) throw new SyntaxError('Unexpected token');
      return init.body ?? {};
    },
  } as unknown as HttpRequest;
}

const context = {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as InvocationContext;

function bodyOf<T>(response: HttpResponseInit): T {
  return response.jsonBody as T;
}

const validPayload = {
  driverName: 'Ana Kovač',
  licensePlate: 'HH-CV 1234',
  truckType: 'semi',
  requestedFrom: '2026-09-10T18:00:00.000Z',
  requestedUntil: '2026-09-11T06:00:00.000Z',
};

async function createOne(overrides: Record<string, unknown> = {}): Promise<ParkingRequest> {
  const response = await handlers.createParkingRequest(
    makeRequest({ method: 'POST', body: { ...validPayload, ...overrides } }),
    context,
  );
  expect(response.status).toBe(201);
  return bodyOf<ParkingRequest>(response);
}

describe('POST /parking-requests', () => {
  it('returns 201 with the created resource and a Location header', async () => {
    const response = await handlers.createParkingRequest(
      makeRequest({ method: 'POST', body: validPayload }),
      context,
    );

    expect(response.status).toBe(201);
    const created = bodyOf<ParkingRequest>(response);
    expect(created.id).toMatch(/^parking_[0-9a-f-]{36}$/);
    expect((response.headers as Record<string, string>)['Location']).toBe(
      `/api/parking-requests/${created.id}`,
    );
  });

  it('returns 400 with a validation_failed envelope listing the bad fields', async () => {
    const response = await handlers.createParkingRequest(
      makeRequest({ method: 'POST', body: { driverName: 'Ana' } }),
      context,
    );

    expect(response.status).toBe(400);
    const body = bodyOf<ApiErrorBody>(response);
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details?.length).toBeGreaterThan(0);
  });

  it('returns 400 malformed_json when the body is not JSON', async () => {
    const response = await handlers.createParkingRequest(
      makeRequest({ method: 'POST', malformedBody: true }),
      context,
    );

    expect(response.status).toBe(400);
    expect(bodyOf<ApiErrorBody>(response).error.code).toBe('malformed_json');
  });
});

describe('GET /parking-requests', () => {
  it('returns an envelope with items and count, and supports ?status=', async () => {
    const pending = await createOne({ driverName: 'Still Pending' });
    const approved = await createOne({ driverName: 'Gets Approved' });
    await handlers.updateParkingRequestStatus(
      makeRequest({
        method: 'PATCH',
        params: { id: approved.id },
        body: { status: 'approved', parkingSpotId: 'A-01' },
      }),
      context,
    );

    const all = bodyOf<ListResponse<ParkingRequest>>(
      await handlers.listParkingRequests(makeRequest(), context),
    );
    expect(all.count).toBe(all.items.length);
    expect(all.items.map((r) => r.id)).toEqual(expect.arrayContaining([pending.id, approved.id]));

    const filtered = bodyOf<ListResponse<ParkingRequest>>(
      await handlers.listParkingRequests(makeRequest({ query: { status: 'approved' } }), context),
    );
    expect(filtered.items.every((r) => r.status === 'approved')).toBe(true);
    expect(filtered.items.map((r) => r.id)).toContain(approved.id);
    expect(filtered.items.map((r) => r.id)).not.toContain(pending.id);
  });

  it('returns 400 for an unknown status filter instead of silently returning nothing', async () => {
    const response = await handlers.listParkingRequests(
      makeRequest({ query: { status: 'archived' } }),
      context,
    );

    expect(response.status).toBe(400);
    expect(bodyOf<ApiErrorBody>(response).error.details?.[0]?.field).toBe('status');
  });
});

describe('GET /parking-requests/{id}', () => {
  it('returns 404 with a not_found envelope for an unknown id', async () => {
    const response = await handlers.getParkingRequest(
      makeRequest({ params: { id: 'parking_does-not-exist' } }),
      context,
    );

    expect(response.status).toBe(404);
    expect(bodyOf<ApiErrorBody>(response).error.code).toBe('not_found');
  });
});

describe('PATCH /parking-requests/{id}/status', () => {
  it('returns 409 invalid_transition when the transition is not allowed', async () => {
    const created = await createOne();

    const response = await handlers.updateParkingRequestStatus(
      makeRequest({ method: 'PATCH', params: { id: created.id }, body: { status: 'checked_out' } }),
      context,
    );

    expect(response.status).toBe(409);
    expect(bodyOf<ApiErrorBody>(response).error.code).toBe('invalid_transition');
  });
});

describe('DELETE /parking-requests/{id}', () => {
  it('returns 204 and then 404', async () => {
    const created = await createOne();

    const first = await handlers.deleteParkingRequest(
      makeRequest({ method: 'DELETE', params: { id: created.id } }),
      context,
    );
    expect(first.status).toBe(204);
    expect(first.jsonBody).toBeUndefined();

    const second = await handlers.deleteParkingRequest(
      makeRequest({ method: 'DELETE', params: { id: created.id } }),
      context,
    );
    expect(second.status).toBe(404);
  });
});

describe('route registration', () => {
  it('registers the five documented routes with the right methods', () => {
    const summary = registrations
      .map((entry) => `${entry.options.methods.join(',')} ${entry.options.route}`)
      .sort();

    expect(summary).toEqual([
      'DELETE parking-requests/{id}',
      'GET parking-requests',
      'GET parking-requests/{id}',
      'PATCH parking-requests/{id}/status',
      'POST parking-requests',
    ]);

    // No handler may also claim OPTIONS: the Functions host rejects two
    // functions on the same route whose method sets overlap, and preflight is
    // served by the single wildcard function in `cors.ts` instead.
    expect(registrations.some((entry) => entry.options.methods.includes('OPTIONS'))).toBe(false);
  });
});

describe('CORS', () => {
  it('serves preflight from one wildcard OPTIONS function', async () => {
    const cors = await import('./cors');
    const preflight = await cors.corsPreflight();

    expect(preflight.status).toBe(204);
    expect((preflight.headers as Record<string, string>)['Access-Control-Allow-Origin']).toBe('*');
    expect(registrations.find((entry) => entry.name === 'corsPreflight')?.options).toMatchObject({
      methods: ['OPTIONS'],
      route: '{*restOfPath}',
    });
  });

  it('sets CORS headers on ordinary responses too', async () => {
    const real = await handlers.listParkingRequests(makeRequest(), context);
    expect((real.headers as Record<string, string>)['Access-Control-Allow-Origin']).toBe('*');
  });
});
