# Meterless Engines in the Angular To-Do App

This app implements all four Meterless engines as browser-safe TypeScript ports. The engines are not installed as npm packages; their logic lives in `src/app/engines/` and is wired into the app through services.

The original design review is superseded: the engines are now part of the product, while ordinary CRUD still bypasses them.

## What is implemented

| Engine           | Port location                  | App role                                                                                    | Persistence key                 |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------- |
| **Scout Intent** | `src/app/engines/scout/`       | Classify natural-language input, contextual rescoring, block injections, gate risky actions | None; execution contracts only  |
| **H-MEM**        | `src/app/engines/hmem/`        | Remember preferences, project scopes, World Model facts, and plan completions               | `angular-todo-app.hmem.v1`      |
| **World Model**  | `src/app/engines/world-model/` | Event-sourced tasks, projects, containment relations, plan drafts, audit trail              | `angular-todo-app.world.v1`     |
| **Markovian**    | `src/app/engines/markovian/`   | Generate grounded plans, research, and alternatives with per-run chunk configuration        | `angular-todo-app.markovian.v1` |

Task records remain in `TaskStore` under `angular-todo-app.tasks`. The last assistant pipeline trace persists under `angular-todo-app.trace.v1`. The engines observe or assist; they do not replace the task store as the commit point.

## Runtime flow

```text
user input
  -> Context Plan        choose memory/world sources, budgets, and project scope
  -> Scout Intent        classify, rescore with context, guard, route
  -> H-MEM               recall project-scoped and global preferences
  -> World Model         ground tasks, projects, and plan drafts
  -> Markovian           plan long-horizon goals, research, or alternatives
  -> TaskStore           commit accepted task changes
  -> World Model         append task/project events and relations
  -> H-MEM               project task/project facts and plan completions
  -> Assistant Trace     persist route, IDs, and pipeline stages
```

Normal UI actions (add, toggle, edit, delete, filter, project assignment) still go directly from the component to `TaskStore`. The assistant is an additional path, not a wrapper around every click.

## Scout Intent

`ScoutService` loads the app registry from `src/app/engines/scout/app-registry.ts` with the `default` and `adversarial-tight` policy packs.

- Intents cover task add/complete/uncomplete/delete/rename/list/filter/summary/plan/compare/research, memory remember/recall/forget, and a safe `GENERAL` fallback.
- `ContextPlanService` chooses memory/world sources, token and chunk budgets, project scope, and redaction policy per intent.
- A Stage-3 contextual scorer raises plan/compare/research scores when the pipeline supplies memory or world context.
- High-risk actions such as deleting all tasks require explicit confirmation in the assistant panel.
- Prompt-injection patterns are blocked before any action runs.
- Every decision produces a signed execution contract; the app verifies it through `ScoutService.verifyContract`.

The eval adapter is `eval/scout-entry.ts`. It reads the registry path supplied by the harness and passes the parsed registry into the browser core.

## H-MEM

`MemoryService` wraps a browser-safe `HMEM` instance.

- Explicit "remember" requests are stored as long-term memory with source `user`; an active project adds a `project:<id>` tag.
- Recall uses hybrid ranking; plan recall filters project-tagged and global memories, and a generic recall with no strong match falls back to recent memories.
- World Model task/project events are projected as `world_model` facts with one record per entity, updated in place.
- Completed plans and research runs are stored with source `markovian:<run-id>` and origin `plan_completion`.
- The Memory panel shows provenance labels and links to the source World Model entity.
- Feedback, conflicts, sleep, and dreaming are available in the engine API, but the current UI surfaces memory creation, retrieval, and deletion only.
- Persistence is injected through a localStorage adapter; the engine core has no filesystem dependency.

## World Model

`WorldModelService` owns a `WorldModel` with namespace `todo`.

- Each task is an entity keyed by the stable external key `todo:<task-id>`; each project uses `todo:<project-id>`.
- `TaskStore` syncs add, toggle, rename, project assignment, and project removal with `upsertEntitySync`, `relateSync`, and `tombstoneSync`.
- Project-to-task `contains` relations power project context and `buildPromptContext`.
- Plan alternatives are `plan_draft` entities; selecting one marks exactly one draft selected.
- `EngineSyncService` subscribes to the timeline and mirrors task/project facts into H-MEM.
- The activity panel reads recent events and audit entries; merge proposals are available in the engine API for future review UI.
- Persistence is injected; the browser port does not write `.world/` files.

