# Integrate Meterless Combined Engine Mechanisms into the Angular To-Do App (v1)

## Rule Compliance Reference

- Agent Planning Rules: plan-first workflow, versioned H1,
  task-artifact synchronization, timestamps, maximum literal detail, and approval gates.
- Markdown Generation Skill: lint-compliant markdown,
  relative links, and heading discipline.
- Markdown Generation Rules Additions:
  additional markdownlint constraints used by this repository.
- Lowercase Hyphen Naming: kebab-case filenames
  for every new artifact and source file.
- Script Over Instruction Decomposition:
  deterministic scripts for repeatable verification, prose only for judgement.
- IDE Renderer Freeze Prevention: bounded
  command output, atomized probes, and no recursive scans over the whole workspace.
- Git Atomic Commit Construction: only
  relevant if the user later asks for commits; no commits are part of this plan.

## User Questions & Answers

No user questions were raised during discovery. The following scope decisions are open; each proposed default is
listed so implementation can begin immediately after approval.

| ID  | Question                                                                         | Proposed default                                                                         | Impact if changed                                                          |
| :-- | :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| Q1  | Implement all ten combined prompts or only the seven that fit the app?           | Implement the seven core mechanisms now; keep three optional phases gated.               | Implementing all ten adds project, research, and plan-comparison UI scope. |
| Q2  | Does “Accounts that remember people” map to projects in a single-user to-do app? | Defer the project entity to optional Phase 8; do not fake an account model.              | Phase 8 adds a project model, project filters, and project-scoped memory.  |
| Q3  | Should “Many drafts, one shared state” become plan comparison?                   | Defer to optional Phase 6; core pipeline uses one grounded plan at a time.               | Phase 6 adds parallel Markovian variants and a comparison UI.              |
| Q4  | Should the app gain a research intent?                                           | Defer to optional Phase 7; reuse the same contract and memory loop.                      | Phase 7 adds `task.research`, RESEARCH mode, and repeat-run memory reuse.  |
| Q5  | How strict should contract verification be?                                      | Strict: reject invalid, expired, wrong-intent, blocked, or missing-capability contracts. | A fallback path would weaken the security boundary and is not recommended. |
| Q6  | How much UI change is acceptable?                                                | Add a collapsible trace panel and memory provenance labels; do not redesign the task UI. | A larger UI redesign needs separate approval and visual tests.             |
| Q7  | Should test coverage tooling be added?                                           | Do not add a coverage package; add focused tests and keep the full suite green.          | Coverage adds a dependency and a separate configuration decision.          |
| Q8  | Should implementation be committed automatically?                                | No. Implementation is left uncommitted until the user explicitly requests commits.       | Commit construction would be a separate approved plan.                     |

## Objective

Implement the Meterless combined engine mechanisms that genuinely fit this local-first Angular to-do app, with an
explicit integration point for every mechanism, a measurable user benefit, and a testable safety boundary. The core
outcome is one coherent assistant pipeline:

1. Scout classifies the request and produces a context plan.
2. H-MEM supplies relevant preferences and prior outcomes.
3. The World Model supplies the current task state.
4. Scout signs an execution contract that names the allowed route.
5. Markovian handles long-horizon planning in bounded chunks, with memory in the first chunk only.
6. Task mutations remain direct and local.
7. World Model events flow one way into H-MEM as durable facts.
8. A trace panel explains what was used and why.

The implementation must preserve the existing direct task CRUD path and must not introduce a backend, network calls,
remote models, or destructive automation.

## Scope

### In Scope

- Context planning and memory-aware Scout classification (core combined prompt 2).
- World Model read surface for grounded planning (core combined prompt 5).
- H-MEM context injection into Markovian chunk 0 and plan-completion mining (core combined prompt 1).
- Contract-gated long-job routing to Markovian (core combined prompt 3).
- World Model event synchronization into H-MEM (core combined prompt 4).
- Full-stack assistant pipeline with trace and audit UI (core combined prompts 7 and 8).
- Tests, documentation, and verification for every core mechanism.
- Optional, separately gated phases for plan alternatives, research, and project context.

### Out of Scope

- A real Swarm engine, multi-agent coordination, or shared-state swarm orchestration.
- Remote LLM providers, network requests, API keys, or cloud storage.
- A backend, database, authentication, multi-user accounts, or sync.
- Automatic destructive actions without confirmation.
- Replacing direct task CRUD with engine-routed writes.
- Per-chunk H-MEM reinjection; memory enters chunk 0 only.
- Writing H-MEM facts back into the World Model (prevents a sync loop).
- Automatic conflict resolution that silently overwrites user memory.
- IndexedDB migration, service workers, or offline sync beyond current `localStorage`.
- Coverage tooling and coverage thresholds.
- Commits, pushes, or pull requests.

## Current State and Discovery Evidence

### Repository state

- Repository: `<repo>`
- Branch: `main`
- HEAD: `38fe6c1 chore(legal): add Meterless attribution and license`
- Untracked: `.opencode/`
- No source changes are pending.

### Baseline verification

- `CI=true npm test -- --watch=false`: 7 test files, 37 tests, all passing.
- `npm run build`: production build succeeded.
- Build output: `dist/angular-todo-app`.
- Existing engine conformance: H-MEM 13/13, World Model 8/8, Markovian 8/8.
- Existing Scout evaluation: all thresholds pass, including top-1 intent, top-3 recall, injection precision/recall,
  tool precision, clarification rate, and override frequency.

### Existing seams

| Area                                      | Current behavior                                       | Gap relative to combined prompts                                                    |
| :---------------------------------------- | :----------------------------------------------------- | :---------------------------------------------------------------------------------- |
| `src/app/services/assistant.service.ts`   | Executes the primary intent and handles confirmation.  | Ignores `secondaryIntents`; no context plan; no trace.                              |
| `src/app/services/scout.service.ts`       | Wraps `Scout.decide` and `verify`.                     | Does not pass memory or world context; no context-plan helper.                      |
| `src/app/services/memory.service.ts`      | Remember, recall, forget, delete.                      | No source-keyed upsert, no plan-completion ingestion, no context formatter.         |
| `src/app/services/world-model.service.ts` | Task upsert, archive, entity lookup, recent events.    | No prompt-context builder, no event subscription facade, no read-surface adapter.   |
| `src/app/services/planning.service.ts`    | Runs Markovian with a deterministic one-chunk plan.    | No contract verification, no memory/world context, no completion mining, no resume. |
| `src/app/engines/scout/scoring.ts`        | Optional semantic rescoring hook.                      | No contextual rescoring hook.                                                       |
| `src/app/engines/hmem/types.ts`           | Provenance origins include plan completion and manual. | No `world_model` provenance origin.                                                 |
| `src/app/engines/world-model/index.ts`    | Graph, timeline, snapshot, and facts views exist.      | Service does not expose graph traversal or prompt formatting.                       |
| `src/app/components/*`                    | Assistant, memory, and world panels exist.             | No pipeline trace or memory provenance display.                                     |

