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
