# Meterless Engines in the Angular To-Do App

This app implements all four Meterless engines as browser-safe TypeScript ports. The engines are not installed as npm packages; their logic lives in `src/app/engines/` and is wired into the app through services.

The original design review is superseded: the engines are now part of the product, while ordinary CRUD still bypasses them.

## What is implemented

| Engine           | Port location                  | App role                                                               | Persistence key                 |
| ---------------- | ------------------------------ | ---------------------------------------------------------------------- | ------------------------------- |
| **Scout Intent** | `src/app/engines/scout/`       | Classify natural-language input, block injections, gate risky actions  | None; execution contracts only  |
| **H-MEM**        | `src/app/engines/hmem/`        | Remember and retrieve user preferences and notes                       | `angular-todo-app.hmem.v1`      |
| **World Model**  | `src/app/engines/world-model/` | Event-sourced task entities, audit trail, merge proposals              | `angular-todo-app.world.v1`     |
| **Markovian**    | `src/app/engines/markovian/`   | Generate bounded plans with per-run chunk configuration and efficiency | `angular-todo-app.markovian.v1` |

Task records remain in `TaskStore` under `angular-todo-app.tasks`. The engines observe or assist; they do not replace the task store as the commit point.

## Runtime flow

```text
user input
  -> Scout Intent        classify, guard, route
  -> H-MEM               remember or recall preferences
  -> World Model         ground task entities
  -> Markovian           plan long-horizon goals
  -> TaskStore           commit accepted task changes
  -> World Model         append task events
```

Normal UI actions (add, toggle, edit, delete, filter) still go directly from the component to `TaskStore`. The assistant is an additional path, not a wrapper around every click.

## Scout Intent

`ScoutService` loads the app registry from `src/app/engines/scout/app-registry.ts` with the `default` and `adversarial-tight` policy packs.

- Intents cover task add/complete/uncomplete/delete/rename/list/filter/summary/plan, memory remember/recall/forget, and a safe `GENERAL` fallback.
- High-risk actions such as deleting all tasks require explicit confirmation in the assistant panel.
- Prompt-injection patterns are blocked before any action runs.
- Every decision produces a signed execution contract; the app verifies it through `ScoutService.verify`.

The eval adapter is `eval/scout-entry.ts`. It reads the registry path supplied by the harness and passes the parsed registry into the browser core.

## H-MEM

`MemoryService` wraps a browser-safe `HMEM` instance.

- Explicit "remember" requests are stored as long-term memory with source `user`.
- Recall uses hybrid ranking; if a generic recall query has no strong match, the panel falls back to recent memories.
- Feedback, conflicts, sleep, and dreaming are available in the engine API, but the current UI surfaces memory creation, retrieval, and deletion only.
- Persistence is injected through a localStorage adapter; the engine core has no filesystem dependency.

## World Model

`WorldModelService` owns a `WorldModel` with namespace `todo`.

- Each task is an entity keyed by the stable external key `todo:<task-id>`.
- `TaskStore` syncs add, toggle, and rename operations with `upsertEntitySync`.
- Delete operations append a tombstone and archive the entity.
- The activity panel reads recent events and audit entries; merge proposals are available in the engine API for future review UI.
- Persistence is injected; the browser port does not write `.world/` files.

## Markovian

`PlanningService` wraps a `Markovian` instance with a local deterministic generator.

- "Plan ..." requests run one bounded chunk, so the plan completes without an external model.
- Every run records its own `chunkConfig` snapshot, as required by the spec.
- The assistant shows the plan and the run's efficiency percentage.
- History and cumulative stats persist across reloads.
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
