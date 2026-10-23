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
