import { inject, Injectable, signal } from '@angular/core';
import { Scout } from '../engines/scout';
import { APP_INTENT_REGISTRY } from '../engines/scout/app-registry';
import type { Decision, IntentDefinition } from '../engines/scout';
import { ContextPlanService } from './context-plan.service';
import type { ContextPlan, ProjectRef } from './context-plan.service';

@Injectable({ providedIn: 'root' })
export class ScoutService {
  private readonly contextPlans = inject(ContextPlanService);
  private readonly scout = new Scout({
    intentRegistry: APP_INTENT_REGISTRY,
    policyPack: ['default', 'adversarial-tight'],
    signingSecret: 'local-todo-app',
    contextualScorer: (prompt, intent, context) => this.contextualScore(prompt, intent, context),
  });

  readonly lastDecision = signal<Decision | null>(null);

  async classify(prompt: string, context?: unknown): Promise<Decision['candidates']> {
    const result = await this.scout.classify({ prompt, surface: 'chat', context });
    return result.candidates;
  }

  async planContext(prompt: string, projects: ProjectRef[] = []): Promise<ContextPlan> {
    const candidates = await this.classify(prompt);
    return this.contextPlans.plan(prompt, candidates, projects);
  }

  async decide(prompt: string, context?: unknown): Promise<Decision> {
    const decision = await this.scout.decide({
      prompt,
      surface: 'chat',
      user: { id: 'local-user', role: 'owner' },
      context,
    });

    this.lastDecision.set(decision);
    return decision;
  }

  verify(decision: Decision): boolean {
    return this.scout.verifyContract(decision.executionContract);
  }

  verifyContract(contract: Decision['executionContract']): boolean {
    return this.scout.verifyContract(contract);
  }

  private contextualScore(prompt: string, intent: IntentDefinition, context: unknown): number {
    const contextText = contextToString(context);
    if (!contextText) {
      return 0;
    }

    if (intent.id === 'task.compare' && /\b(compare|alternative|option)/i.test(prompt)) {
      return 1;
    }
    if (
      intent.id === 'task.research' &&
      /^\s*(research|investigate|look into|find out about)\b/i.test(prompt)
    ) {
      return 1;
    }
    if (
      intent.id === 'task.plan' &&
      /\bplan\b/i.test(prompt) &&
      !/\b(compare|alternative|option)/i.test(prompt)
    ) {
      return 1;
    }

    return 0;
  }
}

function contextToString(context: unknown): string {
  if (!context) {
    return '';
  }
  if (typeof context === 'string') {
    return context;
  }
  if (typeof context !== 'object') {
    return '';
  }

  const value = context as {
    memory?: { text?: string };
    world?: { text?: string };
    contextPlan?: ContextPlan;
  };

  return [value.memory?.text, value.world?.text].filter(Boolean).join('\n');
}
