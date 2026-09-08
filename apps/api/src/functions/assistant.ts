import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

import { assistantService } from '../container';
import { readJsonBody } from '../http/requests';
import { jsonResponse, toErrorResponse } from '../http/responses';

/**
 * POST /api/assistant/query  { "question": "..." }
 *
 * Read-only by construction: this handler can only reach `AssistantService`,
 * which can only read parking requests. There is no code path from here to a
 * write, so no prompt and no model output can change data. When the assistant
 * proposes a status change it comes back as `suggestedAction`, and the client
 * has to call `PATCH /parking-requests/{id}/status` itself after the operator
 * confirms - which re-runs the full validation and state-machine checks.
 */
export async function askAssistant(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const response = await assistantService.ask(await readJsonBody(request));
    return jsonResponse(200, response);
  } catch (error) {
    return toErrorResponse(error, context);
  }
}

app.http('askAssistant', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'assistant/query',
  handler: askAssistant,
});
