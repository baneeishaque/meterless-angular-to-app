# Angular To-Do App

A small, responsive to-do list built with Angular 22, standalone components, signals, and `localStorage`. No backend, no auth, no extra UI libraries.

The app also ships browser-safe ports of the four Meterless engines: **Scout Intent**, **H-MEM**, **World Model**, and **Markovian**.

## Features

- Add, edit, complete, and delete tasks
- Filter by All, Active, and Completed with live counts
- Remaining-task counter
- Tasks persist across refreshes via `localStorage`
- Empty state for each filter
- Keyboard-friendly editing (`Enter` saves, `Escape` cancels, double-click a title to edit)
- Mobile-responsive layout with a minimal, modern UI
- Natural-language assistant: add, complete, rename, delete, filter, and summarize tasks
- Scout Intent routing with prompt-injection blocking and confirmation for destructive actions
- H-MEM preference memory with retrieval, persistence, and a trust ledger
- World Model event log with task entities and an activity panel
- Markovian plan generation with per-run chunk configuration and efficiency stats

## Run it

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Verify it

```bash
npm test        # Vitest unit tests
npm run build   # production build
```

See [docs/testing/README.md](docs/testing/README.md) for the full manual and automated testing guide, and [docs/meterless-fit.md](docs/meterless-fit.md) for the implementation map and conformance commands.

## Structure

```text
src/app/
  models/task.model.ts                  Task and filter types
  services/task-store.ts                Signal store, derived views, localStorage
  services/scout.service.ts             Scout Intent facade
  services/memory.service.ts            H-MEM facade and persistence
  services/world-model.service.ts       World Model facade and task sync
  services/planning.service.ts          Markovian facade and persistence
  services/assistant.service.ts         Natural-language action executor
  services/persistence.ts               Shared localStorage JSON helpers
  engines/scout/                        Browser-safe Scout port
  engines/hmem/                         Browser-safe H-MEM port
  engines/world-model/                  Browser-safe World Model port
  engines/markovian/                    Browser-safe Markovian port
  engines/shared/crypto.ts              SHA-256, HMAC, canonical JSON
  directives/autofocus.ts               Focus helper for inline editing
  components/task-input/                Add-task form
  components/task-filters/              All / Active / Completed control
  components/task-item/                 One task row with edit and delete
  components/assistant-panel/           Chat, confirmations, plan output
  components/memory-panel/              Remembered preferences
  components/world-panel/               Event and audit activity
  app.ts / app.html / app.css           Page shell and empty state
```

`TaskStore` remains the only place that mutates tasks. Components are presentational and emit events; derived values (`visibleTasks`, `remainingCount`, `counts`) are `computed` signals. Ordinary CRUD stays on the direct path: component -> `TaskStore` -> `localStorage`.

The assistant path is:

```text
user input
  -> Scout Intent        classify, guard, route
  -> H-MEM               remember or recall preferences
  -> World Model         ground task entities
  -> Markovian           plan long-horizon goals
  -> TaskStore           commit accepted task changes
  -> World Model         append events
```

## Meterless engines

See [docs/meterless-fit.md](docs/meterless-fit.md) for the implementation map, persistence keys, and deliberate limits. See [docs/testing/meterless-engines-testing-guide.md](docs/testing/meterless-engines-testing-guide.md) for detailed test cases and expected results.

Third-party attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
