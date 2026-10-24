import { inject, Injectable, signal } from '@angular/core';
import type { Decision } from '../engines/scout';
import type { Task } from '../models/task.model';
import { AssistantPipelineService } from './assistant-pipeline.service';
import type { AssistantTrace, PipelineDecision } from './assistant-pipeline.service';
import { MemoryService } from './memory.service';
import { readJson, writeJson } from './persistence';
import { ContractRefusalError, PlanningService } from './planning.service';
import { TaskStore } from './task-store';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
  tone?: 'normal' | 'success' | 'error';
}

const TRACE_KEY = 'angular-todo-app.trace.v1';

export interface PendingAction {
  pipeline: PipelineDecision;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly pipeline = inject(AssistantPipelineService);
  private readonly tasks = inject(TaskStore);
  private readonly memory = inject(MemoryService);
  private readonly planning = inject(PlanningService);

  readonly lastPlan = this.planning.lastPlan;
  readonly lastTrace = signal<AssistantTrace | null>(readJson<AssistantTrace>(TRACE_KEY) ?? null);
  readonly messages = signal<AssistantMessage[]>([]);
  readonly busy = signal(false);
  readonly pending = signal<PendingAction | null>(null);

  async submit(raw: string): Promise<void> {
    const text = raw.trim();

    if (!text || this.busy()) {
      return;
    }

    this.push('user', text);

    const choice = text.match(/^(?:use\s+)?(?:option\s+)?([1-9])$/i);
    if (!this.pending() && choice && this.planning.lastAlternatives().length > 0) {
      this.busy.set(true);
      try {
        const run = this.planning.selectAlternative(Number(choice[1]) - 1);
        this.push(
          'assistant',
          run ? run.output : 'That option does not exist.',
          run ? `Markovian ${run.id} · selected option ${choice[1]}` : undefined,
          run ? 'success' : 'error',
        );
      } finally {
        this.busy.set(false);
      }
      return;
    }

    if (this.pending()) {
      if (/^(confirm|yes|do it|approve)\b/i.test(text)) {
        await this.confirm();
        return;
      }

      if (/^(cancel|no|stop)\b/i.test(text)) {
        this.cancel();
        return;
      }

      this.pending.set(null);
    }

    this.busy.set(true);

    try {
      const pipeline = await this.pipeline.decide(text);
      const { decision } = pipeline;
      this.setTrace(pipeline.trace);

      if (decision.clarification) {
        this.push('assistant', decision.clarification.question, this.meta(pipeline));
        return;
      }

      if (decision.risk.level === 'block') {
        this.push(
          'assistant',
          `I cannot run that request: ${decision.risk.reason ?? 'it was blocked by policy'}.`,
          this.meta(pipeline),
          'error',
        );
        return;
      }

      if (decision.risk.level === 'high') {
        this.pending.set({ pipeline, label: this.describe(decision) });
        this.push(
          'assistant',
          `This is a high-risk action: ${this.describe(decision)}. Confirm to proceed.`,
          this.meta(pipeline),
        );
        return;
      }

      await this.execute(pipeline);
      this.finishTrace();
    } catch (error) {
      if (error instanceof ContractRefusalError) {
        this.lastTrace.update((trace) =>
          trace ? { ...trace, route: 'refused', stages: [...trace.stages, 'refused'] } : trace,
        );
        this.push('assistant', `I cannot run that plan: ${error.message}`, undefined, 'error');
        return;
      }
      this.push(
        'assistant',
        `Something went wrong: ${(error as Error).message}`,
        undefined,
        'error',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async confirm(): Promise<void> {
    const pending = this.pending();

    if (!pending) {
      return;
    }

    this.pending.set(null);
    this.busy.set(true);

    try {
      await this.execute(pending.pipeline);
      this.finishTrace();
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.pending.set(null);
    this.push('assistant', 'Cancelled. Nothing was changed.');
  }

  private async execute(pipeline: PipelineDecision): Promise<void> {
    const { decision } = pipeline;
    const id = decision.intent.primary.id;
    const params = decision.intent.primary.parameters;
    const meta = this.meta(pipeline);

    switch (id) {
      case 'task.add': {
        const title = this.stringParam(params['title']);
        if (!title) {
          this.push('assistant', 'What should the task say?', meta);
          return;
        }
        this.tasks.add(title);
        this.push('assistant', `Added “${title}”.`, meta, 'success');
        return;
      }

      case 'task.complete':
      case 'task.uncomplete': {
        const task = this.findTask(this.stringParam(params['task']));
        if (!task) {
          this.push('assistant', 'I could not find that task. Try naming it more precisely.', meta);
          return;
        }
        const shouldComplete = id === 'task.complete';
        if (task.completed !== shouldComplete) {
          this.tasks.toggle(task.id);
        }
        this.push(
          'assistant',
          `${shouldComplete ? 'Completed' : 'Reopened'} “${task.title}”.`,
          meta,
          'success',
        );
        return;
      }

      case 'task.delete': {
        const scope = this.stringParam(params['scope']);
        if (scope === 'all' || scope === 'completed') {
          const targets =
            scope === 'all'
              ? [...this.tasks.tasks()]
              : this.tasks.tasks().filter((task) => task.completed);
          for (const task of targets) {
            this.tasks.remove(task.id);
          }
          this.push(
            'assistant',
            `Deleted ${targets.length} ${targets.length === 1 ? 'task' : 'tasks'} (${scope}).`,
            meta,
            'success',
          );
          return;
        }

        const task = this.findTask(this.stringParam(params['task']));
        if (!task) {
          this.push('assistant', 'I could not find that task to delete.', meta);
          return;
        }
        this.tasks.remove(task.id);
        this.push('assistant', `Deleted “${task.title}”.`, meta, 'success');
        return;
      }

      case 'task.rename': {
        const task = this.findTask(this.stringParam(params['task']));
        const title = this.stringParam(params['title']);
        if (!task || !title) {
          this.push('assistant', 'Tell me which task to rename and the new title.', meta);
          return;
        }
        this.tasks.rename(task.id, title);
        this.push('assistant', `Renamed “${task.title}” to “${title}”.`, meta, 'success');
        return;
      }

      case 'task.list': {
        const list = this.tasks.tasks();
        if (list.length === 0) {
          this.push('assistant', 'Your list is empty.', meta);
          return;
        }
        const lines = list.map((task) => `${task.completed ? '✓' : '○'} ${task.title}`);
        this.push('assistant', lines.join('\n'), meta);
        return;
      }

      case 'task.filter': {
        const filter = this.stringParam(params['filter']);
        if (filter !== 'active' && filter !== 'completed' && filter !== 'all') {
          this.push('assistant', 'Show all, active, or completed tasks?', meta);
          return;
        }
        this.tasks.setFilter(filter);
        this.push('assistant', `Showing ${filter} tasks.`, meta, 'success');
        return;
      }

      case 'task.summary': {
        const counts = this.tasks.counts();
        this.push(
          'assistant',
          `${counts.all} total · ${counts.active} active · ${counts.completed} completed.`,
          meta,
        );
        return;
      }

      case 'task.plan': {
        const goal = this.stringParam(params['goal']) ?? decision.prompt;
        const run = await this.planning.planFromContract(decision, pipeline, goal);
        this.push(
          'assistant',
          run.output,
          `${meta} · Markovian ${run.id} · ${run.efficiencyPercent}% efficient`,
          'success',
        );
        return;
      }

      case 'task.research': {
        const topic = this.stringParam(params['topic']) ?? decision.prompt;
        const run = await this.planning.planFromContract(decision, pipeline, topic);
        this.push(
          'assistant',
          run.output,
          `${meta} · Markovian ${run.id} · ${run.efficiencyPercent}% efficient`,
          'success',
        );
        return;
      }

      case 'task.compare': {
        const goal = this.stringParam(params['goal']) ?? decision.prompt;
        const runs = await this.planning.planAlternatives(decision, pipeline, 3, goal);
        const lines = runs.map((run, index) => {
          const first = run.output.split('\n').find((line) => line.trim().length > 0) ?? 'Plan';
          return `${index + 1}. ${first}`;
        });
        this.push(
          'assistant',
          ['Here are three plan options:', ...lines, '', 'Ask me to use option 1, 2, or 3.'].join(
            '\n',
          ),
          `${meta} · ${runs.length} alternatives`,
          'success',
        );
        return;
      }

      case 'memory.remember': {
        const content = this.stringParam(params['content']);
        if (!content) {
          this.push('assistant', 'What should I remember?', meta);
          return;
        }
        const project = this.tasks.projectFilter();
        this.memory.remember(content, project === 'all' ? undefined : { project });
        this.push('assistant', `Remembered: ${content}`, meta, 'success');
        return;
      }

      case 'memory.recall': {
        const result = this.memory.recall(this.stringParam(params['query']) ?? decision.prompt);
        if (result.memories.length > 0) {
          const lines = result.memories.map(
            ({ memory, relevance }) =>
              `• ${memory.content} (${Math.round(relevance * 100)}% relevant)`,
          );
          this.push('assistant', lines.join('\n'), meta);
          return;
        }

        const recent = this.memory.memories().slice(0, 5);
        if (recent.length === 0) {
          this.push('assistant', 'I do not have a relevant memory yet.', meta);
          return;
        }

        this.push(
          'assistant',
          [
            'No strong match, so here is what I remember:',
            ...recent.map((item) => `• ${item.content}`),
          ].join('\n'),
          meta,
        );
        return;
      }

      case 'memory.forget': {
        const query = this.stringParam(params['query']);
        const removed = query ? this.memory.forget(query) : undefined;
        this.push(
          'assistant',
          removed ? `Forgot: ${removed.content}` : 'I could not find a memory to forget.',
          meta,
          removed ? 'success' : 'normal',
        );
        return;
      }

      default: {
        if (pipeline.contextPlan.sources.includes('memory') && pipeline.memory.count > 0) {
          const lines = pipeline.memory.text.split('\n').filter((line) => line.startsWith('- '));
          this.push('assistant', ['From memory:', ...lines].join('\n'), meta);
          return;
        }

        this.push(
          'assistant',
          'I can add, complete, reopen, rename, delete, filter, and summarize tasks; plan a goal; research a topic; compare plans; and remember or recall notes.',
          meta,
        );
      }
    }
  }

  private finishTrace(): void {
    const trace = this.lastTrace();
    if (!trace || trace.stages.includes('execution')) {
      return;
    }

    this.setTrace({
      ...trace,
      stages: [...trace.stages, 'execution', 'memory-write'],
      durationMs: Date.now() - trace.startedAt,
    });
  }

  private setTrace(trace: AssistantTrace | null): void {
    this.lastTrace.set(trace);
    if (trace) {
      writeJson(TRACE_KEY, trace);
    }
  }

  private findTask(query: string | undefined): Task | undefined {
    const normalized = (query ?? '')
      .toLowerCase()
      .replace(/\b(task|to-?do)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return undefined;
    }

    const tasks = this.tasks.tasks();
    return (
      tasks.find((task) => task.title.toLowerCase() === normalized) ??
      tasks.find((task) => task.title.toLowerCase().includes(normalized)) ??
      tasks.find((task) => normalized.includes(task.title.toLowerCase()))
    );
  }

  private describe(decision: Decision): string {
    const id = decision.intent.primary.id;

    if (id === 'task.delete') {
      const scope = this.stringParam(decision.intent.primary.parameters['scope']);
      if (scope === 'all') return 'delete every task';
      if (scope === 'completed') return 'delete all completed tasks';
      return `delete “${this.stringParam(decision.intent.primary.parameters['task']) ?? 'the task'}”`;
    }

    return id.replace('.', ' ');
  }

  private meta(pipeline: PipelineDecision): string {
    const { decision, trace } = pipeline;
    return `Scout → ${decision.intent.primary.id} · ${Math.round(
      decision.intent.primary.confidence * 100,
    )}% · ${decision.risk.level} risk · ${trace.route} · ${trace.memoryIds.length} memory · ${
      trace.worldEntityIds.length
    } world`;
  }

  private stringParam(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private push(
    role: AssistantMessage['role'],
    text: string,
    meta?: string,
    tone: AssistantMessage['tone'] = 'normal',
  ): void {
    this.messages.update((messages) => [
      ...messages,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        role,
        text,
        meta,
        tone,
      },
    ]);
  }
}
