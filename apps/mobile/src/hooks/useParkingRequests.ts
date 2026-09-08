import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParkingRequest, UpdateParkingRequestStatusInput } from '@cargovibe/shared';

import { ApiError } from '../api/client';
import {
  deleteParkingRequest,
  fetchParkingRequest,
  fetchParkingRequests,
  updateParkingRequestStatus,
} from '../api/parkingRequests';

/**
 * Server state is handled by React Query rather than by hand-written
 * `useState` + `useEffect`.
 *
 * That choice buys the four things this app needs and would otherwise have to
 * reimplement per screen: loading/error/refetch state, a shared cache so the
 * detail screen can render instantly from the list, cache invalidation after a
 * mutation, and de-duplication of concurrent requests.
 */

export const parkingRequestKeys = {
  all: ['parking-requests'] as const,
  list: () => [...parkingRequestKeys.all, 'list'] as const,
  detail: (id: string) => [...parkingRequestKeys.all, 'detail', id] as const,
};

/** Never retry a 4xx - the same request will fail the same way. */
function retryOnlyTransientErrors(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && !error.isRetryable) return false;
  return failureCount < 2;
}

export function useParkingRequests() {
  return useQuery({
    queryKey: parkingRequestKeys.list(),
    queryFn: ({ signal }) => fetchParkingRequests(undefined, signal),
    retry: retryOnlyTransientErrors,
  });
}

export function useParkingRequest(id: string) {
  const queryClient = useQueryClient();

  // Generics are explicit because `placeholderData` returning `ParkingRequest |
  // undefined` otherwise derails React Query's inference of the query type.
  return useQuery<ParkingRequest, Error>({
    queryKey: parkingRequestKeys.detail(id),
    queryFn: ({ signal }) => fetchParkingRequest(id, signal),
    retry: retryOnlyTransientErrors,
    enabled: id.length > 0,
    // Show the row we already have from the list while the fresh copy loads,
    // so opening a request never flashes a spinner.
    placeholderData: () =>
      queryClient
        .getQueryData<ParkingRequest[]>(parkingRequestKeys.list())
        ?.find((request) => request.id === id),
  });
}

export function useUpdateParkingRequestStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateParkingRequestStatusInput) => updateParkingRequestStatus(id, input),
    // Status changes are never retried automatically: a failure here is either
    // a rejected transition or a conflict, and silently retrying a write is the
    // wrong default.
    retry: false,
    onSuccess: (updated) => {
      // Write the authoritative server response straight into the cache, then
      // mark the list stale so it refetches in the background.
      queryClient.setQueryData(parkingRequestKeys.detail(id), updated);
      queryClient.setQueryData<ParkingRequest[]>(parkingRequestKeys.list(), (current) =>
        current?.map((request) => (request.id === id ? updated : request)),
      );
      void queryClient.invalidateQueries({ queryKey: parkingRequestKeys.list() });
    },
    onError: () => {
      // A 409 means our copy is stale; refetch so the UI stops offering an
      // action the server will keep refusing.
      void queryClient.invalidateQueries({ queryKey: parkingRequestKeys.detail(id) });
    },
  });
}

export function useDeleteParkingRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteParkingRequest(id),
    retry: false,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: parkingRequestKeys.detail(id) });
      queryClient.setQueryData<ParkingRequest[]>(parkingRequestKeys.list(), (current) =>
        current?.filter((request) => request.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: parkingRequestKeys.list() });
    },
  });
}
