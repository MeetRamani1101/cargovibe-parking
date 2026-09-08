import type {
  ListResponse,
  ParkingRequest,
  ParkingRequestStatus,
  UpdateParkingRequestStatusInput,
} from '@cargovibe/shared';

import { apiFetch } from './client';

/**
 * One function per API endpoint. These are plain async functions with no React
 * in them, so they can be reused outside of components and tested on their own.
 */

export async function fetchParkingRequests(
  filter?: { status?: ParkingRequestStatus[] },
  signal?: AbortSignal,
): Promise<ParkingRequest[]> {
  const query = filter?.status?.length ? `?status=${filter.status.join(',')}` : '';
  const response = await apiFetch<ListResponse<ParkingRequest>>(`/parking-requests${query}`, {
    ...(signal ? { signal } : {}),
  });
  return response.items;
}

export async function fetchParkingRequest(
  id: string,
  signal?: AbortSignal,
): Promise<ParkingRequest> {
  return apiFetch<ParkingRequest>(`/parking-requests/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  });
}

export async function updateParkingRequestStatus(
  id: string,
  input: UpdateParkingRequestStatusInput,
): Promise<ParkingRequest> {
  return apiFetch<ParkingRequest>(`/parking-requests/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteParkingRequest(id: string): Promise<void> {
  await apiFetch<void>(`/parking-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