### Direct CRUD invariant

Normal task actions continue to use `TaskStore` directly:

```text
task-input / task-item -> TaskStore -> localStorage
TaskStore -> WorldModelService -> World Model events
```

Engines assist only AI, ambiguous, or long-horizon actions. No engine sits in the normal add, toggle, rename, or delete
path.

## Combined Mechanism Fit Matrix

| #   | Combined prompt                 | Fit in this app            | Exact integration point                                                                                                                     | User benefit                                                                         | Decision          |
| :-- | :------------------------------ | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------- | :---------------- |
| 1   | Memory plus long tasks          | Strong                     | `PlanningService.planFromContract` passes H-MEM context to Markovian chunk 0; `MemoryService.recordPlanCompletion` writes the outcome back. | Plans remember preferences, prior decisions, and previous plan outcomes.             | Core, Phase 3     |
| 2   | Check memory before acting      | Strong                     | `AssistantPipelineService` calls `ScoutService.planContext`, `MemoryService.recallForPlan`, then `ScoutService.decide` with context.        | Fewer clarification loops; “the usual” and vague references resolve correctly.       | Core, Phase 1     |
| 3   | Route long jobs to Markovian    | Strong                     | `AssistantService` routes `task.plan` through `PlanningService.planFromContract`; the signed Scout contract is verified first.              | Long goals become bounded, resumable plans instead of one-shot answers.              | Core, Phase 3     |
| 4   | World state into memory         | Strong                     | `EngineSyncService` subscribes to World Model events and calls `MemoryService.upsertWorldFact`.                                             | The assistant remembers completed and archived tasks without re-querying everything. | Core, Phase 4     |
| 5   | Plan from the world model       | Strong                     | `WorldModelService.buildPromptContext` feeds `ContextPlan` and Markovian chunk 0.                                                           | Plans reference real open tasks instead of generic advice.                           | Core, Phase 2     |
| 6   | Many drafts, one shared state   | Partial                    | Optional `PlanningService.planAlternatives` runs two Markovian variants against one World Model snapshot.                                   | Users can compare a fast and a thorough plan before committing.                      | Optional, Phase 6 |
| 7   | The full stack in one agent     | Strong                     | New `AssistantPipelineService` plus `EngineSyncService` and trace UI.                                                                       | One coherent, auditable assistant instead of disconnected panels.                    | Core, Phase 5     |
| 8   | Upgrade the hackathon starter   | Strong                     | Umbrella equivalent: Scout guard, H-MEM, World Model, and Markovian wired through the pipeline.                                             | The existing app gains the combined behavior without a rewrite.                      | Core, Phases 1-5  |
| 9   | A research agent that remembers | Partial                    | Optional `task.research` intent and RESEARCH mode through `PlanningService`.                                                                | Repeated research starts from prior findings and decisions.                          | Optional, Phase 7 |
| 10  | Accounts that remember people   | Weak for a single-user app | Optional project entity, project-scoped tasks, and project-tagged H-MEM facts.                                                              | “Plan the launch” uses project tasks and project preferences.                        | Optional, Phase 8 |

### Core versus optional

- Core: 1, 2, 3, 4, 5, 7, 8.
- Optional and separately gated: 6, 9, 10.
- “Sign every tool call” is an IMPLEMENT prompt, not a COMBINE prompt. Its useful part is the strict contract gate in
  Phase 3; it is not counted as a combined mechanism.

## User-Facing Improvements

| Improvement                | Mechanism                                | What the user notices                                                              |
| :------------------------- | :--------------------------------------- | :--------------------------------------------------------------------------------- |
| Fewer clarification loops  | Context plan plus memory-aware Scout     | “The usual” resolves to the remembered preference instead of a follow-up question. |
| Grounded plans             | World Model context in chunk 0           | “Plan my week” names the user’s actual open tasks.                                 |
| Continuity across sessions | H-MEM recall and plan-completion memory  | A second planning run remembers the first plan’s decisions.                        |
| Bounded long work          | Contract-gated Markovian routing         | Long goals produce chunked plans with a visible stop condition.                    |
| Trust and auditability     | Pipeline trace and contract metadata     | The user can see which memory, tasks, and route were used.                         |
| Consistent facts           | One-way World Model to H-MEM sync        | Completed and archived tasks do not linger as stale facts.                         |
| Less repetitive typing     | Multi-intent execution and bulk previews | “Move all work tasks to Friday” becomes a preview plus one confirmation.           |
| Project continuity         | Optional project context                 | Project-specific tasks and preferences stay together.                              |
| Plan choice                | Optional plan alternatives               | The user compares a fast plan and a thorough plan.                                 |
| Research reuse             | Optional research intent                 | A repeated research question reuses prior findings and decisions.                  |

## Additional User Scenarios

| Scenario                   | Example prompt                                          | Engines used                         | Expected outcome                                                         | Phase |
| :------------------------- | :------------------------------------------------------ | :----------------------------------- | :----------------------------------------------------------------------- | :---- |
| Weekly planning            | “Plan my week.”                                         | Scout, H-MEM, World Model, Markovian | A plan grounded in open tasks and remembered work preferences.           | 3     |
| Next-action coaching       | “What should I do next?”                                | Scout, World Model, H-MEM            | Three concrete next actions, each tied to a real task.                   | 2-3   |
| Vague reference resolution | “Do the usual for the report.”                          | Scout, H-MEM, World Model            | The remembered routine and the matching task are resolved before acting. | 1-2   |
| Bulk edit preview          | “Move all work tasks to Friday.”                        | Scout, World Model, TaskStore        | A preview of affected tasks, then one confirmation.                      | 5     |
| Completion review          | “What did I finish this week?”                          | H-MEM, World Model                   | A summary from durable world facts and recent events.                    | 4     |
| Project planning           | “Plan the launch.”                                      | Scout, World Model, H-MEM            | A plan scoped to the project’s tasks and preferences.                    | 8     |
| Plan comparison            | “Compare a fast and a thorough plan for the migration.” | Scout, World Model, Markovian        | Two drafts from one shared snapshot; the user selects one.               | 6     |
| Research with memory       | “Research the best local-first storage option.”         | Scout, H-MEM, Markovian              | A research plan that recalls prior findings.                             | 7     |
| Explain why                | “Why did you choose that?”                              | Trace panel                          | The intent, contract, memory IDs, world entities, and route are visible. | 5     |
| Memory correction          | “Forget that I prefer mornings.”                        | H-MEM, trace                         | The memory is removed and the change is recorded in the trust ledger.    | 1-4   |
| Crash-safe resume          | “Resume my plan.”                                       | Markovian markers, World Model       | The plan resumes from the last checkpoint instead of restarting.         | 3     |
| Meeting follow-up          | Paste notes and say “Turn this into tasks.”             | H-MEM, Scout, TaskStore              | Proposed tasks and a follow-up plan, each requiring confirmation.        | 5-7   |