## Markovian

`PlanningService` wraps a `Markovian` instance with a local deterministic generator.

- Plan, compare, and research requests are gated by the Scout contract (`markovian.chain`, unblocked, valid signature).
- Planning uses the context-plan budget: `4` chunks for plan/compare and `6` for research; alternatives increase the budget by one each, capped at `12`.
- Grounded plans include memory notes, world state, and current task names in the first chunk.
- Every run records its own `chunkConfig` snapshot, as required by the spec.
- The assistant shows the plan, alternatives, and the run's efficiency percentage.
- History, plan drafts, and cumulative stats persist across reloads.
- The generator can be replaced with a provider-backed `generator` or `stepFn` without changing the engine.

## Conformance and eval

Run the suites from a checkout of the Meterless spec. The exact repository path is environment-specific; the commands below use `<meterless-spec>` as the placeholder.

### Scout eval

```bash
cd <meterless-spec>/engines/scout-intent
npm install
SCOUT_IMPL=<angular-todo-app>/eval/scout-entry.ts \
  npx tsx evals/runner/index.ts all
```

Latest result: all thresholds passed.

| Metric                | Result |
| --------------------- | ------ |
| `intent_top1`         | 1.00   |
| `intent_top3_recall`  | 1.00   |
| `injection_precision` | 1.00   |
| `injection_recall`    | 1.00   |
| `tool_precision`      | 1.00   |
| `clarification_rate`  | 0.0625 |
| `override_frequency`  | 0.00   |

### H-MEM conformance

```bash
HMEM_IMPL=<angular-todo-app>/src/app/engines/hmem/index.ts \
  npx tsx <meterless-spec>/engines/hmem/conformance/runner.ts
```

Latest result: **13/13 checks passed**.

### World Model conformance

```bash
WORLD_MODEL_IMPL=<angular-todo-app>/src/app/engines/world-model/index.ts \
  npx tsx <meterless-spec>/engines/world-model/conformance/runner.ts
```

Latest result: **8/8 checks passed**.

### Markovian conformance

```bash
MARKOVIAN_IMPL=<angular-todo-app>/src/app/engines/markovian/index.ts \
  npx tsx <meterless-spec>/engines/markovian/conformance/runner.ts
```

Latest result: **8/8 checks passed**.

## Browser adaptations

The reference implementations are Node-oriented. The ports differ in three deliberate ways:

1. **No filesystem access.** `node:fs` and `node:path` imports are removed. H-MEM, World Model, and Markovian history accept injected `load`/`save` persistence adapters. The app supplies localStorage adapters.
2. **Browser-safe crypto.** Scout uses the dependency-free SHA-256/HMAC implementation in `src/app/engines/shared/crypto.ts` instead of Node crypto.
3. **Synchronous write seams for the UI.** World Model exposes `upsertEntitySync` and `tombstoneSync` so `TaskStore` can project a local mutation immediately. The queued async methods remain available for ingest-style callers.

Internal engine imports are extensionless so the Angular compiler can bundle them. The Node-only Scout adapter imports the engine with an explicit `.ts` extension because it runs under `tsx`.

## Deliberate limits

- The assistant is deterministic and local. There is no remote model, API key, or network dependency.
- Scout's registry covers the app's actual action surface. Adding a new tool means adding an intent, capabilities, examples, and a fixture.
- H-MEM dreaming, sleep consolidation, and conflict auto-resolution are implemented but not exposed in the UI.
- World Model merge proposals are recorded; there is no operator review screen yet.
- Markovian plans are generated locally; long-horizon model-backed planning would replace the generator, not the engine.
- `localStorage` is the only persistence tier. IndexedDB or a backend can replace the adapters without changing engine cores.

## Design rules kept

- `TaskStore` remains the only task mutation point.
- Stable IDs and persisted-record validation are preserved.
- Derived state stays in `computed` signals.
- Components remain presentational and `OnPush`.
- Engines stay framework-free; Angular integration lives in services and components.

## Testing

See [testing/meterless-engines-testing-guide.md](testing/meterless-engines-testing-guide.md) for manual test cases, automated test inventory, conformance commands, expected outputs, and troubleshooting.
