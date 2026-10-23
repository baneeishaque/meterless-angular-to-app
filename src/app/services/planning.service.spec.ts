import { TestBed } from '@angular/core/testing';
import { PlanningService } from './planning.service';

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
});
