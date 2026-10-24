import { TestBed } from '@angular/core/testing';
import type { Task } from '../models/task.model';
import { WorldModelService } from './world-model.service';

const task: Task = {
  id: 'task-1',
  title: 'Buy milk',
  completed: false,
  createdAt: 1,
};

describe('WorldModelService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('persists task entities and their events', () => {
    const world = TestBed.inject(WorldModelService);
    world.upsertTask(task);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const restored = TestBed.inject(WorldModelService);

    expect(restored.taskEntities()).toHaveLength(1);
    expect(restored.taskEntities()[0].name).toBe('Buy milk');
    expect(restored.eventCount()).toBeGreaterThan(0);
  });

  it('archives a deleted task and appends a tombstone event', () => {
    const world = TestBed.inject(WorldModelService);
    world.upsertTask(task);
    world.archiveTask(task);

    expect(world.taskEntities()).toHaveLength(0);
    expect(world.recentEvents()[0]?.kind).toBe('tombstone');
  });
});

describe('WorldModelService projects', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('links tasks to projects and builds project context', () => {
    const world = TestBed.inject(WorldModelService);
    world.upsertProject({ id: 'p1', name: 'Launch' });
    world.upsertTask({ ...task, projectId: 'p1', projectName: 'Launch' });

    const context = world.buildPromptContext({
      subjectId: world.projectEntityId('p1'),
      limit: 10,
    });

    expect(world.projectSummaries()).toEqual([{ id: 'p1', name: 'Launch' }]);
    expect(world.tasksForProject('p1')).toHaveLength(1);
    expect(context.text).toContain('Project "Launch"');
    expect(context.text).toContain('Task "Buy milk"');
    expect(context.text).toContain('contains task');
    expect(context.entityIds).toContain(world.projectEntityId('p1'));
  });
});

describe('WorldModelService plan drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('keeps plan drafts stable and marks one selected', () => {
    const world = TestBed.inject(WorldModelService);
    world.upsertPlanDraft({
      id: 'run-1',
      goal: 'week',
      runId: 'run-1',
      selected: false,
      output: 'A',
    });
    world.upsertPlanDraft({
      id: 'run-2',
      goal: 'week',
      runId: 'run-2',
      selected: false,
      output: 'B',
    });
    world.selectPlanDraft('run-2');

    expect(world.planDrafts()).toHaveLength(2);
    expect(
      world.planDrafts().find((draft) => draft.attrs['runId'] === 'run-2')?.attrs['selected'],
    ).toBe(true);
    expect(
      world.planDrafts().find((draft) => draft.attrs['runId'] === 'run-1')?.attrs['selected'],
    ).toBe(false);
  });
});
