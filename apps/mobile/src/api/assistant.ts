import type { AssistantResponse } from '@cargovibe/shared';

import { apiFetch } from './client';

/**
 * The assistant endpoint is read-only. If the answer includes a
 * `suggestedAction`, applying it goes through the ordinary status endpoint
 * after the operator confirms - there is no "apply" call here on purpose.
 */
export async function askAssistant(question: string): Promise<AssistantResponse> {
  return apiFetch<AssistantResponse>('/assistant/query', {
    method: 'POST',
    body: { question },
  });
}