## Architecture

### Target data flow

```text
user prompt
  -> AssistantPipelineService
       -> ScoutService.planContext
       -> MemoryService.recallForPlan        (when the plan says memory is needed)
       -> WorldModelService.buildPromptContext (when the plan says world is needed)
       -> ScoutService.decide with context
       -> signed ExecutionContract
  -> AssistantService router
       -> direct TaskStore actions
       -> PlanningService.planFromContract
            -> verify signature, expiry, intent, capabilities, risk
            -> Markovian.run with memory and world context
            -> MemoryService.recordPlanCompletion
  -> WorldModelService events
       -> EngineSyncService
            -> MemoryService.upsertWorldFact
  -> AssistantTracePanel
```

### New data contracts

```ts
export type ContextSource = 'memory' | 'world';

export interface ContextPlan {
  sources: ContextSource[];
  topN: number;
  maxTokens: number;
  maxChunks: number;
  subjectId?: string;
  relations: string[];
  redactionPolicy: 'default_internal';
  reason: string;
}

export interface MemoryContext {
  text: string;
  ids: string[];
  count: number;
}

export interface WorldContext {
  text: string;
  entityIds: string[];
  entityCount: number;
  truncated: boolean;
}

export interface PlanningContext {
  memory: MemoryContext;
  world: WorldContext;
  contextPlan: ContextPlan;
}

export interface AssistantTrace {
  traceId: string;
  contractId: string;
  intent: string;
  confidence: number;
  risk: string;
  route: 'direct' | 'markovian' | 'refused';
  contextPlan: ContextPlan;
  memoryIds: string[];
  worldEntityIds: string[];
  startedAt: number;
  durationMs: number;
  stages: string[];
}
```

### Context-plan rules

The deterministic `ContextPlanService` uses these rules, in order:

1. `task.plan`: `sources: ['memory', 'world']`, `topN: 8`, `maxTokens: 8000`, `maxChunks: 4`.
2. `task.list` and `task.summary`: `sources: ['world']`, `topN: 0`, `maxTokens: 2000`, `maxChunks: 1`.
3. `task.complete`, `task.uncomplete`, `task.delete`, and `task.rename`: `sources: ['world']` for task resolution,
   `topN: 0`, `maxTokens: 1500`, `maxChunks: 1`.
4. `memory.recall`: `sources: ['memory']`, `topN: 8`, `maxTokens: 4000`, `maxChunks: 1`.
5. `memory.remember` and `memory.forget`: `sources: []`; the memory action itself owns recall.
6. `task.add` and `GENERAL`: `sources: []`.
7. Vague-reference markers (`usual`, `again`, `like before`, `my preference`, `remember`) add `memory`.
8. Deictic task references (`it`, `that`, `the report`, `this task`) add `world`.
9. Unknown intents fall back to `sources: []`; no speculative context is loaded.

### Contextual Scout scoring

The Scout port keeps its current deterministic score and adds one optional hook:

```ts
contextualScorer?: (
  prompt: string,
  intent: IntentDefinition,
  context: unknown,
) => number;
```

When the hook is present, the score is:

```text
score = clamp01(0.8 * baseScore + 0.2 * contextualScore)
```

This mirrors the existing semantic hook and preserves all existing behavior when no context is supplied. The app's
contextual scorer measures token overlap between the context block and the intent description, examples, and
triggers. It returns `0` when there is no overlap. The existing evaluation suite is rerun after this change; any
threshold regression blocks the phase.

### Contract gate

`PlanningService.planFromContract` refuses to run unless all checks pass:

```ts
const signatureValid = this.scout.verify(contract);
const expiresAt = Date.parse(contract.expiresAt);
const notExpired = Number.isFinite(expiresAt) && expiresAt > Date.now();
const intentAllowed =
  contract.intent.primary.id === 'task.plan' || contract.intent.primary.id === 'task.research';
const capabilityAllowed = contract.scope.capabilities.includes('markovian.chain');
const riskAllowed = contract.risk.level !== 'block';

if (!signatureValid || !notExpired || !intentAllowed || !capabilityAllowed || !riskAllowed) {
  throw new ContractRefusalError('The routing contract is invalid, expired, or out of scope.');
}
```

Refusals are shown to the user as a normal assistant message. There is no unverified fallback execution.

### Deterministic grounded plan

The app has no remote model. `PlanningService` therefore uses a deterministic step function that still exercises the
Markovian contract:

```ts
stepFn: ({ step, carryover, goal }) => ({
  content:
    step === 1
      ? buildGroundedPlan(goal, context.memory, context.world)
      : buildPlanContinuation(goal, carryover),
});
```

`buildGroundedPlan` includes the count of memories and active tasks, names up to three real tasks, and ends with:

```text
[STATE_CHECKPOINT]
COMPLETED: context gathered and plan skeleton drafted
REMAINING: sequence the work, identify the first three actions, and capture the next task
DECISIONS: grounded in the supplied memory and world context
CONTEXT: memory ids and world entity ids are recorded in the trace
```

`buildPlanContinuation` reads the carryover and ends with `[TASK_COMPLETE]`. The two-chunk shape proves chunk-0
memory injection, carryover, marker parsing, and completion mining without pretending to be an LLM.

### Plan-completion memory payload

```ts
{
  content: `Completed plan for "${goal}": ${summary}`,
  type: 'factual',
  layer: 'long_term',
  tags: ['plan_completion', 'markovian', `run:${run.id}`],
  confidence: 0.75,
  source: `markovian:${run.id}`,
  provenance: {
    origin: 'plan_completion',
    learnedAt: Date.now(),
    label: 'Markovian plan completion',
  },
  goalRunId: run.id,
}
```

