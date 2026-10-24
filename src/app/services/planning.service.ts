import { computed, inject, Injectable, signal } from '@angular/core';
import { Markovian } from '../engines/markovian';
import type { MarkovianRun } from '../engines/markovian';
import type { Decision } from '../engines/scout';
import type { PlanningContext } from './context-plan.service';
import { MemoryService } from './memory.service';
import { WorldModelService } from './world-model.service';
import { readJson, writeJson } from './persistence';
import { ScoutService } from './scout.service';

const MARKOVIAN_KEY = 'angular-todo-app.markovian.v1';
const ALLOWED_PLAN_INTENTS = new Set(['task.plan', 'task.research', 'task.compare']);

export class ContractRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractRefusalError';
  }
}

@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly revision = signal(0);
  private readonly scout = inject(ScoutService);
  private readonly memory = inject(MemoryService);
  private readonly world = inject(WorldModelService);
  private readonly markovian = new Markovian({
    chunkConfig: { maxChunks: 4 },
    persistence: {
      load: () => readJson<MarkovianRun[]>(MARKOVIAN_KEY),
      save: (runs) => writeJson(MARKOVIAN_KEY, runs),
    },
  });

  readonly lastPlan = signal<MarkovianRun | null>(null);
  readonly lastAlternatives = signal<readonly MarkovianRun[]>([]);

  readonly runs = computed<readonly MarkovianRun[]>(() => {
    this.revision();
    return [...this.markovian.history.list()].reverse();
  });

  readonly stats = computed(() => {
    this.revision();
    return this.markovian.history.cumulativeStats();
  });

  async plan(goal: string): Promise<MarkovianRun> {
    const run = await this.markovian.run({
      goal,
      mode: 'ARCHITECT',
      reflect: false,
      stepFn: ({ goal: requestedGoal }) => ({ content: buildPlan(requestedGoal) }),
    });

    this.lastPlan.set(run);
    this.revision.update((value) => value + 1);
    return run;
  }

  async planFromContract(
    decision: Decision,
    context: PlanningContext,
    goal = decision.prompt,
  ): Promise<MarkovianRun> {
    this.assertContract(decision);
    const mode = decision.intent.primary.id === 'task.research' ? 'RESEARCH' : 'ARCHITECT';

    const run = await this.markovian.run({
      goal,
      mode,
      reflect: false,
      memoryContext: context.memory.text,
      chunkConfig: { maxChunks: context.contextPlan.maxChunks },
      stepFn: ({ goal: requestedGoal, carryover, step }) => ({
        content:
          step === 0
            ? buildGroundedPlan(requestedGoal, context, mode)
            : buildPlanContinuation(requestedGoal, carryover, mode),
      }),
    });

    this.lastPlan.set(run);
    this.revision.update((value) => value + 1);

    if (run.status === 'completed') {
      this.memory.recordPlanCompletion(run, goal);
    }

    return run;
  }

  async planAlternatives(
    decision: Decision,
    context: PlanningContext,
    count = 3,
    goal = decision.prompt,
  ): Promise<MarkovianRun[]> {
    this.assertContract(decision);
    const seeds = [
      'Prioritize the smallest safe next step.',
      'Prioritize the highest-leverage dependency first.',
      'Prioritize a reversible experiment that reduces uncertainty.',
    ].slice(0, Math.max(1, count));

    const runs = await Promise.all(
      seeds.map((seed, index) =>
        this.markovian.run({
          goal,
          mode: 'ARCHITECT',
          reflect: false,
          memoryContext: context.memory.text,
          chunkConfig: {
            maxChunks: Math.min(12, context.contextPlan.maxChunks + index),
          },
          stepFn: ({ goal: requestedGoal, carryover, step }) => ({
            content:
              step === 0
                ? buildGroundedPlan(requestedGoal, context, 'ARCHITECT', seed)
                : buildPlanContinuation(requestedGoal, carryover, 'ARCHITECT', seed),
          }),
        }),
      ),
    );

    for (const run of runs) {
      this.world.upsertPlanDraft({
        id: run.id,
        goal,
        runId: run.id,
        selected: false,
        output: run.output,
      });
    }

    this.lastAlternatives.set(runs);
    this.revision.update((value) => value + 1);
    return runs;
  }

  selectAlternative(index: number): MarkovianRun | undefined {
    const run = this.lastAlternatives()[index];
    if (!run) {
      return undefined;
    }

    this.lastPlan.set(run);
    this.world.selectPlanDraft(run.id);
    this.memory.recordPlanCompletion(run, run.prompt);
    this.revision.update((value) => value + 1);
    return run;
  }

  private assertContract(decision: Decision): void {
    const primary = decision.intent.primary.id;
    if (!ALLOWED_PLAN_INTENTS.has(primary)) {
      throw new ContractRefusalError(`Intent ${primary} cannot start a Markovian run.`);
    }
    if (!decision.executionContract.scope.capabilities.includes('markovian.chain')) {
      throw new ContractRefusalError('Contract does not grant the markovian.chain capability.');
    }
    if (decision.risk.level === 'block') {
      throw new ContractRefusalError('Contract risk is blocked.');
    }
    if (!this.scout.verifyContract(decision.executionContract)) {
      throw new ContractRefusalError('Contract signature is invalid or expired.');
    }
  }
}

