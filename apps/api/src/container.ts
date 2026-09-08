import { InMemoryParkingRequestRepository } from './repositories/inMemoryParkingRequestRepository';
import type { ParkingRequestRepository } from './repositories/parkingRequestRepository';
import { buildSeedData } from './repositories/seed';
import { ParkingRequestService } from './services/parkingRequestService';
import { DeterministicAssistantEngine } from './services/assistant/deterministicEngine';
import type { AssistantEngine } from './services/assistant/assistantEngine';
import { AssistantService } from './services/assistant/assistantService';

/**
 * Composition root.
 *
 * The only file that decides which concrete implementations are used. Swapping
 * the in-memory repository for a real database, or the deterministic assistant
 * for an LLM-backed one, is a change here and nowhere else.
 */

const seedEnabled = (process.env['SEED_SAMPLE_DATA'] ?? 'true').toLowerCase() !== 'false';

export const parkingRequestRepository: ParkingRequestRepository =
  new InMemoryParkingRequestRepository(seedEnabled ? buildSeedData() : []);

export const parkingRequestService = new ParkingRequestService(parkingRequestRepository);

export const assistantEngine: AssistantEngine = new DeterministicAssistantEngine();

export const assistantService = new AssistantService(parkingRequestService, assistantEngine);