`summary` is the first two non-empty plan lines, trimmed to 240 characters. The record is source-keyed and updated,
not duplicated, if the same run is mined twice.

### World-fact memory payload

```ts
{
  content: `Task "${entity.name}" is ${completed ? 'completed' : 'active'}.`,
  type: 'factual',
  layer: 'long_term',
  tags: ['world:task', `task:${entity.id}`],
  confidence: 0.9,
  source: `world:${entity.id}`,
  provenance: {
    origin: 'world_model',
    learnedAt: Date.parse(entity.updatedAt),
    label: 'World Model',
  },
}
```

On a tombstone, the existing source-keyed record is updated to:

```text
Task "<name>" was archived.
```

and receives the additional tag `archived`. No second record is created. The sync is one way: H-MEM never writes to
the World Model.

### One-way sync boundary

```text
TaskStore -> WorldModelService -> World events -> EngineSyncService -> MemoryService
```

There is no reverse edge. `EngineSyncService` is started once through `provideAppInitializer` and is idempotent.

## Proposed Changes

### Phase 0: Baseline and safety gate

**Goal:** Confirm the starting state and make every later verification reproducible.

**Files:**

- `.markdownlint-cli2.jsonc` (new)

**Steps:**

1. Confirm the app is reachable at `http://localhost:4200`:

   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4200
   ```

   Expected: `200`.

2. If the server is not running, start it from the app root in a separate terminal:

   ```bash
   npm start
   ```

   Then rerun the readiness check from step 1.

3. Confirm the working tree:

   ```bash
   git status --short
   ```

   Expected: only `?? .opencode/`.

4. Run the baseline suite:

   ```bash
   CI=true npm test -- --watch=false
   ```

   Expected: 7 files, 37 tests, all passing.

5. Run the baseline build:

   ```bash
   npm run build
   ```

   Expected: exit code 0 and `dist/angular-todo-app` produced.

6. Add the docs lint config so Prettier and markdownlint agree on two-space nested lists:

   ```json
   {
     "config": {
       "MD013": {
         "line_length": 120,
         "code_blocks": false,
         "tables": false
       },
       "MD007": {
         "indent": 2
       },
       "MD046": {
         "style": "fenced"
       }
     }
   }
   ```

7. Verify the planning artifacts with the new config:

   ```bash
   markdownlint-cli2 --config .markdownlint-cli2.jsonc \
     "docs/2026-10-23_meterless-engine-integration-implementation-plan-combined-mechanisms_v1.md" \
     "docs/2026-10-23_meterless-engine-integration-task.md"
   ```

   Expected: `Summary: 0 issues`.

**Acceptance:** The app is reachable, the tree is clean apart from `.opencode/`, and the baseline suite and build pass.

### Phase 1: Context plan and memory-aware Scout

**Goal:** Make Scout request and use only the context it needs, with H-MEM lifting confidence on vague references.

**Files:**

- `src/app/services/context-plan.service.ts` (new)
- `src/app/services/context-plan.service.spec.ts` (new)
- `src/app/services/assistant-pipeline.service.ts` (new)
- `src/app/services/assistant-pipeline.service.spec.ts` (new)
- `src/app/services/scout.service.ts`
- `src/app/services/scout.service.spec.ts`
- `src/app/services/memory.service.ts`
- `src/app/services/memory.service.spec.ts`
- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`
- `src/app/engines/scout/types.ts`
- `src/app/engines/scout/index.ts`
- `src/app/engines/scout/scoring.ts`

**Steps:**

1. Add `ContextPlan`, `ContextSource`, `MemoryContext`, and `PlanningContext` types. Keep them in
   `context-plan.service.ts` so the app boundary owns the app-specific policy.
2. Implement `ContextPlanService.plan(prompt, candidates)` using the ordered rules in “Context-plan rules”. Return a
   deterministic `reason` string for the trace.
3. Add `contextualScorer` to `ScoutOptions`, `ClassifyInput`, and `classifyPrompt`. Preserve the exact existing score
   when the hook is absent.
4. Add `ScoutService.planContext(prompt)` that calls `scout.classify` and then `ContextPlanService.plan`.
5. Extend `ScoutService.decide(prompt, context?)` to pass the context object into `Scout.decide`.
6. Add `MemoryService.recallForPlan(query, topN)` returning `MemoryContext`. Use threshold `0.2`, touch returned
   records, and format a `[MEMORY CONTEXT]` block with one line per memory and its source.
7. Add `AssistantPipelineService.decide(prompt)` that composes the context plan, memory context, and world context
   placeholder, then calls `ScoutService.decide`.
8. Wire `AssistantService.submit` to `AssistantPipelineService.decide` while preserving the existing pending,
   clarification, and confirmation flow.
9. Add the tests listed below.
10. Run the focused tests, the full suite, the build, and the Scout evaluation.

**Tests:**

**`context-plan.service.spec.ts`**

- “add milk” yields no sources.
- “plan my week” yields memory and world with `maxChunks: 4`.
- “what’s left” yields world only.
- “the usual” yields memory.
- “complete the report” yields world for task resolution.

**`scout.service.spec.ts`**

- Contextual overlap raises the matching intent’s score.
- No context preserves the baseline score.
- The returned contract still verifies.

**`memory.service.spec.ts`**

- `recallForPlan` returns formatted text, ids, and count.
- Empty memory returns an empty context without throwing.

**`assistant-pipeline.service.spec.ts`**

- A vague prompt requests memory and passes it to Scout.
- A simple add does not request memory or world context.

**`assistant.service.spec.ts`**

- “The usual” uses the remembered preference before execution.
- Existing add, complete, delete, plan, and memory tests remain green.

**Verification:**

```bash
CI=true npm test -- --watch=false
npm run build
SCOUT_IMPL=eval/scout-entry.ts \
  npx tsx <meterless-spec>/engines/scout-intent/evals/runner/index.ts all
```

**Acceptance:** Vague prompts resolve with memory; simple adds load no context; all existing tests pass; Scout eval
thresholds remain green.

### Phase 2: World Model context for grounded planning

**Goal:** Give the assistant a bounded, provenance-aware view of the current task world.

**Files:**

- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/services/context-plan.service.ts`
- `src/app/services/assistant-pipeline.service.ts`
- `src/app/services/planning.service.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`

**Steps:**

1. Add `WorldModelService.buildPromptContext(options)` with `subjectId`, `limit` (default 12), `include`
   (`contains`, `depends_on`, `subtask_of`), `eventWindow` (default 5), and `maxChars` (default 4000).
2. Query active task entities through `world.view('graph')`. If `subjectId` is present, resolve the entity and include
   its neighbors through the requested relations.
3. Format a `[WORLD CONTEXT]` block with stable entity IDs, names, completion state, and updated timestamps. Truncate
   at `maxChars` and set `truncated: true`.
4. Include up to `eventWindow` recent events for the selected entities, with event kind and timestamp.
5. Add `WorldContext` to `AssistantPipelineService` and pass it to `ScoutService.decide`.
6. Pass the structured world context into `PlanningService.plan` through the new `PlanningContext`.
7. Update `AssistantService` so `task.plan` uses the pipeline’s world context and so `task.list` / `task.summary`
   continue to use `TaskStore` for display.
8. Add tests:
   - Empty world returns an empty context.
   - Three active tasks produce three lines and three entity IDs.
   - Completed tasks are labeled completed.
   - `limit` truncates deterministically and sets `truncated`.
   - A subject task includes its neighbors when a relation exists.
   - `task.plan` receives the world context; `task.add` does not.
9. Run focused tests, the full suite, and the build.

**Verification:**

```bash
CI=true npm test -- --watch=false
npm run build
```

**Acceptance:** “Plan my week” names real open tasks; the trace records the world entity IDs; no context is loaded for
simple adds; existing direct task behavior is unchanged.

### Phase 3: Contract-gated Markovian and plan-completion memory

**Goal:** Route long-horizon goals through a verified contract, inject H-MEM into chunk 0, and write the outcome back
to memory.

**Files:**

- `src/app/services/planning.service.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/services/scout.service.ts`
- `src/app/services/scout.service.spec.ts`
- `src/app/services/memory.service.ts`
- `src/app/services/memory.service.spec.ts`
- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`
- `src/app/engines/hmem/types.ts`
- `src/app/engines/markovian/types.ts` (only if a typed context alias is
  needed; no behavior change)
- `src/app/engines/markovian/promptBuilder.ts` (only if the world context
  must be labeled separately; otherwise combine it into `memoryContext`)

**Steps:**

1. Add `ContractRefusalError` with a user-safe message and a machine-readable `reason`.
2. Implement `PlanningService.planFromContract(contract, goal, context)` with the exact contract gate shown above.
3. Keep `PlanningService.plan(goal)` as a legacy direct path for existing tests and non-assistant callers. The
   assistant must use `planFromContract`.
4. Build a `contextBlock` from `MemoryContext.text` and `WorldContext.text`. Pass it as `memoryContext` so it enters
   chunk 0 only. Do not pass it on continuation chunks.
5. Replace the one-chunk `buildPlan` with `buildGroundedPlan` for chunk 1 and `buildPlanContinuation` for chunk 2.
   Use `[STATE_CHECKPOINT]` and `[TASK_COMPLETE]` exactly.
6. Set `maxChunks` from `ContextPlan.maxChunks` (default 4). Keep `carryoverTokens` at the app default unless the
   contract budget requires a smaller value.
7. Add `MemoryService.recordPlanCompletion(run, goal)` with the payload above. Use `findBySource` so repeated
   ingestion updates instead of duplicating.
8. Add `MemoryService.findBySource(source)` and `MemoryService.updateBySource(source, patch)`.
9. Add `world_model` to the H-MEM `ProvenanceOrigin` union.
10. In `AssistantService`, catch `ContractRefusalError` and show the safe refusal message. Do not execute the plan.
11. Add tests:
    - Unsigned contract is refused.
    - Expired contract is refused.
    - Wrong intent is refused.
    - Missing `markovian.chain` capability is refused.
    - Blocked risk is refused.
    - Valid contract runs and produces two chunks.
    - Chunk 1 contains the memory context; chunk 2 does not repeat it.
    - Plan completion creates one memory with `source: markovian:<runId>`.
    - A second planning run recalls the first plan’s completion memory.
    - Re-mining the same run does not duplicate the memory.
12. Run focused tests, the full suite, the build, and the Markovian conformance suite.

**Verification:**

```bash
CI=true npm test -- --watch=false
npm run build
MARKOVIAN_IMPL=src/app/engines/markovian/index.ts \
  npx tsx <meterless-spec>/engines/markovian/conformance/runner.ts
```

**Acceptance:** Invalid contracts never execute; valid plans use memory and world context; plan outcomes are
remembered; the second run demonstrably reuses the first; Markovian conformance stays 8/8.

### Phase 4: World Model to H-MEM synchronization

**Goal:** Turn durable world facts into memory without duplicates or a write-back loop.

**Files:**

- `src/app/services/engine-sync.service.ts` (new)
- `src/app/services/engine-sync.service.spec.ts` (new)
- `src/app/services/memory.service.ts`
- `src/app/services/memory.service.spec.ts`
- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/app.config.ts`
- `src/app/app.spec.ts`

**Steps:**

1. Add `WorldModelService.subscribe(listener)` that delegates to `world.view('timeline').subscribe` and returns an
   unsubscribe function.
2. Add `MemoryService.upsertWorldFact(entity)` with the payload above. Use `source: world:<entity.id>` as the
   idempotency key.
3. Add `MemoryService.archiveWorldFact(targetId, at, reason)` that finds the source-keyed record and updates its
   content and tags. If no record exists, create a concise archived fact from the target ID.
4. Create `EngineSyncService` with `start()` and `stop()`. `start()` is idempotent and subscribes once.
5. Handle `upsertEntity` events whose payload type is `task`. Ignore other entity types for now.
6. Handle `tombstone` events. Ignore unrelated target IDs.
7. Register the sync service with `provideAppInitializer(() => inject(EngineSyncService).start())` in
   `app.config.ts`.
8. Add tests:
   - Adding a task creates one memory with `source: world:<entityId>`.
   - Toggling the task updates the same memory; the count stays one.
   - Renaming the task updates the same memory.
   - Deleting the task updates the same memory to “was archived” and adds the `archived` tag.
   - Reloading the service does not duplicate records.
   - H-MEM writes do not produce new World Model events.
9. Run focused tests, the full suite, the build, and the H-MEM conformance suite.

**Verification:**

```bash
CI=true npm test -- --watch=false
npm run build
HMEM_IMPL=src/app/engines/hmem/index.ts \
  npx tsx <meterless-spec>/engines/hmem/conformance/runner.ts
