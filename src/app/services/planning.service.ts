import { computed, Injectable, signal } from '@angular/core';
import { Markovian } from '../engines/markovian';
import type { MarkovianRun } from '../engines/markovian';
import { readJson, writeJson } from './persistence';

const MARKOVIAN_KEY = 'angular-todo-app.markovian.v1';

@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly revision = signal(0);
  private readonly markovian = new Markovian({
    chunkConfig: { maxChunks: 4 },
    persistence: {
      load: () => readJson<MarkovianRun[]>(MARKOVIAN_KEY),
      save: (runs) => writeJson(MARKOVIAN_KEY, runs),
    },
  });

  readonly lastPlan = signal<MarkovianRun | null>(null);

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
