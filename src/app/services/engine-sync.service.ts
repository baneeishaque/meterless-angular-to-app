import { inject, Injectable } from '@angular/core';
import type { Entity, Tombstone, WorldEvent } from '../engines/world-model';
import { MemoryService } from './memory.service';
import { WorldModelService } from './world-model.service';

@Injectable({ providedIn: 'root' })
export class EngineSyncService {
  private readonly world = inject(WorldModelService);
  private readonly memory = inject(MemoryService);
  private unsubscribe?: () => void;

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.world.subscribe((event) => this.apply(event));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private apply(event: WorldEvent): void {
    if (event.kind === 'upsertEntity') {
      const entity = event.payload as Entity;
      if (entity.type === 'task' || entity.type === 'project') {
        this.memory.upsertWorldFact(entity);
      }
      return;
    }

    if (event.kind === 'tombstone') {
      const tombstone = event.payload as Tombstone;
      this.memory.archiveWorldFact(tombstone.targetId, tombstone.at, tombstone.reason);
    }
  }
}
