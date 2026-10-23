import { computed, Injectable, signal } from '@angular/core';
import { HMEM } from '../engines/hmem';
import type { HMEMSnapshot, MemoryRecord, QueryResult } from '../engines/hmem';
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

  remember(content: string): MemoryRecord | undefined {
    const trimmed = content.trim();

    if (!trimmed) {
      return undefined;
    }

    const record = this.hmem.add({
      content: trimmed,
      type: /\b(prefer|like|love|hate|dislike)\b/i.test(trimmed) ? 'preference' : 'general',
      layer: 'long_term',
      tags: ['user', 'explicit'],
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
}
