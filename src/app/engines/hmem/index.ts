// H-MEM reference implementation ported to a browser-safe core.
// Original implementation: Meterless H-MEM reference (Apache-2.0).
// Persistence is injected; the engine itself has no filesystem dependency.

import type {
  FeedbackKind,
  LedgerEntry,
  MemoryRecord,
  MiningEventType,
  QueryResult,
} from './types';
import type { AddInput } from './memoryStore';
import { MemoryStoreService } from './memoryStore';
import { TrustLedgerService } from './trustLedger';
import { MemoryMiningService } from './memoryMining';
import { MemoryRetrievalService } from './memoryRetrieval';
import { ConflictDetectionService } from './conflictDetection';
import { SleepCycleService } from './sleepCycle';
import { DreamingService } from './dreaming';

export * from './types';
export { MemoryStoreService } from './memoryStore';
export { TrustLedgerService } from './trustLedger';
export { MemoryMiningService, parseStrictJsonArray } from './memoryMining';
export { MemoryRetrievalService } from './memoryRetrieval';
export { ConflictDetectionService } from './conflictDetection';
export { SleepCycleService } from './sleepCycle';
export { DreamingService } from './dreaming';
export { embed, cosine, tokenize, jaccard } from './embeddings';

export interface HMEMSnapshot {
  store: { records: MemoryRecord[]; seq: number };
  ledger: LedgerEntry[];
}

export interface HMEMPersistence {
  load(): HMEMSnapshot | undefined;
  save(snapshot: HMEMSnapshot): void;
}

export interface HMEMRuntimeOptions {
  clock?: () => number;
  actor?: string;
  minerFn?: (prompt: string) => Promise<string>;
  persistence?: HMEMPersistence;
}

export class HMEM {
  readonly ledger: TrustLedgerService;
  readonly store: MemoryStoreService;
  readonly mining: MemoryMiningService;
  readonly retrieval: MemoryRetrievalService;
  readonly conflicts: ConflictDetectionService;
  readonly sleep: SleepCycleService;
  readonly dreaming: DreamingService;
  readonly clock: () => number;
  private readonly persistence?: HMEMPersistence;

  constructor(opts: HMEMRuntimeOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.persistence = opts.persistence;
    const actor = opts.actor ?? 'system';
    this.ledger = new TrustLedgerService(this.clock, () => this.persist());
    this.store = new MemoryStoreService(this.clock, this.ledger, actor, () => this.persist());
    this.mining = new MemoryMiningService(this.store, this.clock, opts.minerFn);
    this.retrieval = new MemoryRetrievalService(this.store, this.ledger, this.clock, actor);
    this.conflicts = new ConflictDetectionService(this.store, this.ledger, this.clock, actor);
    this.sleep = new SleepCycleService(this.store, this.ledger, this.clock, actor);
    this.dreaming = new DreamingService(this.store, this.ledger, this.clock, actor);

    const saved = this.persistence?.load();
    if (saved) this.importState(saved);
  }

  add(input: AddInput): MemoryRecord {
    return this.store.add(input);
  }

  mine(event: MiningEventType, text: string, opts?: { chatId?: string }): Promise<MemoryRecord[]> {
    return this.mining.mineInteraction(event, text, opts);
  }

  query(query: string, opts?: { topN?: number; threshold?: number; chatId?: string }): QueryResult {
    return this.retrieval.query(query, opts);
  }

  feedback(memoryId: string, kind: FeedbackKind): void {
    this.retrieval.feedback(memoryId, kind);
  }

  exportState(): HMEMSnapshot {
    return {
      store: this.store.snapshotAll(),
      ledger: this.ledger.snapshot(),
    };
  }

  importState(snapshot: HMEMSnapshot): void {
    this.ledger.restoreAll(snapshot.ledger);
    this.store.restoreAll(snapshot.store.records, snapshot.store.seq);
  }

  private persist(): void {
    this.persistence?.save(this.exportState());
  }
}
