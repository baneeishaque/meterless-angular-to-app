import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Project, ProjectFilter, Task, TaskFilter } from '../models/task.model';
import { WorldModelService } from './world-model.service';

const STORAGE_KEY = 'angular-todo-app.tasks';
const PROJECTS_KEY = 'angular-todo-app.projects';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly world = inject(WorldModelService);
  private readonly taskState = signal<Task[]>(this.loadTasks());
  private readonly projectState = signal<Project[]>(this.loadProjects());
  private readonly filterState = signal<TaskFilter>('all');
  private readonly projectFilterState = signal<ProjectFilter>('all');

  readonly tasks = this.taskState.asReadonly();
  readonly projects = this.projectState.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly projectFilter = this.projectFilterState.asReadonly();

  readonly scopedTasks = computed(() => {
    const project = this.projectFilterState();
    return project === 'all'
      ? this.taskState()
      : this.taskState().filter((task) => task.projectId === project);
  });

  readonly visibleTasks = computed(() => {
    const filter = this.filterState();

    return this.scopedTasks().filter((task) => {
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
    () => this.scopedTasks().filter((task) => !task.completed).length,
  );

  readonly completedCount = computed(
    () => this.scopedTasks().filter((task) => task.completed).length,
  );

  readonly counts = computed(() => ({
    all: this.scopedTasks().length,
    active: this.remainingCount(),
    completed: this.completedCount(),
  }));

  constructor() {
    for (const project of this.projectState()) {
      this.world.upsertProject(project);
    }

    for (const task of this.taskState()) {
      this.world.upsertTask(task);
    }

    effect(() => this.saveTasks(this.taskState()));
    effect(() => this.saveProjects(this.projectState()));
  }

  add(title: string, projectId?: string): void {
    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    const project = this.resolveProject(projectId);
    const task: Task = {
      id: this.createId(),
      title: trimmed,
      completed: false,
      createdAt: Date.now(),
      projectId: project?.id,
      projectName: project?.name,
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

  addProject(name: string): Project | undefined {
    const trimmed = name.trim();

    if (!trimmed) {
      return undefined;
    }

    const existing = this.projectState().find(
      (project) => project.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      return existing;
    }

    const project: Project = {
      id: this.createId(),
      name: trimmed,
      createdAt: Date.now(),
    };
    this.projectState.update((projects) => [...projects, project]);
    this.world.upsertProject(project);
    return project;
  }

  removeProject(id: string): void {
    this.projectState.update((projects) => projects.filter((project) => project.id !== id));
    this.taskState.update((tasks) =>
      tasks.map((task) =>
        task.projectId === id ? { ...task, projectId: undefined, projectName: undefined } : task,
      ),
    );

    for (const task of this.taskState()) {
      this.world.upsertTask(task);
    }

    this.world.archiveProject(id);
    if (this.projectFilterState() === id) {
      this.projectFilterState.set('all');
    }
  }

  setTaskProject(taskId: string, projectId?: string): void {
    const project = this.resolveProject(projectId);
    this.taskState.update((tasks) =>
      tasks.map((task) =>
        task.id === taskId ? { ...task, projectId: project?.id, projectName: project?.name } : task,
      ),
    );
    const updated = this.taskState().find((task) => task.id === taskId);
    if (updated) {
      this.world.upsertTask(updated);
    }
  }

  setFilter(filter: TaskFilter): void {
    this.filterState.set(filter);
  }

  setProjectFilter(project: ProjectFilter): void {
    this.projectFilterState.set(project);
  }

  private resolveProject(projectId?: string): Project | undefined {
    if (!projectId) {
      return undefined;
    }
    return this.projectState().find((project) => project.id === projectId);
  }

  private createId(): string {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  private loadTasks(): Task[] {
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

  private loadProjects(): Project[] {
    try {
      const raw = globalThis.localStorage?.getItem(PROJECTS_KEY);

      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);

      return Array.isArray(parsed) ? parsed.filter(isProject) : [];
    } catch {
      return [];
    }
  }

  private saveTasks(tasks: Task[]): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // Storage can be unavailable (private mode, quota). The app still works in memory.
    }
  }

  private saveProjects(projects: Project[]): void {
    try {
      globalThis.localStorage?.setItem(PROJECTS_KEY, JSON.stringify(projects));
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
    typeof task.createdAt === 'number' &&
    (task.projectId === undefined || typeof task.projectId === 'string') &&
    (task.projectName === undefined || typeof task.projectName === 'string')
  );
}

function isProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const project = value as Partial<Project>;

  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    project.name.trim().length > 0 &&
    typeof project.createdAt === 'number'
  );
}
