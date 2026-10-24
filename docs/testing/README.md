# Testing

This folder owns the test strategy, commands, and expected results for the app and its Meterless engine ports.

## Start here

- [Meterless Engines Testing Guide](meterless-engines-testing-guide.md) — full manual and automated test guide for the natural-language assistant, Scout Intent, H-MEM, World Model, and Markovian.
- [Meterless Engines implementation map](../meterless-fit.md) — architecture, persistence keys, and engine limits.

## Fast verification

```bash
npm install
CI=true npm test -- --watch=false
npm run build
```

Expected on the current implementation:

- **101 Vitest tests pass** across 15 spec files.
- **Production build succeeds** with no budget errors.
- **Scout eval** passes all thresholds.
- **H-MEM conformance** passes 13/13 checks.
- **World Model conformance** passes 8/8 checks.
- **Markovian conformance** passes 8/8 checks.
- **Playwright headless Chromium smoke** passes the assistant, project, trace, persistence, and provider flows.

## Test layers

| Layer            | Tool                                   | What it proves                                             |
| ---------------- | -------------------------------------- | ---------------------------------------------------------- |
| Unit             | Angular CLI unit-test builder + Vitest | Store math, persistence, engine service behavior           |
| Integration      | Angular `TestBed` + jsdom              | Assistant intent -> action -> store -> engine side effects |
| Component        | Angular `TestBed` + jsdom              | App shell, engine panels, and provider panel render        |
| Conformance      | Meterless runners under `tsx`          | Engine invariants that are independent of this app         |
| Eval             | Scout eval harness under `tsx`         | Intent accuracy, injection recall/precision, tool routing  |
| Production build | Angular AOT build                      | Templates, types, CSS budgets, and bundling                |

## Combined-mechanisms coverage

The current suite adds dedicated coverage for:

- Context planning: memory/world source selection, project anchoring, and direct-intent bypass.
- Assistant pipeline: shared Scout decision, H-MEM recall, World Model query, and trace assembly.
- Planning contracts: capability, signature, intent, blocked-contract, and expiry refusals.
- Alternatives: one contract producing selectable plan drafts with a selected draft.
- Research: a completed research run reused by a second identical request.
- World-to-H-MEM sync: task upserts, project facts, and tombstones mirrored without duplicates.
- Project tasks: project creation, task scoping, and unassignment on project removal.
- Trace UI: direct-action traces, reload restoration, and routing metadata.
- Vague references: “the usual” resolved from remembered preferences.
- Runtime provider: URL/connect-link normalization, token rejection, auth/app/scope headers, status
  classification, Auto Detect, model filtering, and plain-text chat.

## Test data reset

The app persists to `localStorage`. To reset all app state, open DevTools and run:

```js
localStorage.clear();
location.reload();
```

To reset only one subsystem, remove its key:

```js
localStorage.removeItem('angular-todo-app.tasks');
localStorage.removeItem('angular-todo-app.hmem.v1');
localStorage.removeItem('angular-todo-app.world.v1');
localStorage.removeItem('angular-todo-app.markovian.v1');
localStorage.removeItem('angular-todo-app.trace.v1');
localStorage.removeItem('meterless_runtime_token');
localStorage.removeItem('meterless_runtime_settings');
```

## Related

- [Documentation index](../README.md)
- [Project README](../../README.md)
