import { inject, Injectable } from '@angular/core';
import type { Decision } from '../engines/scout';
import { ContextPlanService } from './context-plan.service';
import type { ContextPlan, MemoryContext, WorldContext } from './context-plan.service';
import { MemoryService } from './memory.service';
import { ScoutService } from './scout.service';
import { WorldModelService } from './world-model.service';

export interface AssistantTrace {
  traceId: string;
  contractId: string;
  intent: string;
  confidence: number;
  risk: string;
  route: 'direct' | 'markovian' | 'refused';
  contextPlan: ContextPlan;
  memoryIds: string[];
  worldEntityIds: string[];
  startedAt: number;
  durationMs: number;
  stages: string[];
}

export interface PipelineDecision {
  decision: Decision;
  contextPlan: ContextPlan;
  memory: MemoryContext;
  world: WorldContext;
  trace: AssistantTrace;
}

const EMPTY_MEMORY: MemoryContext = { text: '', ids: [], count: 0 };
const EMPTY_WORLD: WorldContext = {
  text: '',
  entityIds: [],
  entityCount: 0,
  truncated: false,
};

@Injectable({ providedIn: 'root' })
export class AssistantPipelineService {
  private readonly scout = inject(ScoutService);
  private readonly contextPlans = inject(ContextPlanService);
  private readonly memory = inject(MemoryService);
  private readonly world = inject(WorldModelService);

  async decide(prompt: string): Promise<PipelineDecision> {
    const startedAt = Date.now();
    const candidates = await this.scout.classify(prompt);
    const contextPlan = this.contextPlans.plan(prompt, candidates, this.world.projectSummaries());
    const memory = contextPlan.sources.includes('memory')
      ? this.memory.recallForPlan(prompt, contextPlan.topN, {
          projectId: contextPlan.projectId,
        })
      : EMPTY_MEMORY;
    const world = contextPlan.sources.includes('world')
      ? this.world.buildPromptContext({
          subjectId: contextPlan.subjectId,
          limit: 12,
          include: contextPlan.relations,
          maxChars: contextPlan.maxTokens,
        })
      : EMPTY_WORLD;
    const decision = await this.scout.decide(prompt, { memory, world, contextPlan });
    const route = isMarkovianIntent(decision.intent.primary.id) ? 'markovian' : 'direct';
    const trace: AssistantTrace = {
      traceId: decision.executionContract.traceId,
      contractId: decision.executionContract.contractId,
      intent: decision.intent.primary.id,
      confidence: decision.intent.primary.confidence,
      risk: decision.risk.level,
      route,
      contextPlan,
      memoryIds: memory.ids,
      worldEntityIds: world.entityIds,
      startedAt,
      durationMs: Date.now() - startedAt,
      stages: ['context-plan', 'memory-recall', 'world-query', 'scout-decide', 'contract'],
    };

    return { decision, contextPlan, memory, world, trace };
  }
}

function isMarkovianIntent(intent: string): boolean {
  return intent === 'task.plan' || intent === 'task.research' || intent === 'task.compare';
}
