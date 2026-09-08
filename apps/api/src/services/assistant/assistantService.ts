import {
  PARKING_REQUEST_STATUSES,
  canTransition,
  type AssistantResponse,
  type FieldIssue,
  type ParkingRequest,
} from '@cargovibe/shared';

import { ValidationError } from '../../domain/errors';
import type { ParkingRequestService } from '../parkingRequestService';
import type { AssistantEngine } from './assistantEngine';

const MAX_QUESTION_LENGTH = 500;

/**
 * Wraps an `AssistantEngine` with the parts that must hold no matter which
 * engine is plugged in:
 *
 *  - the question is validated before it reaches the engine;
 *  - the engine is handed a snapshot and has no repository access, so this
 *    endpoint physically cannot write;
 *  - whatever the engine returns is re-validated against the real data before
 *    it is sent to the client. A hallucinated request id or an illegal
 *    suggested transition is dropped here rather than shown to the operator.
 *
 * That last step is what makes swapping in a real LLM a low-risk change.
 */
export class AssistantService {
  constructor(
    private readonly parkingRequests: ParkingRequestService,
    private readonly engine: AssistantEngine,
    private readonly now: () => Date = () => new Date(),
    private readonly logError: (message: string, error: unknown) => void = (message, error) =>
      console.error(message, error),
  ) {}

  async ask(payload: unknown): Promise<AssistantResponse> {
    const question = this.validateQuestion(payload);
    const requests = await this.parkingRequests.list();
    const now = this.now();

    let response: AssistantResponse;
    try {
      response = await this.engine.answer({ question, requests, now });
    } catch (error) {
      // A misbehaving engine (a network failure or malformed model output)
      // degrades to an honest answer instead of a 500.
      this.logError('Assistant engine failed', error);
      return {
        answer:
          'The assistant is temporarily unavailable, so I could not answer that. The parking data itself is unaffected.',
        intent: 'unknown',
        filters: {},
        matchedRequestIds: [],
        matches: [],
        confidence: 0,
        engine: this.engine.name,
      };
    }

    return this.sanitise(response, requests);
  }

  private validateQuestion(payload: unknown): string {
    const issues: FieldIssue[] = [];
    const raw =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)['question']
        : undefined;

    if (typeof raw !== 'string' || raw.trim().length === 0) {
      issues.push({ field: 'question', message: 'question is required and must be a non-empty string.' });
    } else if (raw.length > MAX_QUESTION_LENGTH) {
      issues.push({
        field: 'question',
        message: `question must be at most ${MAX_QUESTION_LENGTH} characters.`,
      });
    }

    if (issues.length > 0) throw new ValidationError(issues);
    return (raw as string).trim();
  }

  /**
   * Drops anything the engine returned that is not backed by real data.
   * Deliberately silent-but-safe: an invalid suggestion is removed rather than
   * turned into an error, so a partially-good answer is still useful.
   */
  private sanitise(
    response: AssistantResponse,
    requests: readonly ParkingRequest[],
  ): AssistantResponse {
    const byId = new Map(requests.map((request) => [request.id, request]));

    const matches = response.matchedRequestIds
      .map((id) => byId.get(id))
      .filter((request): request is NonNullable<typeof request> => request !== undefined);

    const sanitised: AssistantResponse = {
      ...response,
      matches,
      matchedRequestIds: matches.map((request) => request.id),
      confidence: clamp01(response.confidence),
      answer: String(response.answer ?? '').slice(0, 4000),
    };

    const suggestion = response.suggestedAction;
    if (!suggestion) {
      delete sanitised.suggestedAction;
      return sanitised;
    }

    const target = byId.get(suggestion.requestId);
    const statusIsKnown = (PARKING_REQUEST_STATUSES as readonly string[]).includes(
      suggestion.targetStatus,
    );

    // Only keep a suggestion that points at a real request and describes a
    // transition the API would actually accept.
    if (!target || !statusIsKnown || !canTransition(target.status, suggestion.targetStatus)) {
      delete sanitised.suggestedAction;
      return sanitised;
    }

    sanitised.suggestedAction = {
      type: 'status_update',
      requestId: suggestion.requestId,
      targetStatus: suggestion.targetStatus,
      ...(suggestion.parkingSpotId ? { parkingSpotId: suggestion.parkingSpotId } : {}),
      reason: String(suggestion.reason ?? '').slice(0, 500),
    };
    return sanitised;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
