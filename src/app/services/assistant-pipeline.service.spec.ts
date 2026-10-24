import { TestBed } from '@angular/core/testing';
import { AssistantPipelineService } from './assistant-pipeline.service';
import { MemoryService } from './memory.service';
import { TaskStore } from './task-store';

describe('AssistantPipelineService', () => {
  let pipeline: AssistantPipelineService;
  let memory: MemoryService;
  let store: TaskStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    pipeline = TestBed.inject(AssistantPipelineService);
    memory = TestBed.inject(MemoryService);
    store = TestBed.inject(TaskStore);
  });

  it('keeps direct task actions context-free', async () => {
    const result = await pipeline.decide('Add a task: buy milk');

    expect(result.decision.intent.primary.id).toBe('task.add');
    expect(result.contextPlan.sources).toEqual([]);
    expect(result.trace.route).toBe('direct');
    expect(result.trace.memoryIds).toEqual([]);
    expect(result.trace.worldEntityIds).toEqual([]);
  });

  it('feeds memory and world state into a plan', async () => {
    memory.remember('For plans, prefer short steps');
    store.add('Ship the report');

    const result = await pipeline.decide('Plan my week');

    expect(result.decision.intent.primary.id).toBe('task.plan');
    expect(result.contextPlan.sources).toEqual(['memory', 'world']);
    expect(result.memory.count).toBeGreaterThan(0);
    expect(result.world.entityIds.length).toBeGreaterThan(0);
    expect(result.trace.route).toBe('markovian');
    expect(result.trace.stages).toContain('world-query');
  });
});
