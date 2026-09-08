# Cargovibe — Truck Parking Requests

A small full-stack prototype for managing truck parking requests: an **Azure Functions API**
(TypeScript) and an **Expo app** (TypeScript, web + native) in one npm-workspaces monorepo,
sharing a domain package.

---

## Contents

- [Quick start](#quick-start)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Status transitions & validation](#status-transitions--validation)
- [Mobile app](#mobile-app)
- [AI extension — parking assistant](#ai-extension--parking-assistant)
- [Tests](#tests)
- [Assumptions and trade-offs](#assumptions-and-trade-offs)
- [What is missing and what I would do next](#what-is-missing-and-what-i-would-do-next)
- [Use of AI-assisted development tools](#use-of-ai-assisted-development-tools)

---

## Quick start

### Prerequisites

- **Node.js 20+** (developed on 24)
- **Azure Functions Core Tools v4**, needed only to run the API locally:

  ```bash
  npm install -g azure-functions-core-tools@4 --unsafe-perm true
  ```

### Install

```bash
npm install
```

### Run the API (terminal 1)

```bash
npm run api
```

Starts on <http://localhost:7071/api>, seeded with six sample requests.
(`npm run api` compiles `packages/shared` and `apps/api` first via a `prestart` hook.)

### Run the app (terminal 2)

```bash
npm run mobile
```

Then press `w` for web, `a` for an Android emulator, or scan the QR code with Expo Go.
To go straight to the browser:

```bash
npm run mobile:web
```

### Run the tests

```bash
npm test
```

### Pointing the app at the API

The app resolves the API address automatically and needs no configuration in the normal case:

| Target | Resolved base URL |
| --- | --- |
| Web browser | `http://localhost:7071/api` |
| iOS simulator / Android emulator / physical device via Expo Go | `http://<dev-machine-ip>:7071/api`, taken from the Expo dev server's `hostUri` |
| Fallback on Android with no `hostUri` | `http://10.0.2.2:7071/api` |

Override with an environment variable when needed:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:7071/api npm run mobile
```

> **Testing on a physical device or an emulator needs one extra step.** `func start` binds to
> `127.0.0.1` only, so nothing outside the dev machine can reach it — the connection is refused
> before a firewall is even consulted. Start the API with:
>
> ```bash
> npm run api:lan
> ```
>
> which passes `--address 0.0.0.0` so the host listens on all interfaces. The phone must also be
> on the same network, and the host firewall must allow inbound TCP on port 7071.
> Plain `npm run api` is fine for the web target and for the tests.

---

## Repository layout

```
/apps
  /api          Azure Functions v4 (Node programming model), TypeScript
  /mobile       Expo app with expo-router, TypeScript
/packages
  /shared       Domain types, status state machine, validation
```

I kept the suggested structure. The one decision worth calling out is that **`packages/shared`
is not just types** — it also contains the status state machine and the validation rules. Those
are exactly the pieces of logic that would otherwise be duplicated and drift: the API must
enforce them, and the UI must know them to decide which buttons to render. Putting them in one
place means the detail screen's action buttons are *derived from the same map* the API validates
against, so the two cannot disagree.

`packages/shared` is compiled to CommonJS (`dist/`) and consumed by both apps. Both app `start`
scripts build it first, so there is no ordering trap.

---

## Architecture

### Backend layers

```
HTTP handlers (src/functions/*)     parse request → call service → serialise response
        │                            no business rules, no error mapping of their own
        ▼
Services (src/services/*)           all business rules; throws typed domain errors
        │
        ▼
Repository interface (src/repositories/parkingRequestRepository.ts)
        │
        ▼
InMemoryParkingRequestRepository    the only implementation today
```

`src/container.ts` is the composition root and the only file that knows which concrete
implementations are in use. Replacing the in-memory store with Cosmos DB, or the deterministic
assistant with an LLM-backed one, is a change there and nowhere else.

**One backend decision worth highlighting: domain errors carry their own HTTP status.**

```ts
export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly httpStatus: number;
}
```

Every handler is therefore identical — `try { … } catch (error) { return toErrorResponse(error, context) }` —
and `toErrorResponse` is the single place that turns an error into a response. Adding a new rule
means adding a `DomainError` subclass; no handler changes, and no handler can forget to map an
error. Anything that is *not* a `DomainError` is a bug, so it is logged in full and returned as a
generic 500 — internal messages and stack traces never reach the client.

### Frontend layers

```
app/*                    screens (expo-router file-based routes)
src/components/*         presentational, no data fetching
src/hooks/*              React Query queries and mutations (server state)
src/api/*                one function per endpoint, no React
src/api/client.ts        the only place that knows about fetch, status codes and JSON
```

---

## API reference

Base URL `http://localhost:7071/api`. All routes are `authLevel: anonymous` (authentication is
out of scope).

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/parking-requests` | List; optional `?status=` and `?truckType=` |
| `POST` | `/parking-requests` | Create |
| `GET` | `/parking-requests/{id}` | Read one |
| `PATCH` | `/parking-requests/{id}/status` | Change status |
| `DELETE` | `/parking-requests/{id}` | Delete |
| `POST` | `/assistant/query` | Ask the parking assistant (read-only) |
| `OPTIONS` | `/{*restOfPath}` | CORS preflight |

### Response conventions

- **Single resource** → the object itself.
- **List** → `{ "items": [...], "count": n }`. An envelope rather than a bare array, so
  pagination or aggregate counts can be added later without a breaking change.
- **Create** → `201` with a `Location` header.
- **Delete** → `204` with no body.
- **Errors** → always the same envelope:

  ```json
  {
    "error": {
      "code": "validation_failed",
      "message": "The request payload is invalid.",
      "details": [{ "field": "requestedUntil", "message": "requestedUntil must be later than requestedFrom." }]
    }
  }
  ```

### Status codes

| Code | When |
| --- | --- |
| `400 validation_failed` | Field missing/malformed, or a rule such as `requestedUntil > requestedFrom` broken |
| `400 malformed_json` | Body is not parseable JSON |
| `404 not_found` | No request with that id |
| `409 invalid_transition` | Payload is fine, but the transition is illegal from the current status |
| `500 internal_error` | Unexpected failure |

**Why `409` and not `400` for an illegal transition.** The client sent a well-formed, legitimate
request; it simply is not applicable to the resource's *current state*. The fix is to re-read the
resource, not to correct the payload — which is what a conflict means. The frontend acts on that
distinction: on a `409` it invalidates its cached copy so the UI stops offering an action the
server will keep refusing.

### Examples

```bash
# List
curl http://localhost:7071/api/parking-requests

# Filter (comma-separated or repeated params)
curl "http://localhost:7071/api/parking-requests?status=pending,approved&truckType=tanker"

# Create
curl -X POST http://localhost:7071/api/parking-requests \
  -H 'Content-Type: application/json' \
  -d '{"driverName":"Ana Kovač","licensePlate":"HH-CV 1234","truckType":"semi",
       "requestedFrom":"2026-09-20T18:00:00Z","requestedUntil":"2026-09-21T06:00:00Z"}'

# Approve (requires a parking spot)
curl -X PATCH http://localhost:7071/api/parking-requests/<id>/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved","parkingSpotId":"A-12"}'

# Ask the assistant
curl -X POST http://localhost:7071/api/assistant/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"Which requests are scheduled for tonight?"}'
```

An unknown `?status=` value is a `400`, not a silently empty list, so a typo in a client surfaces
immediately.

---

## Status transitions & validation

The state machine lives in [`packages/shared/src/status.ts`](packages/shared/src/status.ts):

```ts
export const STATUS_TRANSITIONS = Object.freeze({
  pending:     ['approved', 'rejected'],
  approved:    ['checked_in'],
  checked_in:  ['checked_out'],
  rejected:    [],   // final
  checked_out: [],   // final
});
```

`ParkingRequestService.updateStatus` runs the checks in a deliberate order, asserted by tests:

1. **Does the request exist?** → `404`
2. **Is the payload well-formed?** → `400`
3. **Is the transition legal?** → `409`, with the allowed targets named in the message
4. **Are the target status's side conditions met?** (`approved` needs a `parkingSpotId`, either
   supplied now or already assigned) → `400`

That order gives the client the most actionable error rather than the first one we happen to
notice.

Other validation rules:

- all of `driverName`, `licensePlate`, `truckType`, `requestedFrom`, `requestedUntil` required on
  create — **all** violations are reported at once, not just the first;
- `requestedUntil` must be strictly later than `requestedFrom`;
- dates must look like ISO 8601 and are normalised to UTC (so `2026-09-10T20:00+02:00` is stored
  as `2026-09-10T18:00:00.000Z`), which stops `new Date('truck')`-style coercions;
- strings are trimmed and length-bounded; empty/whitespace-only optional fields are treated as
  absent;
- a request may be created as `pending` or `approved` only — every other state has to be reached
  through the state machine.

The client uses the same map to render buttons, but **never** to decide whether a change is
allowed. The API re-validates everything; the shared map is a UX affordance, not a security
boundary.

---

## Mobile app

Two screens plus the assistant, using `expo-router`:

| Route | Screen |
| --- | --- |
| `/` | Request list |
| `/request/[id]` | Request detail |
| `/assistant` | Parking assistant |

**Screen 1 — list.** All requests, sorted by requested start time, showing driver, plate, truck
type, window, duration, assigned spot and status. Pull-to-refresh, client-side status filter
chips with counts, and distinct loading / empty / error states.

**Screen 2 — detail.** Every field of a `ParkingRequest` **except `note`** (as specified), the
current status shown prominently, and only the status actions the state machine currently allows.
Delete is available too, so all five endpoints are exercised from the UI.

**One frontend decision worth highlighting: React Query for server state.**

There is no global store. Server data is owned by React Query and local UI state (which dialog is
open, which banner is showing) stays in `useState` in the screen that owns it. That split gives
four things this app would otherwise hand-roll on every screen:

- loading / error / refetching flags;
- a shared cache, so opening a request renders instantly from the list via `placeholderData`
  instead of flashing a spinner;
- cache invalidation after a mutation — the mutation writes the authoritative server response
  into both the detail and list caches, then marks the list stale;
- sane retry policy: `4xx` is never retried (the same request will fail identically), and status
  writes are never retried automatically, because silently repeating a write is the wrong default.

**Confirmation flow.** `Alert.alert` is a no-op on react-native-web, so confirmations use a
`Modal`-based `ConfirmDialog` that behaves identically on web and native. `StatusTransitionDialog`
decides *how* each transition is confirmed, driven by the shared package rather than by hard-coded
status names:

- a transition into a **final** state (`isFinalStatus`) always requires explicit confirmation and
  is styled destructively, with the irreversibility spelled out;
- a transition into a state that **requires a parking spot** (`requiresParkingSpot`) also collects
  one, with client-side validation matching the server's rule;
- anything else (`checked_in`) applies immediately.

Both the detail screen and the assistant reuse that one component, so a confirmation cannot be
implemented two different ways.

**Responsiveness.** A single `useWindowDimensions` breakpoint at 720px: one column on a phone,
a two-column grid inside a centred, width-capped container on tablet and desktop browsers.
Verified in a browser at desktop and 375×812 mobile viewports.

---

## AI extension — parking assistant

`POST /api/assistant/query` with `{ "question": "..." }`.

Supports questions such as *"Which requests are still pending?"*, *"Show me all approved
tankers."*, *"Which requests are scheduled for tonight?"*, *"Are there any unusually long parking
requests?"* and *"What should I do next?"*.

### How it accesses parking-request data

It does not query anything itself. `AssistantService` loads the requests through the normal
`ParkingRequestService` and hands the engine an immutable snapshot:

```ts
export interface AssistantEngine {
  readonly name: 'deterministic' | 'llm';
  answer(input: { question: string; requests: readonly ParkingRequest[]; now: Date }): Promise<AssistantResponse>;
}
```

The engine has no repository, no network access and no write path. `now` is injected rather than
read from the clock, so relative expressions like "tonight" are reproducible in tests.

### How the query logic is structured

Parsing and execution are separate on purpose:

1. **Parse** (`queryParser.ts`) — maps the question onto a structured `AssistantFilters` object:
   statuses (including synonyms — "waiting", "on site", "departed"), truck types, a time window
   ("tonight" = 18:00–06:00, "today", "tomorrow", "this weekend", "this week", "right now"), a
   free-text driver/plate search, and a duration flag.
2. **Execute** (`applyFilters`) — applies that filter object to the snapshot. Time matching is
   *overlap*, not containment, so a truck arriving 22:00 and leaving 07:00 counts as "here
   tonight"; endpoint comparison is strict, so a truck arriving exactly at 06:00 is not part of
   the night that ends at 06:00.

This split is the point of the design. **An LLM engine would replace step 1 only.** It would send
the question plus a compact JSON projection of the requests, ask for an `AssistantFilters` object
in a fixed schema, validate that object, and then run the *same* `applyFilters` — so the model
never decides which records come back, only how the question maps onto a validated filter.

I chose a deterministic engine over calling a hosted model because it needs no API key to review,
is instant, costs nothing, and is fully unit-testable. The interesting part of this exercise is
the *shape* of a safe AI integration, not the cleverness of the parser — and that shape is the
`AssistantEngine` seam plus the read-only, suggestion-only contract.

### How invalid or unexpected responses are handled

`AssistantService.sanitise` re-validates everything the engine returns against the real data
before it reaches the client. This layer exists precisely so that swapping in a real LLM is a
low-risk change:

- hallucinated request ids are **dropped**, and `matches` is rebuilt from the store rather than
  trusted from the engine;
- a `suggestedAction` pointing at a non-existent request is dropped;
- a `suggestedAction` describing a transition the API would refuse (`canTransition`) is dropped;
- `confidence` is clamped to `[0, 1]` and `answer` is length-capped;
- if the engine **throws** (a model timeout, malformed output), the service logs it and degrades
  to an honest "temporarily unavailable" answer rather than a 500 — and no data is touched.

Invalid input is rejected before the engine runs: a missing, empty or over-long `question` is a
`400 validation_failed`.

### How unintended changes are prevented

Four independent layers, so no single mistake is enough:

1. **No write path exists.** The endpoint reaches only `AssistantService`, which reaches only a
   read. There is no code from the assistant to a mutation for a prompt to exploit.
2. **Suggestions are data, not commands.** A `suggestedAction` is a proposal; the API never acts
   on it.
3. **The client must confirm.** The suggestion is rendered as a card that requires an explicit
   press, which opens the same confirmation dialog the detail screen uses. Applying it calls the
   ordinary `PATCH …/status` endpoint.
4. **That endpoint re-validates.** Full validation and state-machine checks run again, so even a
   suggestion that slipped through sanitising cannot produce an illegal state.

The engine also refuses to invent data: when it suggests approving a request it deliberately
leaves `parkingSpotId` empty and says the operator must assign one, rather than fabricating a spot
number.

### How it is tested

21 tests in [`apps/api/src/services/assistant/assistant.test.ts`](apps/api/src/services/assistant/assistant.test.ts),
against a pinned `now` so relative time expressions are deterministic:

- the four example questions map to the right intent and filters;
- synonyms are recognised; `"how long is…"` is *not* mistaken for a duration filter;
- overlap-not-containment for "tonight", including the boundary case;
- an uninterpretable question returns `intent: 'unknown'`, confidence 0 and offers help rather
  than guessing;
- the suggestion priority order, and that approvals never invent a spot;
- the sanitising layer, driven by a **stub engine that deliberately misbehaves** — returning
  hallucinated ids, illegal transitions, out-of-range confidence, or throwing. That stub is
  exactly how an LLM engine would be tested: the seam is an interface, so no network is involved.

---

## Tests

`npm test` — **58 tests**, all offline, no Functions host required (~1s).

| Suite | Covers |
| --- | --- |
| `packages/shared` (14) | Validation rules, cross-field rules, date normalisation, the state-machine map |
| `apps/api` service (12) | Full happy path, spot-required-on-approve, illegal transitions, final states, check ordering, `updatedAt` vs `createdAt`, store isolation |
| `apps/api` HTTP (11) | Real handlers: status codes, error envelopes, `Location` header, query-param parsing, route registration, CORS |
| `apps/api` assistant (21) | Parsing, filtering, suggestions, and the sanitising safety net |

The HTTP tests mock `@azure/functions`' `app.http` so the module can be imported outside a running
host; the recorded registrations double as an assertion that the routes are wired up as
documented. Handlers are typed against a narrowed `ReadableHttpRequest` interface (with a
compile-time check that the real `HttpRequest` satisfies it), so tests pass plain objects instead
of constructing framework types.

Beyond unit tests, every endpoint and every UI flow described here was exercised against the
running Functions host and in a browser.

---

## Assumptions and trade-offs

**Assumptions**

- No authentication, no deployment, no cloud infrastructure (explicitly out of scope). All routes
  are anonymous.
- A single operator. There is no optimistic-concurrency token; last write wins. The `409` on an
  illegal transition plus cache invalidation covers the realistic conflict.
- Parking spots are free-text identifiers. There is no spot inventory, so the API cannot check
  that a spot exists or is unoccupied.
- Timestamps are stored in UTC and rendered in the device's locale and time zone.
- I added `createdAt` / `updatedAt`, which are not in the specified model. They are cheap to
  maintain and genuinely useful for sorting and auditing.

**Trade-offs**

- **`note` is deliberately not shown on the detail screen.** The brief says "all fields … except
  the `note` field", so I followed it exactly. In a real product I would ask about this — an
  operator note such as *"ADR class 3, hazardous goods bay required"* is operationally relevant
  and is probably the field you most want visible when approving.
- **Hand-rolled validation instead of Zod.** Keeps `packages/shared` dependency-free, which
  matters when it is bundled by Metro as well as run in Node. The rule set is small. With a larger
  schema I would switch to Zod and derive the types from it.
- **CORS is handled in application code**, not via `func start --cors`. Identical behaviour on
  every machine, visible in the code, and covered by a test. It also forced out a real issue: the
  Functions host rejects two functions on the same route whose method sets overlap, so
  `GET /parking-requests` and `POST /parking-requests` cannot each declare `OPTIONS`. Preflight is
  served by one wildcard `OPTIONS` function in `functions/cors.ts` instead.
- **Client-side status filtering.** The dataset an operator looks at is small, so filtering the
  already-fetched list is instant and works from cache. The API supports `?status=`; moving to
  server-side filtering means passing the value into the React Query key.
- **`azure-functions-core-tools` is not a devDependency.** It is a ~590 MB lazy download whose
  automatic extraction failed on first run during development. Requiring the standard global
  install keeps `npm install` fast and predictable.
- **In-memory store means data resets when the host restarts.** Fine for a prototype, and the
  repository interface makes the replacement a one-file change.

---

## What is missing and what I would do next

**Not built (and why)**

- **No create-request form.** The brief asked for two screens and the API's create endpoint is
  covered by tests and documented with a `curl` example. I put the time into the status-transition
  flow and the assistant instead, since transitions are what the brief emphasises.
- **No frontend tests.** The brief asks for meaningful automated tests on the backend, so the
  test budget went there. This is the first gap I would close — see below.
- **No optimistic UI updates.** Mutations wait for the server. With a real network this would feel
  sluggish; the deliberate choice was correctness first.

**With more time, in this order**

1. **Frontend tests.** React Testing Library over the hooks and `ConfirmDialog` +
   `StatusTransitionDialog`, with MSW mocking the API. The highest-value cases: that only allowed
   actions render for each status, that a final transition cannot be applied without confirmation,
   and that a `409` surfaces as a message and triggers a refetch.
2. **An `LlmAssistantEngine`** behind the existing interface, structured-output constrained to the
   `AssistantFilters` schema, with the deterministic engine as the fallback when the model is
   unavailable or its output fails validation. The sanitising layer and its misbehaving-stub tests
   are already in place for it.
3. **A real repository** (Cosmos DB or Table Storage) plus an ETag/`If-Match` concurrency check on
   the status endpoint, so two operators cannot silently overwrite each other.
4. **Spot inventory** — model parking spots as real entities so approving can verify a spot exists
   and is not double-booked for the requested window. This is the biggest correctness gap in the
   domain as modelled.
5. **Production hardening:** authentication, per-caller rate limiting on the assistant endpoint,
   structured logging with a correlation id, `openapi.yaml` generated from the shared types, and
   CI running `typecheck` + `test` on every push.

---

## Use of AI-assisted development tools

I used **Claude Code** throughout, as an accelerator on work I directed and reviewed.

- **Where it helped most:** generating boilerplate quickly (React Native `StyleSheet` blocks,
  repetitive handler scaffolding, seed data), recalling exact API surfaces (Azure Functions v4
  registration, React Query v5 options, Expo monorepo Metro config), and drafting test cases from
  a description of what I wanted covered.
- **What I decided myself:** the layering (handler / service / repository), putting the state
  machine in `packages/shared` so the UI derives its buttons from it, using `409` for illegal
  transitions, the check ordering in `updateStatus`, the `AssistantEngine` seam and the
  read-only + suggestion-only safety model, and React Query as the state-management choice.
- **Where I had to correct it:** two genuine bugs in the assistant's query logic that its own
  first-pass tests missed — inclusive time-window comparison, which made a truck arriving at
  exactly 06:00 match "tonight", and a plate matcher that only handled hyphenated plates, so
  `hhcv1234` silently fell through to "no filter" and returned everything. Both were caught by
  writing the expectations first and are now regression tests.
- **What running it caught that no amount of review would have:** the Azure route/`OPTIONS`
  conflict described above only appeared when the Functions host actually started, and a
  react-native-web layout issue where `alignItems: 'center'` on a flex parent collapsed a
  `ScrollView` to its content width. I verified the API with `curl` against the live host and
  drove the app in a browser rather than trusting that it compiled.

I understand and can explain every line of the submitted code.
