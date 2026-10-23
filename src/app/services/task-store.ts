import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Task, TaskFilter } from '../models/task.model';
import { WorldModelService } from './world-model.service';

const STORAGE_KEY = 'angular-todo-app.tasks';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly world = inject(WorldModelService);
  private readonly taskState = signal<Task[]>(this.load());
  private readonly filterState = signal<TaskFilter>('all');

  readonly tasks = this.taskState.asReadonly();
  readonly filter = this.filterState.asReadonly();

  readonly visibleTasks = computed(() => {
    const filter = this.filterState();

    return this.taskState().filter((task) => {
      if (filter === 'active') {
        return !task.completed;
      }

      if (filter === 'completed') {
        return task.completed;
      }

      return true;
    });
  });

  readonly remainingCount = computed(
    () => this.taskState().filter((task) => !task.completed).length,
  );

  readonly completedCount = computed(
    () => this.taskState().filter((task) => task.completed).length,
  );

  readonly counts = computed(() => ({
    all: this.taskState().length,
    active: this.remainingCount(),
    completed: this.completedCount(),
  }));

  constructor() {
    for (const task of this.taskState()) {
      this.world.upsertTask(task);
    }

    effect(() => this.save(this.taskState()));
  }

  add(title: string): void {
    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    const task: Task = {
      id: this.createId(),
      title: trimmed,
      completed: false,
      createdAt: Date.now(),
    };

    this.taskState.update((tasks) => [...tasks, task]);
    this.world.upsertTask(task);
  }

  toggle(id: string): void {
    this.taskState.update((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)),
    );
    const updated = this.taskState().find((task) => task.id === id);
    if (updated) {
      this.world.upsertTask(updated);
    }
  }

  rename(id: string, title: string): void {
    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    this.taskState.update((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, title: trimmed } : task)),
    );
    const updated = this.taskState().find((task) => task.id === id);
    if (updated) {
      this.world.upsertTask(updated);
    }
  }

  remove(id: string): void {
    const removed = this.taskState().find((task) => task.id === id);
    this.taskState.update((tasks) => tasks.filter((task) => task.id !== id));
    if (removed) {
      this.world.archiveTask(removed);
    }
  }

  setFilter(filter: TaskFilter): void {
    this.filterState.set(filter);
  }

  private createId(): string {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  private load(): Task[] {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);

      return Array.isArray(parsed) ? parsed.filter(isTask) : [];
    } catch {
      return [];
    }
  }

  private save(tasks: Task[]): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // Storage can be unavailable (private mode, quota). The app still works in memory.
    }
  }
}

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const task = value as Partial<Task>;

  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    task.title.trim().length > 0 &&
    typeof task.completed === 'boolean' &&
    typeof task.createdAt === 'number'
  );
}
