import { TestBed } from '@angular/core/testing';
import { MemoryService } from './memory.service';

const MEMORY_KEY = 'angular-todo-app.hmem.v1';

describe('MemoryService', () => {
  let memory: MemoryService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    memory = TestBed.inject(MemoryService);
  });

  it('persists memories across service recreation', () => {
    memory.remember('I prefer short answers');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const restored = TestBed.inject(MemoryService);

    expect(restored.count()).toBe(1);
    expect(restored.memories()[0].content).toBe('I prefer short answers');
  });

  it('records create, read, and delete actions in the trust ledger', () => {
    const record = memory.remember('I prefer short answers');

    memory.recall('short answers');
    memory.delete(record!.id);

    const snapshot = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as {
      ledger: { action: string; memoryId: string }[];
    };
    const actions = snapshot.ledger.map((entry) => entry.action);

    expect(actions).toContain('create');
    expect(actions).toContain('read');
    expect(actions).toContain('delete');
    expect(snapshot.ledger.every((entry) => entry.memoryId === record!.id)).toBe(true);
  });
});

describe('MemoryService provenance', () => {
  let memory: MemoryService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    memory = TestBed.inject(MemoryService);
  });

  it('updates a world fact by source instead of duplicating it', () => {
    const entity = {
      type: 'task',
      id: 'task:todo:1',
      attrs: { completed: false },
      schemaVersion: 1,
      source: { kind: 'user', at: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aliases: [],
      state: 'active' as const,
      name: 'Buy milk',
    };

    memory.upsertWorldFact(entity);
    memory.upsertWorldFact({ ...entity, attrs: { completed: true } });

    expect(memory.count()).toBe(1);
    expect(memory.memories()[0].content).toContain('completed');
    expect(memory.memories()[0].provenance?.origin).toBe('world_model');
  });

  it('records plan completion with a stable source key', () => {
    const run = {
      id: 'run-1',
      output: 'Plan for launch\n\n1. Ship it.',
      status: 'completed',
    } as Parameters<MemoryService['recordPlanCompletion']>[0];

    memory.recordPlanCompletion(run, 'launch');
    memory.recordPlanCompletion(
      { ...run, output: 'Plan for launch\n\n1. Ship it safely.' },
      'launch',
    );

    expect(memory.count()).toBe(1);
    expect(memory.memories()[0].content).toContain('Completed plan for "launch"');
    expect(memory.memories()[0].source).toBe('markovian:run-1');
    expect(memory.memories()[0].goalRunId).toBe('run-1');
  });
});

describe('MemoryService plan recall', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('returns empty context when memory is empty', () => {
    const memory = TestBed.inject(MemoryService);

    const context = memory.recallForPlan('Plan my week');

    expect(context.count).toBe(0);
    expect(context.text).toBe('');
  });

  it('scopes recall to a project while keeping global preferences', () => {
    const memory = TestBed.inject(MemoryService);
    memory.remember('Prefer short answers');
    memory.remember('Use the blue theme for launch', { project: 'p1' });
    memory.remember('Use the red theme for billing', { project: 'p2' });

    const context = memory.recallForPlan('launch plan', 8, { projectId: 'p1' });

    expect(context.text).toContain('Prefer short answers');
    expect(context.text).toContain('blue theme');
    expect(context.text).not.toContain('red theme');
  });
});
