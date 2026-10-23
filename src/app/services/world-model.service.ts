import { computed, Injectable, signal } from '@angular/core';
import { externalId, WorldModel } from '../engines/world-model';
import type { AuditEntry, Entity, WorldEvent } from '../engines/world-model';
import type { Task } from '../models/task.model';
import { readJson, writeJson } from './persistence';

const WORLD_KEY = 'angular-todo-app.world.v1';

@Injectable({ providedIn: 'root' })
export class WorldModelService {
  private readonly revision = signal(0);
  private readonly world = new WorldModel({
    namespace: 'todo',
    storage: 'memory',
    persistence: {
      load: () => readJson(WORLD_KEY),
      save: (snapshot) => writeJson(WORLD_KEY, snapshot),
    },
  });

  readonly taskEntities = computed(() => {
    this.revision();
    return this.world
      .view('graph')
      .query({ type: 'task' })
      .filter((entity) => entity.state === 'active');
  });

  readonly recentEvents = computed<readonly WorldEvent[]>(() => {
    this.revision();
    return [...this.world.events()].slice(-6).reverse();
  });

  readonly recentAudit = computed<readonly AuditEntry[]>(() => {
    this.revision();
    return [...this.world.audit()].slice(-6).reverse();
  });

  readonly eventCount = computed(() => {
    this.revision();
    return this.world.events().length;
  });

  upsertTask(task: Task): void {
    const id = this.entityId(task.id);
    const existing = this.world.view('graph').entity(id);

    if (
      existing &&
      existing.state === 'active' &&
      existing.name === task.title &&
      existing.attrs['completed'] === task.completed
    ) {
      return;
    }

    this.world.upsertEntitySync({
      type: 'task',
      externalKey: { system: 'todo', id: task.id },
      name: task.title,
      attrs: {
        title: task.title,
        completed: task.completed,
        createdAt: task.createdAt,
      },
      source: { kind: 'user', by: 'local-user', at: new Date().toISOString() },
    });
    this.revision.update((value) => value + 1);
  }

  archiveTask(task: Task): void {
    try {
      this.world.tombstoneSync(this.entityId(task.id), 'task deleted', {
        kind: 'user',
        by: 'local-user',
        at: new Date().toISOString(),
      });
      this.revision.update((value) => value + 1);
    } catch {
      // The task may predate World Model persistence; nothing to archive.
    }
  }

  entityFor(task: Task): Entity | undefined {
    return this.world.view('graph').entity(this.entityId(task.id));
  }

  private entityId(taskId: string): string {
    return externalId('task', 'todo', taskId);
  }
}
