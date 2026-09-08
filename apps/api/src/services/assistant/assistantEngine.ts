import type { AssistantResponse, ParkingRequest } from '@cargovibe/shared';

/**
 * The seam between "understanding the question" and "having the data".
 *
 * An engine is a pure function of (question, snapshot of requests, now) to a
 * structured answer. It gets the data handed to it and has no repository, no
 * network access and no way to write anything - which is what makes the whole
 * feature safe by construction rather than safe by careful prompting.
 *
 * `DeterministicAssistantEngine` is the shipped implementation. An
 * `LlmAssistantEngine` would implement the same interface: send the question
 * plus a compact JSON projection of `requests` to the model, ask for a filter
 * object in a fixed schema, validate that object, and then apply it locally
 * with the same code path used here. See README for the prompt sketch.
 */
export interface AssistantEngine {
  readonly name: 'deterministic' | 'llm';
  answer(input: AssistantEngineInput): Promise<AssistantResponse>;
}

export interface AssistantEngineInput {
  question: string;
  /** Full snapshot the engine may reason over. Read-only by contract. */
  requests: readonly ParkingRequest[];
  now: Date;
}