```

**Acceptance:** World facts appear once in memory; updates are idempotent; archived tasks are reflected; there is no
sync loop; H-MEM conformance stays 13/13.

### Phase 5: Full-stack pipeline trace and audit UI

**Goal:** Make the combined pipeline understandable and auditable to the user.

**Files:**

- `src/app/services/assistant-pipeline.service.ts`
- `src/app/services/assistant-pipeline.service.spec.ts`
- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`
- `src/app/components/trace-panel/trace-panel.ts` (new)
- `src/app/components/trace-panel/trace-panel.html` (new)
- `src/app/components/trace-panel/trace-panel.css` (new)
- `src/app/components/trace-panel/trace-panel.spec.ts` (new)
- `src/app/components/assistant-panel/assistant-panel.ts`
- `src/app/components/assistant-panel/assistant-panel.html`
- `src/app/components/assistant-panel/assistant-panel.css`
- `src/app/components/memory-panel/memory-panel.ts`
- `src/app/components/memory-panel/memory-panel.html`
- `src/app/components/memory-panel/memory-panel.css`
- `src/app/app.ts`
- `src/app/app.html`
- `src/app/app.css`
- `src/app/app.spec.ts`

**Steps:**

1. Complete `AssistantPipelineService.decide` so it returns the decision, context plan, memory, world, and trace.
2. Record `stages` in order: `context-plan`, `memory-recall`, `world-query`, `scout-decide`, `contract`,
   `execution`, `memory-write`.
3. Add `AssistantService.lastTrace` as a signal. Set it before execution and update the final stage after execution.
4. Add a compact meta line to the assistant panel: intent, confidence, memory count, world entity count, and route.
5. Add a collapsible `TracePanel` that shows the last trace, contract ID, context-plan reason, memory IDs, world
   entity IDs, stages, and duration.
6. Add memory provenance labels to the memory panel: source, origin, layer, confidence, and a link to the world
   entity when the source starts with `world:`.
7. Keep the trace panel out of the normal task flow; it is an audit surface, not a required step.
8. Add tests:
   - The trace has the expected stage order.
   - The trace records memory IDs and world entity IDs.
   - The assistant panel shows the meta line.
   - The trace panel renders a trace and hides when empty.
   - The memory panel shows the world source for a synced fact.
   - The app still renders all four panels.
9. Run focused tests, the full suite, the build, and a manual browser smoke test.

**Verification:**

```bash
CI=true npm test -- --watch=false
npm run build
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4200
npx prettier --check "src/app/**/*.{ts,html,css}" "docs/**/*.md" "README.md" "THIRD_PARTY_NOTICES.md"
```

**Acceptance:** The user can see why the assistant acted; the trace is accurate; the UI remains responsive; all tests
and the build pass.

### Optional Phase 6: Plan alternatives with shared World Model state

**Goal:** Provide a lightweight analog of “Many drafts, one shared state” without a Swarm engine.

**Gate:** Requires explicit user approval after the core phases. Do not implement by default.

**Files:**

- `src/app/services/planning.service.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/components/assistant-panel/assistant-panel.ts`
- `src/app/components/assistant-panel/assistant-panel.html`
- `src/app/components/assistant-panel/assistant-panel.css`
- `src/app/components/assistant-panel/assistant-panel.spec.ts` (new)

**Steps:**

1. Add `PlanningService.planAlternatives(goal, context, count = 2)`.
2. Run two Markovian variants in parallel with the same `WorldContext` snapshot and different `maxChunks` or plan
   detail.
3. Create `plan_draft` entities in the World Model with stable external keys and `attrs: { goal, runId, selected }`.
4. Show both drafts in the assistant panel with a “Use this plan” action.
5. On selection, update the chosen draft entity to `selected: true`, record the choice in H-MEM, and keep the
   unselected draft as an unselected entity.
6. Add tests for shared context, two drafts, selection, and idempotent draft updates.
7. Run the full suite and build.

**Acceptance:** Two plans are visibly different, both use the same world snapshot, and selection does not duplicate
entities.

### Optional Phase 7: Research intent with memory reuse

**Goal:** Adapt “A research agent that remembers” to a research-planning intent.

**Gate:** Requires explicit user approval after the core phases. Do not implement by default.

**Files:**

- `src/app/engines/scout/app-registry.ts`
- `src/app/services/context-plan.service.ts`
- `src/app/services/planning.service.ts`
- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/engines/scout/app-registry.spec.ts` (new, if no registry test
  exists)

**Steps:**

1. Add `task.research` to `APP_INTENT_REGISTRY` with `capabilities: ['markovian.chain']`, `riskClass: 'low'`, and
   examples such as “Research the best local-first storage option”.
2. Add triggers for `research`, `investigate`, and `compare options`.
3. Extend `ContextPlanService` so `task.research` uses memory and world context, `topN: 8`, `maxTokens: 8000`, and
   `maxChunks: 6`.
4. In `PlanningService.planFromContract`, select `mode: 'RESEARCH'` for `task.research`.
5. Add `AssistantService` routing for `task.research` through the same contract and memory loop.
6. Add tests that a second identical research request recalls the first research completion.
7. Run the full suite, build, and Scout evaluation.

**Acceptance:** Research prompts route through a verified contract; the second run uses prior research memory; the
existing `task.plan` path is unchanged.

### Optional Phase 8: Project context that remembers tasks and preferences

**Goal:** Adapt “Accounts that remember people” to project-scoped context without inventing a multi-user account
system.

**Gate:** Requires explicit user approval after the core phases. Do not implement by default.

**Files:**

- `src/app/models/task.model.ts`
- `src/app/services/task-store.ts`
- `src/app/services/task-store.spec.ts`
- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/services/memory.service.ts`
- `src/app/services/memory.service.spec.ts`
- `src/app/services/context-plan.service.ts`
- `src/app/services/assistant-pipeline.service.ts`
- `src/app/components/task-input/task-input.ts`
- `src/app/components/task-input/task-input.html`
- `src/app/components/task-item/task-item.ts`
- `src/app/components/task-item/task-item.html`
- `src/app/components/task-filters/task-filters.ts`
- `src/app/components/task-filters/task-filters.html`
- `src/app/app.ts`
- `src/app/app.html`
- `src/app/app.spec.ts`

**Steps:**

