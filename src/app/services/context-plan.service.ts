import { Injectable } from '@angular/core';
import type { IntentCandidate } from '../engines/scout';
import { externalId } from '../engines/world-model';

export type ContextSource = 'memory' | 'world';

export interface ProjectRef {
  id: string;
  name: string;
}

export interface ContextPlan {
  sources: ContextSource[];
  topN: number;
  maxTokens: number;
  maxChunks: number;
  subjectId?: string;
  projectId?: string;
  relations: string[];
  redactionPolicy: 'default_internal';
  reason: string;
}

export interface MemoryContext {
  text: string;
  ids: string[];
  count: number;
}

export interface WorldContext {
  text: string;
  entityIds: string[];
  entityCount: number;
  truncated: boolean;
}

export interface PlanningContext {
  memory: MemoryContext;
  world: WorldContext;
  contextPlan: ContextPlan;
}

const VAGUE_MARKERS =
  /\b(usual|again|like before|same as before|my preference|remember|as i said)\b/i;
const DEICTIC_MARKERS = /\b(it|that|this|the report|this task|that task|the thing)\b/i;

@Injectable({ providedIn: 'root' })
export class ContextPlanService {
  plan(prompt: string, candidates: IntentCandidate[], projects: ProjectRef[] = []): ContextPlan {
    const intent = candidates[0]?.intent ?? 'GENERAL';
    const project = projects.find((item) => this.mentions(prompt, item.name));
    const sources = new Set<ContextSource>();
    let topN = 0;
    let maxTokens = 0;
    let maxChunks = 1;
    let reason = `No extra context requested for ${intent}.`;

    switch (intent) {
      case 'task.plan':
        sources.add('memory');
        sources.add('world');
        topN = 8;
        maxTokens = 8000;
        maxChunks = 4;
        reason = 'Planning needs remembered preferences and the current task world.';
        break;
      case 'task.research':
        sources.add('memory');
        sources.add('world');
        topN = 8;
        maxTokens = 8000;
        maxChunks = 6;
        reason = 'Research needs prior findings and the current task world.';
        break;
      case 'task.compare':
        sources.add('memory');
        sources.add('world');
        topN = 8;
        maxTokens = 8000;
        maxChunks = 4;
        reason = 'Plan comparison needs one shared memory and world snapshot.';
        break;
      case 'task.list':
      case 'task.summary':
        sources.add('world');
        maxTokens = 2000;
        reason = 'Listing and summarizing need the current task world.';
        break;
      case 'task.complete':
      case 'task.uncomplete':
      case 'task.delete':
      case 'task.rename':
        sources.add('world');
        maxTokens = 1500;
        reason = 'Task resolution needs the current task world.';
        break;
      case 'memory.recall':
        sources.add('memory');
        topN = 8;
        maxTokens = 4000;
        reason = 'The user asked for memory, so recall is the primary context.';
        break;
      case 'memory.remember':
      case 'memory.forget':
      case 'task.add':
      case 'task.filter':
      case 'GENERAL':
        reason = `No extra context requested for ${intent}.`;
        break;
      default:
        reason = `Unknown intent ${intent}; no speculative context is loaded.`;
    }

    if (VAGUE_MARKERS.test(prompt)) {
      sources.add('memory');
      topN = Math.max(topN, 8);
      maxTokens = Math.max(maxTokens, 4000);
      reason = `${reason} Vague reference detected, so memory is included.`;
    }

    if (DEICTIC_MARKERS.test(prompt)) {
      sources.add('world');
      maxTokens = Math.max(maxTokens, 1500);
      reason = `${reason} Deictic task reference detected, so the world is included.`;
    }

    if (project) {
      sources.add('memory');
      sources.add('world');
      topN = Math.max(topN, 8);
      maxTokens = Math.max(maxTokens, 4000);
      reason = `${reason} Project "${project.name}" detected.`;
    }

    return {
      sources: [...sources],
      topN,
      maxTokens,
      maxChunks,
      subjectId: project ? externalId('project', 'todo', project.id) : undefined,
      projectId: project?.id,
      relations: project ? ['contains'] : [],
      redactionPolicy: 'default_internal',
      reason,
    };
  }

  private mentions(prompt: string, name: string): boolean {
    const normalized = name.trim().toLowerCase();
    if (normalized.length < 3) {
      return false;
    }
    return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, 'i').test(prompt);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
