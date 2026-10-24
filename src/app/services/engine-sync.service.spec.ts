import { TestBed } from '@angular/core/testing';
import { EngineSyncService } from './engine-sync.service';
import { MemoryService } from './memory.service';
import { TaskStore } from './task-store';

describe('EngineSyncService', () => {
  let sync: EngineSyncService;
  let memory: MemoryService;
  let store: TaskStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    sync = TestBed.inject(EngineSyncService);
    memory = TestBed.inject(MemoryService);
    store = TestBed.inject(TaskStore);
    sync.start();
  });

  afterEach(() => sync.stop());

  it('mirrors task upserts and archives into H-MEM', () => {
    store.add('Ship the report');
    const task = store.tasks()[0];

    expect(memory.findBySource(`world:task:todo:${task.id}`)?.content).toContain('active');

    store.toggle(task.id);

    expect(memory.findBySource(`world:task:todo:${task.id}`)?.content).toContain('completed');

    store.remove(task.id);

    expect(memory.findBySource(`world:task:todo:${task.id}`)?.content).toContain('archived');
  });
});
