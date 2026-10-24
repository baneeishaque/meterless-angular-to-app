import { computed, Injectable, signal } from '@angular/core';
import { HMEM } from '../engines/hmem';
import type { HMEMSnapshot, MemoryRecord, QueryResult } from '../engines/hmem';
import type { Entity } from '../engines/world-model';
import type { MarkovianRun } from '../engines/markovian';
import type { MemoryContext } from './context-plan.service';
import { readJson, writeJson } from './persistence';

const MEMORY_KEY = 'angular-todo-app.hmem.v1';

@Injectable({ providedIn: 'root' })
export class MemoryService {
  private readonly revision = signal(0);
  private readonly hmem = new HMEM({
    actor: 'local-user',
    persistence: {
      load: () => readJson<HMEMSnapshot>(MEMORY_KEY),
      save: (snapshot) => writeJson(MEMORY_KEY, snapshot),
    },
  });

  readonly memories = computed<readonly MemoryRecord[]>(() => {
    this.revision();
    return this.hmem.store
      .all()
      .filter((memory) => !memory.supersededBy)
      .sort((left, right) => right.timestamp - left.timestamp);
  });

  readonly count = computed(() => this.memories().length);

  remember(content: string, opts?: { project?: string }): MemoryRecord | undefined {
    const trimmed = content.trim();

    if (!trimmed) {
      return undefined;
    }

    const tags = ['user', 'explicit'];
    if (opts?.project) {
      tags.push(`project:${opts.project}`);
    }

    const record = this.hmem.add({
      content: trimmed,
      type: /\b(prefer|like|love|hate|dislike)\b/i.test(trimmed) ? 'preference' : 'general',
      layer: 'long_term',
      tags,
      confidence: 0.8,
      source: 'user',
    });
    this.revision.update((value) => value + 1);
    return record;
  }

  recall(query: string): QueryResult {
    const result = this.hmem.query(query, { threshold: 0.2, topN: 5 });
    this.hmem.store.persist();
    this.revision.update((value) => value + 1);
    return result;
  }

  recallForPlan(query: string, topN = 8, opts: { projectId?: string } = {}): MemoryContext {
    const result = this.hmem.query(query, { threshold: 0.2, topN });
    this.hmem.store.persist();
    this.revision.update((value) => value + 1);

    const projectTag = opts.projectId ? `project:${opts.projectId}` : undefined;
    const selected = projectTag
      ? result.memories.filter(
          ({ memory }) =>
            memory.tags.includes(projectTag) ||
            !memory.tags.some((tag) => tag.startsWith('project:')),
        )
      : result.memories;

    if (selected.length > 0) {
      return {
        text:
          selected.length === result.memories.length
            ? result.context
            : ['[MEMORY CONTEXT]', ...selected.map(({ memory }) => `- ${memory.content}`)].join(
                '\n',
              ),
        ids: selected.map(({ memory }) => memory.id),
        count: selected.length,
      };
    }

    const recent = this.memories()
      .filter(
        (memory) =>
          !projectTag ||
          memory.tags.includes(projectTag) ||
          !memory.tags.some((tag) => tag.startsWith('project:')),
      )
      .slice(0, Math.min(3, topN));
    return {
      text:
        recent.length > 0
          ? ['[MEMORY CONTEXT]', ...recent.map((memory) => `- ${memory.content}`)].join('\n')
          : '',
      ids: recent.map((memory) => memory.id),
      count: recent.length,
    };
  }

  forget(query: string): MemoryRecord | undefined {
    const result = this.recall(query);
    const target = result.memories[0]?.memory;

    if (!target) {
      return undefined;
    }

    this.hmem.store.delete(target.id, `user requested: ${query}`);
    this.revision.update((value) => value + 1);
    return target;
  }

  delete(id: string): void {
    this.hmem.store.delete(id, 'removed from memory panel');
    this.revision.update((value) => value + 1);
  }

  findBySource(source: string): MemoryRecord | undefined {
    return this.hmem.store.all().find((memory) => memory.source === source);
  }

  updateBySource(
    source: string,
    content: string,
    patch: Partial<MemoryRecord> = {},
  ): MemoryRecord | undefined {
    const existing = this.findBySource(source);
    if (!existing) {
      return undefined;
    }

    const updated = this.hmem.store.updateContent(existing.id, content, patch);
    this.revision.update((value) => value + 1);
    return updated;
  }

  upsertWorldFact(entity: Entity): MemoryRecord {
    const source = `world:${entity.id}`;
    const existing = this.findBySource(source);
    const completed = entity.attrs['completed'] === true;
    const content =
      entity.type === 'project'
        ? `Project "${entity.name ?? entity.id}" exists.`
        : `Task "${entity.name ?? entity.id}" is ${completed ? 'completed' : 'active'}.`;
    const tags = ['world', `world:${entity.type}`, `${entity.type}:${entity.id}`];
    const provenance = {
      origin: 'world_model' as const,
      learnedAt: parseTime(entity.updatedAt),
      label: 'World Model',
      refs: [entity.id],
    };

    if (existing) {
      const updated = this.hmem.store.updateContent(existing.id, content, {
        tags,
        confidence: 0.9,
        provenance,
      });
      this.revision.update((value) => value + 1);
      return updated;
    }

    const record = this.hmem.add({
      content,
      type: 'factual',
      layer: 'long_term',
      tags,
      confidence: 0.9,
      source,
      provenance,
    });
    this.revision.update((value) => value + 1);
    return record;
  }

  archiveWorldFact(targetId: string, at: string, reason?: string): MemoryRecord {
    const source = `world:${targetId}`;
    const existing = this.findBySource(source);
    const name = existing ? extractName(existing.content) : targetId;
    const content = `Task "${name}" was archived${reason ? `: ${reason}` : '.'}`;
    const tags = existing
      ? [...new Set([...existing.tags, 'archived'])]
      : ['world', 'world:task', 'archived'];
    const provenance = {
      origin: 'world_model' as const,
      learnedAt: parseTime(at),
      label: 'World Model',
      refs: [targetId],
    };

    if (existing) {
      const updated = this.hmem.store.updateContent(existing.id, content, {
        tags,
        provenance,
      });
      this.revision.update((value) => value + 1);
      return updated;
    }

    const record = this.hmem.add({
      content,
      type: 'factual',
      layer: 'long_term',
      tags,
      confidence: 0.9,
      source,
      provenance,
    });
    this.revision.update((value) => value + 1);
    return record;
  }

  recordPlanCompletion(run: MarkovianRun, goal: string): MemoryRecord {
    const source = `markovian:${run.id}`;
    const summary = run.output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
      .slice(0, 240);
    const content = `Completed plan for "${goal}": ${summary}`;
    const tags = ['plan_completion', 'markovian', `run:${run.id}`];
    const provenance = {
      origin: 'plan_completion' as const,
      learnedAt: Date.now(),
      label: 'Markovian plan completion',
      refs: [run.id],
    };
    const existing = this.findBySource(source);

    if (existing) {
      const updated = this.hmem.store.updateContent(existing.id, content, {
        tags,
        confidence: 0.75,
        provenance,
        goalRunId: run.id,
      });
      this.revision.update((value) => value + 1);
      return updated;
    }

    const record = this.hmem.add({
      content,
      type: 'factual',
      layer: 'long_term',
      tags,
      confidence: 0.75,
      source,
      provenance,
      goalRunId: run.id,
    });
    this.revision.update((value) => value + 1);
    return record;
  }
}

function parseTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function extractName(content: string): string {
  const match = content.match(/(?:Task|Project) "([^"]+)"/);
  return match?.[1] ?? content;
}
