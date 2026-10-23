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

- **37 Vitest tests pass** across 7 spec files.
- **Production build succeeds** with no budget errors.
- **Scout eval** passes all thresholds.
- **H-MEM conformance** passes 13/13 checks.
- **World Model conformance** passes 8/8 checks.
- **Markovian conformance** passes 8/8 checks.

## Test layers

| Layer            | Tool                                   | What it proves                                             |
| ---------------- | -------------------------------------- | ---------------------------------------------------------- |
| Unit             | Angular CLI unit-test builder + Vitest | Store math, persistence, engine service behavior           |
| Integration      | Angular `TestBed` + jsdom              | Assistant intent -> action -> store -> engine side effects |
| Component        | Angular `TestBed` + jsdom              | App shell and engine panels render                         |
| Conformance      | Meterless runners under `tsx`          | Engine invariants that are independent of this app         |
| Eval             | Scout eval harness under `tsx`         | Intent accuracy, injection recall/precision, tool routing  |
| Production build | Angular AOT build                      | Templates, types, CSS budgets, and bundling                |

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
```

## Related

- [Documentation index](../README.md)
- [Project README](../../README.md)
