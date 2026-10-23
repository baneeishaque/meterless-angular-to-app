import { Injectable, signal } from '@angular/core';
import { Scout } from '../engines/scout';
import { APP_INTENT_REGISTRY } from '../engines/scout/app-registry';
import type { Decision } from '../engines/scout';

@Injectable({ providedIn: 'root' })
export class ScoutService {
  private readonly scout = new Scout({
    intentRegistry: APP_INTENT_REGISTRY,
    policyPack: ['default', 'adversarial-tight'],
    signingSecret: 'local-todo-app',
  });

  readonly lastDecision = signal<Decision | null>(null);

  async decide(prompt: string): Promise<Decision> {
    const decision = await this.scout.decide({
      prompt,
      surface: 'chat',
      user: { id: 'local-user', role: 'owner' },
    });

    this.lastDecision.set(decision);
    return decision;
  }

  verify(decision: Decision): boolean {
    return this.scout.verifyContract(decision.executionContract);
  }
}
