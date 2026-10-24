import { computed, Injectable, signal } from '@angular/core';
import { externalId, WorldModel } from '../engines/world-model';
import type { AuditEntry, Entity, WorldEvent } from '../engines/world-model';
import type { Task } from '../models/task.model';
import type { ProjectRef, WorldContext } from './context-plan.service';
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

  readonly projectEntities = computed(() => {
    this.revision();
    return this.world
      .view('graph')
      .query({ type: 'project' })
      .filter((entity) => entity.state === 'active');
  });

  readonly planDrafts = computed(() => {
    this.revision();
    return this.world
      .view('graph')
      .query({ type: 'plan_draft' })
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
      existing.attrs['completed'] === task.completed &&
      existing.attrs['projectId'] === task.projectId
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
        projectId: task.projectId,
        projectName: task.projectName,
      },
      source: { kind: 'user', by: 'local-user', at: new Date().toISOString() },
    });

    if (task.projectId) {
      this.world.relateSync({
        from: this.projectEntityId(task.projectId),
        to: id,
        type: 'contains',
        source: { kind: 'user', by: 'local-user', at: new Date().toISOString() },
      });
    }

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

  upsertProject(project: ProjectRef): void {
    const id = this.projectEntityId(project.id);
    const existing = this.world.view('graph').entity(id);

    if (existing && existing.state === 'active' && existing.name === project.name) {
      return;
    }

    this.world.upsertEntitySync({
      type: 'project',
      externalKey: { system: 'todo', id: project.id },
      name: project.name,
      attrs: { projectId: project.id, name: project.name },
      source: { kind: 'user', by: 'local-user', at: new Date().toISOString() },
    });
    this.revision.update((value) => value + 1);
  }

  archiveProject(projectId: string): void {
    try {
      this.world.tombstoneSync(this.projectEntityId(projectId), 'project deleted', {
        kind: 'user',
        by: 'local-user',
        at: new Date().toISOString(),
      });
      this.revision.update((value) => value + 1);
    } catch {
      // Nothing to archive.
    }
  }

  upsertPlanDraft(draft: {
    id: string;
    goal: string;
    runId: string;
    selected: boolean;
    output: string;
  }): Entity {
    const entity = this.world.upsertEntitySync({
      type: 'plan_draft',
      externalKey: { system: 'todo', id: draft.id },
      name: `Plan draft ${draft.runId}`,
      attrs: {
        goal: draft.goal,
        runId: draft.runId,
        selected: draft.selected,
        output: draft.output,
      },
      source: { kind: 'agent', by: 'local-user', at: new Date().toISOString() },
    });
    this.revision.update((value) => value + 1);
    return entity;
  }

  selectPlanDraft(id: string): void {
    for (const draft of this.planDrafts()) {
      const runId = String(draft.attrs['runId'] ?? '');
      const selected = runId === id;
      if (draft.attrs['selected'] === selected) {
        continue;
      }
      this.upsertPlanDraft({
        id: runId,
        goal: String(draft.attrs['goal'] ?? ''),
        runId,
        selected,
        output: String(draft.attrs['output'] ?? ''),
      });
    }
  }

  linkTaskToProject(task: Task, projectId: string): void {
    if (!task.projectId) {
      return;
    }

    this.world.relateSync({
      from: this.projectEntityId(projectId),
      to: this.entityId(task.id),
      type: 'contains',
      source: { kind: 'user', by: 'local-user', at: new Date().toISOString() },
    });
    this.revision.update((value) => value + 1);
  }

  projectSummaries(): ProjectRef[] {
    return this.projectEntities().map((entity) => ({
      id: (entity.attrs['projectId'] as string | undefined) ?? entity.id,
      name: entity.name ?? entity.id,
    }));
  }

  tasksForProject(projectId: string): Entity[] {
    return this.world
      .view('graph')
      .neighborsOf(this.projectEntityId(projectId), { via: 'contains' })
      .filter((entity) => entity.type === 'task' && entity.state === 'active');
  }

  projectFor(task: Task): Entity | undefined {
    return this.world
      .view('graph')
      .incoming(this.entityId(task.id), { via: 'contains' })
      .find((entity) => entity.type === 'project');
  }

  buildPromptContext(
    opts: {
      subjectId?: string;
      limit?: number;
      include?: string[];
      maxChars?: number;
    } = {},
  ): WorldContext {
    const graph = this.world.view('graph');
    const limit = opts.limit ?? 12;
    const maxChars = opts.maxChars ?? 8000;
    const focus = opts.subjectId ? graph.entity(opts.subjectId) : undefined;
    const ordered: Entity[] = [];

    if (focus) {
      ordered.push(focus);
      if (focus.type === 'project') {
        ordered.push(...graph.neighborsOf(focus.id, { via: 'contains' }));
      } else {
        ordered.push(...graph.incoming(focus.id, { via: 'contains' }));
      }
    }

    ordered.push(...this.projectEntities(), ...this.taskEntities());

    const seen = new Set<string>();
    const entities = ordered.filter((entity) => {
      if (entity.state !== 'active' || seen.has(entity.id)) {
        return false;
      }
      seen.add(entity.id);
      return true;
    });

    const shown = entities.slice(0, limit);
    const projects = shown.filter((entity) => entity.type === 'project');
    const tasks = shown.filter((entity) => entity.type === 'task');
    const lines = [
      `World state: ${this.taskEntities().length} active task(s), ${this.projectEntities().length} project(s).`,
    ];

    for (const project of projects) {
      lines.push(`- Project "${project.name ?? project.id}" (${project.id})`);
    }

    for (const task of tasks) {
      const completed = task.attrs['completed'] === true;
      const project = task.attrs['projectName']
        ? ` project="${String(task.attrs['projectName'])}"`
        : '';
      lines.push(
        `- Task "${task.name ?? task.id}" [${completed ? 'completed' : 'active'}]${project} (${task.id})`,
      );
    }

    if (focus?.type === 'project') {
      for (const task of graph.neighborsOf(focus.id, { via: 'contains' })) {
        lines.push(
          `- Relation: project "${focus.name ?? focus.id}" contains task "${task.name ?? task.id}".`,
        );
      }
    } else if (focus?.type === 'task') {
      for (const project of graph.incoming(focus.id, { via: 'contains' })) {
        lines.push(
          `- Relation: project "${project.name ?? project.id}" contains task "${focus.name ?? focus.id}".`,
        );
      }
    }

    const full = lines.join('\n');
    const text =
      full.length > maxChars ? `${full.slice(0, maxChars)}\n[WORLD CONTEXT TRUNCATED]` : full;

    return {
      text,
      entityIds: shown.map((entity) => entity.id),
      entityCount: shown.length,
      truncated: text.length !== full.length,
    };
  }

  subscribe(listener: (event: WorldEvent) => void): () => void {
    return this.world.view('timeline').subscribe((event) => {
      this.revision.update((value) => value + 1);
      listener(event);
    });
  }

  entityFor(task: Task): Entity | undefined {
    return this.world.view('graph').entity(this.entityId(task.id));
  }

  projectEntityId(projectId: string): string {
    return externalId('project', 'todo', projectId);
  }

  private entityId(taskId: string): string {
    return externalId('task', 'todo', taskId);
  }
}