1. Add optional `projectId` and `projectName` to the task model. Keep tasks without a project valid.
2. Add project selection to the task input and a project filter to the task filters.
3. Add `project` entities to the World Model and `contains` relationships to their tasks.
4. Add `MemoryService` preferences tagged `project:<projectId>`.
5. Extend `ContextPlanService` so a project mention sets `subjectId` to the project entity and adds memory and world
   sources.
6. Extend `WorldModelService.buildPromptContext` to traverse `contains` from the project entity.
7. Add tests for project creation, task assignment, project filtering, project-scoped memory, and project-grounded
   planning.
8. Run the full suite, build, and a manual browser smoke test.

**Acceptance:** A project plan uses the project’s tasks and preferences; tasks without a project still work; no
account or multi-user model is introduced.

## Surface Area Scan

No deletions or renames are planned. The following fundamental changes require a reference sweep before editing.

### Commands

```bash
grep -R "\.plan(" -n src/app
grep -R "ScoutService\|scout\.decide\|verify(" -n src/app
grep -R "MemoryService\|memory\.remember\|memory\.recall\|memory\.forget" -n src/app
grep -R "WorldModelService\|upsertTask\|archiveTask\|entityFor" -n src/app
grep -R "app-assistant-panel\|app-memory-panel\|app-world-panel" -n src
grep -R "angular-todo-app\." -n src/app
grep -R "ProvenanceOrigin\|origin:" -n src/app/engines/hmem src/app/services
```

### Expected reference surfaces

- `AssistantService` is the only caller of `PlanningService.plan` and `ScoutService.decide`.
- `TaskStore` is the only caller of `WorldModelService.upsertTask` and `archiveTask`.
- `MemoryPanel` is the only UI caller of `MemoryService.delete` and `forget`.
- `App` is the only component that composes the four panels.
- Persistence keys are only read and written through `src/app/services/persistence.ts`.
- No source file outside `src/app` imports the app services.

### Conflict handling

- If a new reference is found outside the expected surfaces, stop and update this plan before editing.
- If a test asserts an exact plan string, update the assertion only after the new grounded output is reviewed.
- If a service method name collides with an existing method, prefer a new method name over an overload.

## File Inventory

### New files

- `.markdownlint-cli2.jsonc`
- `src/app/services/context-plan.service.ts`
- `src/app/services/context-plan.service.spec.ts`
- `src/app/services/assistant-pipeline.service.ts`
- `src/app/services/assistant-pipeline.service.spec.ts`
- `src/app/services/engine-sync.service.ts`
- `src/app/services/engine-sync.service.spec.ts`
- `src/app/components/trace-panel/trace-panel.ts`
- `src/app/components/trace-panel/trace-panel.html`
- `src/app/components/trace-panel/trace-panel.css`
- `src/app/components/trace-panel/trace-panel.spec.ts`
- `src/app/engines/scout/app-registry.spec.ts` (optional Phase 7)
- `src/app/components/assistant-panel/assistant-panel.spec.ts` (optional
  Phase 6, only if no spec exists)
- `docs/2026-10-23_meterless-engine-integration-task.md`
- `docs/2026-10-23_meterless-engine-integration-implementation-plan-combined-mechanisms_v1.md`

### Modified files

- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`
- `src/app/services/scout.service.ts`
- `src/app/services/scout.service.spec.ts`
- `src/app/services/memory.service.ts`
- `src/app/services/memory.service.spec.ts`
- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/services/planning.service.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/engines/scout/types.ts`
- `src/app/engines/scout/index.ts`
- `src/app/engines/scout/scoring.ts`
- `src/app/engines/hmem/types.ts`
- `src/app/app.config.ts`
- `src/app/app.ts`
- `src/app/app.html`
- `src/app/app.css`
- `src/app/app.spec.ts`
- `src/app/components/assistant-panel/assistant-panel.ts`
- `src/app/components/assistant-panel/assistant-panel.html`
- `src/app/components/assistant-panel/assistant-panel.css`
- `src/app/components/memory-panel/memory-panel.ts`
- `src/app/components/memory-panel/memory-panel.html`
- `src/app/components/memory-panel/memory-panel.css`

### Optional Phase 6 files

- `src/app/services/planning.service.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/components/assistant-panel/assistant-panel.ts`
- `src/app/components/assistant-panel/assistant-panel.html`
- `src/app/components/assistant-panel/assistant-panel.css`
- `src/app/components/assistant-panel/assistant-panel.spec.ts`

### Optional Phase 7 files

- `src/app/engines/scout/app-registry.ts`
- `src/app/services/context-plan.service.ts`
- `src/app/services/planning.service.ts`
- `src/app/services/assistant.service.ts`
- `src/app/services/assistant.service.spec.ts`
- `src/app/services/planning.service.spec.ts`
- `src/app/engines/scout/app-registry.spec.ts`

### Optional Phase 8 files

- `src/app/models/task.model.ts`
- `src/app/services/task-store.ts`
- `src/app/services/task-store.spec.ts`
- `src/app/services/world-model.service.ts`
- `src/app/services/world-model.service.spec.ts`
- `src/app/services/memory.service.ts`
- `src/app/services/memory.service.spec.ts`
- `src/app/services/context-plan.service.ts`
- `src/app/services/assistant-pipeline.service.ts`
- `src/app/components/task-input/task-input.ts`
- `src/app/components/task-input/task-input.html`
- `src/app/components/task-item/task-item.ts`
- `src/app/components/task-item/task-item.html`
- `src/app/components/task-filters/task-filters.ts`
- `src/app/components/task-filters/task-filters.html`
- `src/app/app.ts`
- `src/app/app.html`
- `src/app/app.spec.ts`

## Verification Plan

### Per-phase minimum

Run after every phase:

```bash
CI=true npm test -- --watch=false
npm run build
```

### Full verification

```bash
CI=true npm test -- --watch=false
npm run build
npx prettier --check "src/app/**/*.{ts,html,css}" "docs/**/*.md" "README.md" "THIRD_PARTY_NOTICES.md"
markdownlint-cli2 --config .markdownlint-cli2.jsonc \
  "docs/2026-10-23_meterless-engine-integration-implementation-plan-combined-mechanisms_v1.md" \
  "docs/2026-10-23_meterless-engine-integration-task.md"
```

### Engine conformance

