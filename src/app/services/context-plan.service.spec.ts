import { TestBed } from '@angular/core/testing';
import type { IntentCandidate } from '../engines/scout';
import { ContextPlanService } from './context-plan.service';

function candidate(intent: string): IntentCandidate {
  return { intent, score: 0.9, band: 'high' };
}

describe('ContextPlanService', () => {
  let plans: ContextPlanService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    plans = TestBed.inject(ContextPlanService);
  });

  it('loads memory and world for a plan', () => {
    const plan = plans.plan('Plan my week', [candidate('task.plan')]);

    expect(plan.sources).toEqual(['memory', 'world']);
    expect(plan.topN).toBe(8);
    expect(plan.maxTokens).toBe(8000);
    expect(plan.maxChunks).toBe(4);
  });

  it('does not load context for a direct task add', () => {
    const plan = plans.plan('Add a task: buy milk', [candidate('task.add')]);

    expect(plan.sources).toEqual([]);
    expect(plan.maxChunks).toBe(1);
  });

  it('adds memory for a vague reference', () => {
    const plan = plans.plan('Do the usual', [candidate('GENERAL')]);

    expect(plan.sources).toContain('memory');
    expect(plan.reason).toContain('Vague reference');
  });

  it('adds world for a deictic task reference', () => {
    const plan = plans.plan('Complete it', [candidate('task.complete')]);

    expect(plan.sources).toContain('world');
    expect(plan.reason).toContain('Deictic');
  });

  it('anchors a named project and its relations', () => {
    const plan = plans.plan(
      'Plan the launch project',
      [candidate('task.plan')],
      [{ id: 'project-1', name: 'Launch' }],
    );

    expect(plan.sources).toEqual(['memory', 'world']);
    expect(plan.subjectId).toBe('project:todo:project-1');
    expect(plan.relations).toEqual(['contains']);
  });
});
