import { TestBed } from '@angular/core/testing';
import { AssistantPipelineService } from './assistant-pipeline.service';
import { MemoryService } from './memory.service';
import { ContractRefusalError, PlanningService } from './planning.service';
import { TaskStore } from './task-store';

describe('PlanningService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('persists plan runs with their chunk configuration snapshot', async () => {
    const planning = TestBed.inject(PlanningService);
    const run = await planning.plan('Plan my week');

    expect(run.chunkConfig).toBeDefined();
    expect(run.chunkConfig.maxChunks).toBe(4);
    expect(run.efficiencyPercent).toBeGreaterThanOrEqual(0);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const restored = TestBed.inject(PlanningService);

    expect(restored.runs()).toHaveLength(1);
    expect(restored.runs()[0].chunkConfig.maxChunks).toBe(4);
    expect(restored.runs()[0].output).toContain('Plan for');
  });

  it('grounds a contract-backed plan in memory and world state', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const memory = TestBed.inject(MemoryService);
    const store = TestBed.inject(TaskStore);
    memory.remember('For plans, prefer short steps');
    store.add('Ship the report');

    const context = await pipeline.decide('Plan my week');
    const run = await planning.planFromContract(context.decision, context);

    expect(run.output).toContain('Plan for my week');
    expect(run.output).toContain('Remembered context');
    expect(run.output).toContain('Ship the report');
    expect(run.output.match(/For plans, prefer short steps/g)).toHaveLength(1);
    expect(memory.findBySource(`markovian:${run.id}`)).toBeDefined();
  });

  it('refuses a contract without the markovian capability', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const context = await pipeline.decide('Plan my week');
    const forged = {
      ...context.decision,
      executionContract: {
        ...context.decision.executionContract,
        scope: { ...context.decision.executionContract.scope, capabilities: [] },
      },
    };

    await expect(planning.planFromContract(forged, context)).rejects.toBeInstanceOf(
      ContractRefusalError,
    );
  });

  it('refuses a tampered signature', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const context = await pipeline.decide('Plan my week');
    const forged = {
      ...context.decision,
      executionContract: {
        ...context.decision.executionContract,
        signature: 'tampered',
      },
    };

    await expect(planning.planFromContract(forged, context)).rejects.toBeInstanceOf(
      ContractRefusalError,
    );
  });

  it('refuses a wrong-intent contract', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const context = await pipeline.decide('Add a task: buy milk');

    await expect(planning.planFromContract(context.decision, context)).rejects.toBeInstanceOf(
      ContractRefusalError,
    );
  });

  it('refuses a blocked contract', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const context = await pipeline.decide('Plan my week');
    const blocked = {
      ...context.decision,
      risk: { ...context.decision.risk, level: 'block' as const },
    };

    await expect(planning.planFromContract(blocked, context)).rejects.toBeInstanceOf(
      ContractRefusalError,
    );
  });

  it('refuses an expired contract', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const context = await pipeline.decide('Plan my week');
    const expired = {
      ...context.decision,
      executionContract: {
        ...context.decision.executionContract,
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
    };

    await expect(planning.planFromContract(expired, context)).rejects.toBeInstanceOf(
      ContractRefusalError,
    );
  });

  it('creates selectable alternatives from one contract', async () => {
    const pipeline = TestBed.inject(AssistantPipelineService);
    const planning = TestBed.inject(PlanningService);
    const context = await pipeline.decide('Compare plan options for my week');

    const runs = await planning.planAlternatives(context.decision, context, 2);

    expect(runs).toHaveLength(2);
    expect(planning.lastAlternatives()).toHaveLength(2);
    expect(planning.selectAlternative(0)?.id).toBe(runs[0].id);
  });
});
