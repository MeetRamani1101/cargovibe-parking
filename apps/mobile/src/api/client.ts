import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ApiErrorBody, ApiErrorCode, FieldIssue } from '@cargovibe/shared';

/**
 * The single place that knows how to talk HTTP.
 *
 * Everything above it (endpoint modules, hooks, screens) deals in domain types
 * and `ApiError`, never in `fetch`, status codes or JSON parsing.
 */

const DEFAULT_PORT = 7071;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Resolves the API base URL for whichever target the app is running on.
 *
 * `localhost` means something different on every platform, so rather than make
 * the reviewer edit a file, we derive the dev machine's address from the Expo
 * dev server the app was loaded from. That makes a physical phone on the same
 * Wi-Fi work with no configuration at all.
 *
 * Override with `EXPO_PUBLIC_API_BASE_URL` when the API is not on port 7071.
 */
export function resolveApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  if (Platform.OS === 'web') {
    // Served from the same machine as the browser in local development.
    return `http://localhost:${DEFAULT_PORT}/api`;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_PORT}/api`;

  // Android emulators reach the host machine through 10.0.2.2.
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${DEFAULT_PORT}/api`
    : `http://localhost:${DEFAULT_PORT}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * A failed request, normalised. Screens can branch on `code` (for example to
 * tell "this transition is no longer possible" apart from "the server is
 * unreachable") and render `details` next to the offending form fields.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode | 'network_error';
  readonly status: number;
  readonly details: FieldIssue[];

  constructor(
    message: string,
    options: { code: ApiErrorCode | 'network_error'; status: number; details?: FieldIssue[] },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details ?? [];
  }

  /** True when retrying the exact same request might succeed. */
  get isRetryable(): boolean {
    return this.code === 'network_error' || this.status >= 500;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const url = `${API_BASE_URL}${path}`;

  // A hung request should surface as an error the UI can show, not as a
  // spinner that never resolves.
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const abortHandler = () => timeoutController.abort();
  signal?.addEventListener('abort', abortHandler);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: timeoutController.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the Azure Functions host running?`,
      { code: 'network_error', status: 0 },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortHandler);
  }

  if (response.status === 204) return undefined as T;

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const envelope = payload as ApiErrorBody | undefined;
    throw new ApiError(envelope?.error?.message ?? `Request failed with status ${response.status}.`, {
      code: envelope?.error?.code ?? 'internal_error',
      status: response.status,
      ...(envelope?.error?.details ? { details: envelope.error.details } : {}),
    });
  }

  return payload as T;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // A non-JSON body from a proxy or a crashed host - still report usefully.
    throw new ApiError('The API returned a response that was not valid JSON.', {
      code: 'internal_error',
      status: response.status,
    });
  }
}
