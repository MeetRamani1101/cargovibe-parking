import { describe, expect, it } from 'vitest';
import type { AssistantResponse, ParkingRequest } from '@cargovibe/shared';

import { ValidationError } from '../../domain/errors';
import { InMemoryParkingRequestRepository } from '../../repositories/inMemoryParkingRequestRepository';
import { ParkingRequestService } from '../parkingRequestService';
import type { AssistantEngine, AssistantEngineInput } from './assistantEngine';
import { AssistantService } from './assistantService';
import { DeterministicAssistantEngine } from './deterministicEngine';
import { parseQuestion } from './queryParser';

/**
 * The assistant is deliberately a pure function of (question, data, now), which
 * is what makes it testable at all. `NOW` is pinned so relative expressions
 * like "tonight" resolve identically on every machine and in CI.
 *
 * Note: time windows are computed in the *local* zone (an operator asking about
 * "tonight" means their tonight), so fixtures are built from the same local
 * helpers rather than hard-coded UTC strings.
 */
const NOW = new Date('2026-09-06T15:00:00.000Z');

function localIso(dayOffset: number, hour: number, minute = 0): string {
  const date = new Date(NOW);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function request(overrides: Partial<ParkingRequest> & Pick<ParkingRequest, 'id'>): ParkingRequest {
  return {
    driverName: 'Test Driver',
    licensePlate: 'XX-00 0000',
    truckType: 'semi',
    requestedFrom: localIso(0, 20),
    requestedUntil: localIso(1, 5),
    status: 'pending',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const fixtures: ParkingRequest[] = [
  request({
    id: 'parking_pending-tonight',
    driverName: 'Ana Kovač',
    licensePlate: 'HH-CV 1234',
    truckType: 'semi',
    status: 'pending',
    requestedFrom: localIso(0, 19, 30),
    requestedUntil: localIso(1, 5, 30),
  }),
  request({
    id: 'parking_approved-tanker',
    driverName: 'Tomasz Nowak',
    licensePlate: 'PL-KR 88214',
    truckType: 'tanker',
    status: 'approved',
    parkingSpotId: 'HAZ-03',
    requestedFrom: localIso(0, 21),
    requestedUntil: localIso(1, 7),
  }),
  request({
    id: 'parking_checked-in-overdue',
    driverName: 'Miguel Santos',
    licensePlate: 'E-4471 KLM',
    truckType: 'solo',
    status: 'checked_in',
    parkingSpotId: 'B-12',
    requestedFrom: localIso(0, 6),
    requestedUntil: localIso(0, 12), // already past at NOW
  }),
  request({
    id: 'parking_long-stay',
    driverName: 'Petr Dvořák',
    licensePlate: 'CZ-3A2 8811',
    truckType: 'tanker',
    status: 'pending',
    requestedFrom: localIso(1, 6),
    requestedUntil: localIso(4, 18), // ~84 hours
  }),
  request({
    id: 'parking_rejected',
    driverName: 'Sofia Rossi',
    licensePlate: 'IT-GE 55231',
    truckType: 'solo',
    status: 'rejected',
    requestedFrom: localIso(2, 9),
    requestedUntil: localIso(2, 17),
  }),
];

const engine = new DeterministicAssistantEngine();

async function ask(question: string): Promise<AssistantResponse> {
  return engine.answer({ question, requests: fixtures, now: NOW });
}

describe('queryParser', () => {
  it('maps the four example questions onto the right intent and filters', async () => {
    expect(parseQuestion('Which requests are still pending?', NOW)).toMatchObject({
      intent: 'list_requests',
      filters: { statuses: ['pending'] },
    });

    expect(parseQuestion('Show me all approved tankers.', NOW)).toMatchObject({
      intent: 'list_requests',
      filters: { statuses: ['approved'], truckTypes: ['tanker'] },
    });

    const tonight = parseQuestion('Which requests are scheduled for tonight?', NOW);
    expect(tonight.intent).toBe('list_requests');
    expect(tonight.filters.overlapping?.label).toContain('tonight');

    expect(parseQuestion('Are there any unusually long parking requests?', NOW)).toMatchObject({
      intent: 'find_unusually_long',
      filters: { unusuallyLong: true },
    });
  });

  it('recognises synonyms rather than only the literal status names', () => {
    expect(parseQuestion('anything still waiting for a decision?', NOW).filters.statuses).toEqual([
      'pending',
    ]);
    expect(parseQuestion('who is on site right now?', NOW).filters.statuses).toEqual(['checked_in']);
  });

  it('reports zero confidence for a question it cannot interpret', () => {
    const parsed = parseQuestion('bananas', NOW);
    expect(parsed.intent).toBe('unknown');
    expect(parsed.confidence).toBe(0);
  });

  it('does not treat "how long" as a duration filter', () => {
    expect(parseQuestion('how long is the tanker staying?', NOW).filters.unusuallyLong).toBeUndefined();
  });
});

describe('DeterministicAssistantEngine', () => {
  it('answers "which requests are still pending?"', async () => {
    const response = await ask('Which requests are still pending?');
    expect(response.matchedRequestIds.sort()).toEqual(['parking_long-stay', 'parking_pending-tonight']);
    expect(response.answer).toContain('2 requests match');
  });

  it('answers "show me all approved tankers"', async () => {
    const response = await ask('Show me all approved tankers.');
    expect(response.matchedRequestIds).toEqual(['parking_approved-tanker']);
  });

  it('answers "which requests are scheduled for tonight?" using overlap, not containment', async () => {
    const response = await ask('Which requests are scheduled for tonight?');
    // Both evening arrivals overlap 18:00-06:00 even though neither is fully inside it.
    expect(response.matchedRequestIds.sort()).toEqual([
      'parking_approved-tanker',
      'parking_pending-tonight',
    ]);
    // The daytime request that ended at noon must not be included.
    expect(response.matchedRequestIds).not.toContain('parking_checked-in-overdue');
  });

  it('answers "are there any unusually long parking requests?"', async () => {
    const response = await ask('Are there any unusually long parking requests?');
    expect(response.intent).toBe('find_unusually_long');
    expect(response.matchedRequestIds).toEqual(['parking_long-stay']);
    expect(response.answer).toContain('84h');
  });

  it('counts instead of listing when asked "how many"', async () => {
    const response = await ask('How many requests are pending?');
    expect(response.intent).toBe('count_requests');
    expect(response.answer).toBe('2 requests match pending.');
  });

  it('finds a request by license plate regardless of spacing and case', async () => {
    const response = await ask('what is the status of hhcv1234?');
    expect(response.matchedRequestIds).toEqual(['parking_pending-tonight']);
  });

  it('says so plainly when nothing matches', async () => {
    const response = await ask('Show me rejected tankers');
    expect(response.matchedRequestIds).toEqual([]);
    expect(response.answer).toMatch(/^No requests match/);
  });

  it('offers help instead of guessing when the question is not understood', async () => {
    const response = await ask('bananas');
    expect(response.intent).toBe('unknown');
    expect(response.confidence).toBe(0);
    expect(response.matchedRequestIds).toEqual([]);
    expect(response.answer).toContain('Try questions like');
  });
});

describe('suggested actions', () => {
  it('suggests checking out the truck whose window has already expired', async () => {
    const response = await ask('What should I do next?');

    expect(response.suggestedAction).toMatchObject({
      type: 'status_update',
      requestId: 'parking_checked-in-overdue',
      targetStatus: 'checked_out',
    });
    expect(response.answer).toContain('nothing has been changed');
  });

  it('never invents a parking spot when suggesting an approval', async () => {
    const onlyPending = fixtures.filter((r) => r.status === 'pending');
    const response = await engine.answer({
      question: 'what needs attention?',
      requests: onlyPending,
      now: NOW,
    });

    expect(response.suggestedAction?.targetStatus).toBe('approved');
    expect(response.suggestedAction?.parkingSpotId).toBeUndefined();
    expect(response.suggestedAction?.reason).toContain('assign a parking spot');
  });

  it('suggests nothing when there is nothing actionable', async () => {
    const response = await engine.answer({
      question: 'what should I do next?',
      requests: fixtures.filter((r) => r.status === 'rejected'),
      now: NOW,
    });

    expect(response.suggestedAction).toBeUndefined();
    expect(response.answer).toContain('Nothing needs a status change');
  });
});

describe('AssistantService safety net', () => {
  function makeService(engineOverride: AssistantEngine) {
    const repository = new InMemoryParkingRequestRepository(fixtures);
    const parkingRequests = new ParkingRequestService(repository);
    return {
      repository,
      service: new AssistantService(parkingRequests, engineOverride, () => NOW, () => {}),
    };
  }

  /** An engine that returns plausible-looking but wrong output. */
  function engineReturning(partial: Partial<AssistantResponse>): AssistantEngine {
    return {
      name: 'llm',
      answer: async (_input: AssistantEngineInput) => ({
        answer: 'here you go',
        intent: 'list_requests',
        filters: {},
        matchedRequestIds: [],
        matches: [],
        confidence: 1,
        engine: 'llm',
        ...partial,
      }),
    };
  }

  it('rejects an empty or missing question before the engine is called', async () => {
    const { service } = makeService(engineReturning({}));

    await expect(service.ask({})).rejects.toBeInstanceOf(ValidationError);
    await expect(service.ask({ question: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.ask({ question: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
  });

  it('drops hallucinated request ids that do not exist in the data', async () => {
    const { service } = makeService(
      engineReturning({ matchedRequestIds: ['parking_pending-tonight', 'parking_invented'] }),
    );

    const response = await service.ask({ question: 'anything pending?' });
    expect(response.matchedRequestIds).toEqual(['parking_pending-tonight']);
    expect(response.matches).toHaveLength(1);
  });

  it('drops a suggested action whose transition the API would refuse', async () => {
    const { service } = makeService(
      engineReturning({
        suggestedAction: {
          type: 'status_update',
          // This request is `rejected`, a final state.
          requestId: 'parking_rejected',
          targetStatus: 'approved',
          reason: 'looks fine to me',
        },
      }),
    );

    const response = await service.ask({ question: 'what should I do?' });
    expect(response.suggestedAction).toBeUndefined();
  });

  it('drops a suggested action pointing at a non-existent request', async () => {
    const { service } = makeService(
      engineReturning({
        suggestedAction: {
          type: 'status_update',
          requestId: 'parking_not-real',
          targetStatus: 'approved',
          reason: 'trust me',
        },
      }),
    );

    expect((await service.ask({ question: 'what next?' })).suggestedAction).toBeUndefined();
  });

  it('degrades gracefully and changes no data when the engine throws', async () => {
    const { repository, service } = makeService({
      name: 'llm',
      answer: async () => {
        throw new Error('model timeout');
      },
    });

    const response = await service.ask({ question: 'anything pending?' });
    expect(response.confidence).toBe(0);
    expect(response.answer).toContain('temporarily unavailable');
    expect(await repository.list()).toHaveLength(fixtures.length);
  });

  it('clamps a nonsensical confidence value', async () => {
    const { service } = makeService(engineReturning({ confidence: 42 }));
    expect((await service.ask({ question: 'anything?' })).confidence).toBe(1);
  });
});