```bash
HMEM_IMPL=src/app/engines/hmem/index.ts \
  npx tsx <meterless-spec>/engines/hmem/conformance/runner.ts
WORLD_MODEL_IMPL=src/app/engines/world-model/index.ts \
  npx tsx <meterless-spec>/engines/world-model/conformance/runner.ts
MARKOVIAN_IMPL=src/app/engines/markovian/index.ts \
  npx tsx <meterless-spec>/engines/markovian/conformance/runner.ts
SCOUT_IMPL=eval/scout-entry.ts \
  npx tsx <meterless-spec>/engines/scout-intent/evals/runner/index.ts all
```

### Manual browser checks

1. Open `http://localhost:4200`.
2. Add a task; confirm it appears and the world panel updates.
3. Say “Remember that I prefer short answers.”
4. Say “The usual” and confirm the memory is used without a clarification loop.
5. Say “Plan my week” and confirm the plan names real open tasks.
6. Say “Plan my week” again and confirm the trace shows a plan-completion memory from the first run.
7. Delete a task and confirm the memory panel shows the archived world fact.
8. Open the trace panel and confirm intent, contract, memory IDs, world entity IDs, and stage order.
9. Refresh the page and confirm tasks, memory, world state, and traces survive.
10. Confirm no console errors and no network requests beyond the local app assets.

## Acceptance Criteria

- All seven core combined mechanisms have an explicit integration point and a passing test.
- Direct task CRUD still works without any engine call.
- “The usual” resolves with H-MEM and does not ask a redundant clarification.
- “Plan my week” uses the World Model and names real open tasks.
- `task.plan` runs only through a valid Scout contract.
- Invalid, expired, wrong-intent, blocked, or missing-capability contracts are refused with a safe message.
- H-MEM context appears in Markovian chunk 1 and not in chunk 2.
- Plan completion creates one source-keyed memory; a second run recalls it.
- World Model task events create one source-keyed memory per entity; updates do not duplicate.
- Tombstoned tasks are reflected as archived memories.
- The trace panel shows the actual context, contract, route, and stage order.
- The full suite passes with the 37 baseline tests plus the new tests.
- Production build, Prettier, markdownlint, H-MEM conformance, World Model conformance, Markovian conformance, and
  Scout evaluation all pass.
- No network, backend, authentication, or multi-user feature is introduced.
- No commit, push, or pull request is created without explicit user instruction.

## Risks and Mitigations

| Risk                                    | Likelihood                  | Mitigation                                                                                   |
| :-------------------------------------- | :-------------------------- | :------------------------------------------------------------------------------------------- |
| Context bloat increases prompt size     | Medium                      | `topN`, `maxTokens`, `maxChars`, and deterministic truncation.                               |
| Memory poisoning or stale facts         | Medium                      | Mandatory provenance, confidence, trust ledger, source-keyed upsert, and tombstone handling. |
| Duplicate world facts                   | High without a key          | `source: world:<entityId>` and `findBySource` update path.                                   |
| Sync loop between World Model and H-MEM | Low if one-way              | No H-MEM write-back to the World Model; test asserts no new world events.                    |
| Contract expiry during a long run       | Low for deterministic plans | Verify before run; refusal message; future replan hook.                                      |
| Deterministic plans feel generic        | Medium                      | Ground in real tasks and memory; tests assert grounding; optional model generator later.     |
| Circular dependency between services    | Medium                      | `EngineSyncService` is the only bridge; `AssistantPipelineService` owns orchestration.       |
| Angular signal update loops             | Medium                      | One-way event flow; no effect that writes back to its own source.                            |
| Test brittleness from timestamps        | Medium                      | Inject clocks where possible; assert content and counts, not exact times.                    |
| UI clutter                              | Low                         | Trace panel is collapsible and secondary to the task list.                                   |
| Scope creep from optional phases        | High                        | Optional phases are explicitly gated and excluded from core acceptance.                      |
| Privacy regression                      | Low                         | Local-only storage; no network; memory edit and delete remain available.                     |

## Rollback Plan

- No database migration and no destructive schema change are involved.
- Tracked file changes can be reverted with `git restore <path>` for the specific files listed in the phase.
- New files can be moved to the trash with `trash <path>` when available; otherwise remove them only with explicit
  user approval.
- New `localStorage` keys are additive. If a rollback must remove them, clear only the new keys and leave the
  existing H-MEM, World Model, Markovian, and task keys intact.
- If the contract gate causes a regression, disable only the assistant’s `task.plan` route and keep direct task CRUD
  available. Do not bypass signature verification.
- If the world-to-memory sync causes noise, stop `EngineSyncService` via its `stop()` method and leave existing
  memory records in place; they remain normal H-MEM records.
- If the trace UI causes rendering issues, remove the `TracePanel` import from `App` and keep the service-level
  trace data.

## CAM Table

Commits are out of scope for this plan. If the user later requests commits, use this mapping:

| Proposed commit                                              | Files and actions      | Verification                             |
| :----------------------------------------------------------- | :--------------------- | :--------------------------------------- |
| `feat(engines): add context planning and memory-aware Scout` | Phase 1 files          | Full suite, build, Scout eval            |
| `feat(engines): ground planning in World Model context`      | Phase 2 files          | Full suite, build                        |
| `feat(engines): gate Markovian runs with Scout contracts`    | Phase 3 files          | Full suite, build, Markovian conformance |
| `feat(engines): sync World Model facts into H-MEM`           | Phase 4 files          | Full suite, build, H-MEM conformance     |
| `feat(assistant): add pipeline trace and audit UI`           | Phase 5 files          | Full suite, build, browser smoke         |
| `docs: document the combined engine pipeline`                | README or docs updates | Prettier, markdownlint                   |
| `feat(engines): add plan alternatives`                       | Optional Phase 6 files | Full suite, build                        |
| `feat(engines): add research intent with memory reuse`       | Optional Phase 7 files | Full suite, build, Scout eval            |
| `feat(tasks): add project context memory`                    | Optional Phase 8 files | Full suite, build, browser smoke         |

## Task Artifact Synchronization

- Task artifact:
  `docs/2026-10-23_meterless-engine-integration-task.md`
- Create it at the start of planning with all top-level items.
- Update it after each phase with `[x] [YYYY-MM-DD HH:mm]`.
- Use `[/]` only for the single active phase.
- Do not delete the task artifact without explicit user confirmation.
- If scope changes, create `v2` of this plan with the full Change History table; do not edit `v1` in place.

## Approval Gate

Implementation will not start until the user explicitly approves this plan or provides corrections. If the user
approves only the core phases, Phases 6-8 remain unstarted. If the user wants a different mapping for prompts 6, 9,
or 10, revise this plan to `v2` before editing source files.