function buildPlan(goal: string): string {
  const topic = goal
    .replace(/^.*?\bplan\b\s*(?:for|my|the)?\s*/i, '')
    .replace(/\b(break|this|that|it)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const subject = topic.length > 0 ? topic : 'the goal';

  return [
    `Plan for ${subject}`,
    '',
    `1. Define the finish line. Write one sentence that says what "done" means for ${subject}.`,
    '2. List the moving parts. Capture every dependency, decision, and unknown before sequencing work.',
    '3. Pick the first three actions. Keep each action small enough to finish in one focused block.',
    '4. Schedule the next review. Put a concrete date on the calendar and note what must be true by then.',
    '5. Capture the next action as a task so the plan leaves the chat and enters the list.',
    '',
    '[DONE]',
  ].join('\n');
}

function buildGroundedPlan(
  goal: string,
  context: PlanningContext,
  mode: 'ARCHITECT' | 'RESEARCH',
  seed?: string,
): string {
  const activeTasks = extractTaskNames(context.world.text);
  const taskLine =
    activeTasks.length > 0
      ? `Current tasks: ${activeTasks.slice(0, 3).join(', ')}.`
      : 'Current tasks: none yet.';
  const memoryLine =
    context.memory.count > 0
      ? `Remembered context: ${context.memory.count} relevant item(s).`
      : 'Remembered context: none relevant.';
  const memoryNotes = context.memory.text
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .slice(0, 3)
    .map((line) => line.slice(2).trim());
  const memoryDetail =
    memoryNotes.length > 0 ? `Memory notes: ${memoryNotes.join('; ')}.` : 'Memory notes: none.';
  const worldLine = `World state: ${context.world.entityCount} visible entity(s).`;
  const subjectGoal = cleanGoal(goal);
  const subject =
    mode === 'RESEARCH' ? `Research plan for ${subjectGoal}` : `Plan for ${subjectGoal}`;

  return [
    subject,
    '',
    `1. Ground the goal in reality. ${memoryLine} ${memoryDetail} ${worldLine} ${taskLine}`,
    `2. Define the finish line. Write one sentence that says what "done" means for ${subjectGoal}.`,
    `3. Sequence the work. List dependencies, unknowns, and the smallest safe next step.`,
    `4. Choose the first action. ${seed ?? 'Prefer the action that removes the most uncertainty.'}`,
    '5. Put the first action on the task list and schedule the next review.',
    '',
    '[STATE_CHECKPOINT]',
    'COMPLETED: context gathered; goal grounded in memory and world state.',
    'REMAINING: define the finish line; sequence dependencies; choose the first action.',
    `DECISIONS: ${seed ?? 'prefer the action that removes the most uncertainty'}.`,
    `CONTEXT: memory=${context.memory.ids.join(',') || 'none'}; world=${
      context.world.entityIds.join(',') || 'none'
    }.`,
    `goal=${goal}`,
    `memory=${context.memory.count}`,
    `world=${context.world.entityCount}`,
    `seed=${seed ?? 'default'}`,
  ].join('\n');
}

function buildPlanContinuation(
  goal: string,
  carryover: string,
  mode: 'ARCHITECT' | 'RESEARCH',
  seed?: string,
): string {
  const review = mode === 'RESEARCH' ? 'source notes and confidence' : 'the finish line';
  const checkpoint = (carryover || 'no checkpoint text')
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('CONTEXT:') &&
        !line.startsWith('memory=') &&
        !line.includes('Remembered context') &&
        !line.includes('Memory notes:'),
    )
    .join('\n');
  return [
    `Next actions for ${cleanGoal(goal)}`,
    '',
    `1. Review ${review} from the checkpoint: ${checkpoint}.`,
    `2. Turn the first action into a concrete task with a clear done condition.`,
    `3. Schedule a review and record what changed.`,
    `4. If ${seed ? 'the chosen option' : 'the plan'} is blocked, fall back to the smallest reversible step.`,
    '',
    '[TASK_COMPLETE]',
  ].join('\n');
}

function cleanGoal(goal: string): string {
  return (
    goal
      .replace(/^\s*(?:plan|research|investigate|look into)\b\s*(?:for\s+)?/i, '')
      .replace(/\s+/g, ' ')
      .trim() || goal
  );
}

function extractTaskNames(worldText: string): string[] {
  return [...worldText.matchAll(/- Task "([^"]+)"/g)].map((match) => match[1]);
}
