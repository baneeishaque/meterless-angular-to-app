// Append-only trust ledger (AGENTS.md section 9.1). Entries are never
// mutated or deleted. history() reconstructs a memory's full change record
// from the previousState/newState snapshots carried on each entry.

import type { LedgerAction, LedgerEntry, MemoryRecord } from './types';

export class TrustLedgerService {
  private entries: LedgerEntry[] = [];

  constructor(
    private clock: () => number,
    private onChange?: () => void,
  ) {}

  log(
    memoryId: string,
    action: LedgerAction,
    actor: string,
    extra?: {
      previousState?: Partial<MemoryRecord>;
      newState?: Partial<MemoryRecord>;
      details?: Record<string, unknown>;
    },
  ): LedgerEntry {
    const entry: LedgerEntry = { memoryId, action, actor, timestamp: this.clock(), ...extra };
    this.entries.push(entry);
    this.onChange?.();
    return entry;
  }

  history(memoryId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.memoryId === memoryId);
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  stats(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) out[e.action] = (out[e.action] ?? 0) + 1;
    return out;
  }

  snapshot(): LedgerEntry[] {
    return structuredClone(this.entries);
  }

  restoreAll(entries: LedgerEntry[]): void {
    this.entries = structuredClone(entries);
  }
}
