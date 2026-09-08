import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import type { ListResponse, ParkingRequest } from '@cargovibe/shared';

import { parkingRequestService } from '../container';
import { parseListFilter, readJsonBody, requirePathParam } from '../http/requests';
import {
  jsonResponse,
  noContentResponse,
  toErrorResponse,
  withHeader,
} from '../http/responses';

/**
 * HTTP adapters.
 *
 * Every handler does the same three things and nothing else: read the request,
 * call the service, serialise the result. All rules live in the service and all
 * error-to-status mapping lives in `toErrorResponse`, so these stay trivial and
 * uniform.
 *
 * Routes (prefix `/api` from host.json):
 *   GET    /parking-requests            list, optional ?status= and ?truckType=
 *   POST   /parking-requests            create
 *   GET    /parking-requests/{id}       read one
 *   PATCH  /parking-requests/{id}/status  status transition
 *   DELETE /parking-requests/{id}       delete
 */

export async function listParkingRequests(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const items = await parkingRequestService.list(parseListFilter(request));
    const body: ListResponse<ParkingRequest> = { items, count: items.length };
    return jsonResponse(200, body);
  } catch (error) {
    return toErrorResponse(error, context);
  }
}

export async function createParkingRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const created = await parkingRequestService.create(await readJsonBody(request));
    // 201 plus a Location header pointing at the canonical URL of the new resource.
    return withHeader(jsonResponse(201, created), 'Location', `/api/parking-requests/${created.id}`);
  } catch (error) {
    return toErrorResponse(error, context);
  }
}

export async function getParkingRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const found = await parkingRequestService.getById(requirePathParam(request, 'id'));
    return jsonResponse(200, found);
  } catch (error) {
    return toErrorResponse(error, context);
  }
}

export async function updateParkingRequestStatus(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const updated = await parkingRequestService.updateStatus(
      requirePathParam(request, 'id'),
      await readJsonBody(request),
    );
    return jsonResponse(200, updated);
  } catch (error) {
    return toErrorResponse(error, context);
  }
}

export async function deleteParkingRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await parkingRequestService.delete(requirePathParam(request, 'id'));
    return noContentResponse();
  } catch (error) {
    return toErrorResponse(error, context);
  }
}

app.http('listParkingRequests', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'parking-requests',
  handler: listParkingRequests,
});

app.http('createParkingRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'parking-requests',
  handler: createParkingRequest,
});

app.http('getParkingRequest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'parking-requests/{id}',
  handler: getParkingRequest,
});

app.http('updateParkingRequestStatus', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'parking-requests/{id}/status',
  handler: updateParkingRequestStatus,
});

app.http('deleteParkingRequest', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'parking-requests/{id}',
  handler: deleteParkingRequest,
});
