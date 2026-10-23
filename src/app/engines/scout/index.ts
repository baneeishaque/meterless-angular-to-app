import { canonicalJson, hmacSha256Hex } from '../shared/crypto';
import { normalizeRegistry } from './registry';
import { buildProfiles, bandFor, classifyPrompt, findSpan } from './scoring';
import { assessRisk, extractParameters } from './guard';
import type {
  BoundIntent,
  Clarification,
  ClarificationOption,
  ClassifyInput,
  Decision,
  DecisionInput,
  ExecutionContract,
  IntentCandidate,
  IntentDefinition,
  IntentRegistry,
  ReplanInput,
  ScoutOptions,
  ToolStep,
} from './types';

const DEFAULT_SECRET = 'scout-development-secret';
const CONTRACT_TTL_MS = 5 * 60 * 1000;

const TOOL_FOR_CAPABILITY: Record<string, string> = {
  'task.write': 'taskStore',
  'memory.write': 'memoryStore',
  'memory.recall': 'memoryStore',
  'markovian.chain': 'markovian',
  'world.query': 'worldModel',
  'world.assert': 'worldModel',
  'email.draft': 'emailDraft',
  'email.send': 'emailSend',
  'swarm.run': 'swarm',
  'approval.require': 'approval',
  'calendar.create': 'calendar',
};

interface CompositionResult {
  primary: IntentCandidate;
  secondary: IntentCandidate[];
}

export class Scout {
  readonly registry: IntentRegistry;
  readonly policyPack: string[];
  private readonly profiles: ReturnType<typeof buildProfiles>;
  private readonly secret: string;
  private readonly clock: () => number;
  private readonly semanticScorer?: ScoutOptions['semanticScorer'];
  private readonly lastDecisions = new Map<string, { input: DecisionInput; decision: Decision }>();
  private contractSeq = 0;

  constructor(options: ScoutOptions) {
    this.registry = normalizeRegistry(options.intentRegistry);
    this.policyPack = Array.isArray(options.policyPack)
      ? options.policyPack
      : options.policyPack
        ? [options.policyPack]
        : ['default'];
    this.profiles = buildProfiles(this.registry);
    this.secret = options.signingSecret ?? DEFAULT_SECRET;
    this.clock = options.clock ?? Date.now;
    this.semanticScorer = options.semanticScorer;
  }

  async classify(input: ClassifyInput): Promise<{ candidates: IntentCandidate[] }> {
    const candidates = classifyPrompt(this.profiles, input.prompt, {
      semanticScorer: this.semanticScorer,
    });
    return { candidates };
  }

  async decide(input: DecisionInput): Promise<Decision> {
    const started = this.clock();
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new Error('Scout: decide() needs a non-empty prompt');
    }

    const user = input.user ?? { id: 'anonymous', role: 'anonymous' };
    const surface = input.surface ?? 'chat';
    const fullCandidates = classifyPrompt(this.profiles, prompt, {
      semanticScorer: this.semanticScorer,
    });
    const composition = this.compose(prompt, fullCandidates);
    const candidates = this.mergeCandidates(composition, fullCandidates);
    const primaryCandidate = this.ensurePrimary(composition.primary, candidates);
    const intent = this.intentFor(primaryCandidate.intent);
    const parameters = extractParameters(intent, prompt);
    const risk = assessRisk({
      prompt,
      intent,
      user,
      surface,
      strict: this.policyPack.includes('adversarial-tight'),
    });

    const clarification = this.clarificationFor({
      prompt,
      intent,
      primaryCandidate,
      candidates,
      parameters,
      riskLevel: risk.level,
    });

    const toolPlan = risk.level === 'block' ? [] : this.route(intent, parameters);
    const boundIntent: BoundIntent = {
      primary: {
        id: intent.id,
        category: intent.category,
        confidence: primaryCandidate.score,
        band: primaryCandidate.band,
        parameters,
        references: {},
      },
      alternates: candidates.filter((candidate) => candidate.intent !== intent.id).slice(0, 4),
    };

    const contract = this.issueContract({
      boundIntent,
      risk,
      toolPlan,
      user,
      surface,
      registryVersion: this.registry.version,
    });

    const decision: Decision = {
      prompt,
      candidates,
      intent: boundIntent,
      risk,
      toolPlan,
      clarification,
      executionContract: contract,
      secondaryIntents: composition.secondary,
      latencyMs: Math.max(0, this.clock() - started),
    };

    this.lastDecisions.set(contract.contractId, { input, decision });
    return decision;
  }

  async replan(input: ReplanInput): Promise<Decision> {
    const previous = this.lastDecisions.get(input.parent);
    if (!previous) {
      throw new Error(`Scout: unknown parent contract ${input.parent}`);
    }
    const state = input.state as { prompt?: string } | undefined;
    const decision = await this.decide({
      ...previous.input,
      prompt: state?.prompt ?? previous.input.prompt,
    });
    const { signature: _signature, ...unsigned } = decision.executionContract;
    const resigned = this.sign({
      ...unsigned,
      parentId: input.parent,
    });
    decision.executionContract = resigned;
    this.lastDecisions.set(resigned.contractId, {
      input: { ...previous.input, prompt: state?.prompt ?? previous.input.prompt },
      decision,
    });
    return decision;
  }

  verifyContract(contract: ExecutionContract): boolean {
    const { signature, ...unsigned } = contract;
    const expected = hmacSha256Hex(this.secret, canonicalJson(unsigned));
    const expiresAt = Date.parse(contract.expiresAt);
    return signature === expected && Number.isFinite(expiresAt) && expiresAt >= this.clock();
  }

  private compose(prompt: string, fullCandidates: IntentCandidate[]): CompositionResult {
    const fullTop = fullCandidates[0];
    const clauses = prompt
      .split(/\s*(?:,\s*and\s+|,\s*|\s+and\s+|\s+then\s+)\s*/i)
      .map((clause) => clause.trim())
      .filter((clause) => clause.length >= 4);

    if (clauses.length < 2) {
      return { primary: fullTop, secondary: [] };
    }

    const clauseCandidates: { candidate: IntentCandidate; clause: string }[] = [];
    for (const clause of clauses) {
      const top = classifyPrompt(this.profiles, clause, {
        semanticScorer: this.semanticScorer,
      })[0];
      if (top && top.score >= 0.55 && top.intent !== 'GENERAL') {
        clauseCandidates.push({
          candidate: {
            ...top,
            span: findSpan(prompt, clause),
          },
          clause,
        });
      }
    }

    const distinct: { candidate: IntentCandidate; clause: string }[] = [];
    for (const item of clauseCandidates) {
      if (!distinct.some((existing) => existing.candidate.intent === item.candidate.intent)) {
        distinct.push(item);
      }
    }

    if (distinct.length < 2) {
      return { primary: fullTop, secondary: [] };
    }

    let primary = distinct[0].candidate;
    const primaryFull = fullCandidates.find((candidate) => candidate.intent === primary.intent);
    if (primaryFull && primaryFull.score > primary.score) {
      primary = primaryFull;
    }
    const primaryIntent = this.intentFor(primary.intent);
    const secondary = distinct
      .slice(1)
      .map((item) => item.candidate)
      .filter(
        (candidate) =>
          candidate.intent !== primary.intent &&
          candidate.intent !== 'GENERAL' &&
          !primaryIntent.capabilities.includes(candidate.intent),
      );

    return { primary, secondary };
  }

  private mergeCandidates(
    composition: CompositionResult,
    fullCandidates: IntentCandidate[],
  ): IntentCandidate[] {
    const byIntent = new Map<string, IntentCandidate>();
    for (const candidate of [composition.primary, ...composition.secondary, ...fullCandidates]) {
      const existing = byIntent.get(candidate.intent);
      if (!existing || candidate.score > existing.score) {
        byIntent.set(candidate.intent, candidate);
      }
    }
    const merged = [...byIntent.values()].sort(
      (a, b) => b.score - a.score || a.intent.localeCompare(b.intent),
    );
    const primary = merged.find((candidate) => candidate.intent === composition.primary.intent);
    if (primary) {
      return [primary, ...merged.filter((candidate) => candidate !== primary)];
    }
    return merged;
  }

  private ensurePrimary(
    candidate: IntentCandidate,
    candidates: IntentCandidate[],
  ): IntentCandidate {
    if (candidate.score >= 0.4) return candidate;
    const general = candidates.find((item) => item.intent === 'GENERAL');
    if (general) return general;
    return candidate;
  }

  private intentFor(id: string): IntentDefinition {
    const intent = this.registry.intents.find((item) => item.id === id);
    if (!intent) {
      throw new Error(`Scout: intent "${id}" is not in the registry`);
    }
    return intent;
  }

  private clarificationFor(args: {
    prompt: string;
    intent: IntentDefinition;
    primaryCandidate: IntentCandidate;
    candidates: IntentCandidate[];
    parameters: Record<string, unknown>;
    riskLevel: string;
  }): Clarification | undefined {
    if (args.riskLevel === 'block') return undefined;

    const vague = this.isVague(args.prompt);
    if (vague) {
      return this.makeClarification(
        vague === 'reference' ? 'reference-unresolved' : 'underspecified',
        vague === 'reference'
          ? 'I could not resolve which item you mean. Which one should I use?'
          : 'That request is underspecified. What would you like me to do?',
        args.candidates,
        args.prompt,
      );
    }

    const missing = this.missingRequired(args.intent, args.parameters);
    if (missing.length > 0) {
      return {
        trigger: 'params',
        question: `I need ${missing.join(', ')} before I can run ${args.intent.id}.`,
        options: [{ label: 'Use the full request', prompt: args.prompt }, { label: 'Cancel' }],
      };
    }

    if (args.intent.riskClass === 'high' && args.primaryCandidate.score < 0.95) {
      return this.makeClarification(
        'high-risk',
        `This is a high-risk action (${args.intent.id}). Did you mean it?`,
        args.candidates,
        args.prompt,
      );
    }

    if (args.primaryCandidate.score >= 0.4 && args.primaryCandidate.score < 0.55) {
      return this.makeClarification(
        'low-band',
        `I am not confident I understood. Did you mean ${args.intent.id}?`,
        args.candidates,
        args.prompt,
      );
    }

    const second = args.candidates.find((candidate) => candidate.intent !== args.intent.id);
    if (
      second &&
      args.primaryCandidate.band === 'medium' &&
      second.band === 'medium' &&
      Math.abs(args.primaryCandidate.score - second.score) < 0.05
    ) {
      return this.makeClarification(
        'tie',
        'Two possible intents are close. Which one did you mean?',
        args.candidates,
        args.prompt,
      );
    }

    return undefined;
  }

  private isVague(prompt: string): 'underspecified' | 'reference' | undefined {
    if (/\b(the thing|that thing|what we talked about|you know what i mean)\b/i.test(prompt)) {
      return 'reference';
    }
    if (/^(handle|do|deal with|sort out|take care of|look into)\b/i.test(prompt)) {
      return 'underspecified';
    }
    if (/^(fix|update|change)\s+(it|this|that)\b/i.test(prompt)) {
      return 'underspecified';
    }
    return undefined;
  }

  private missingRequired(intent: IntentDefinition, parameters: Record<string, unknown>): string[] {
    const required = intent.parameters.required ?? [];
    return required.filter((key) => {
      const value = parameters[key];
      return value === undefined || value === null || value === '';
    });
  }

  private makeClarification(
    trigger: Clarification['trigger'],
    question: string,
    candidates: IntentCandidate[],
    prompt: string,
  ): Clarification {
    const options: ClarificationOption[] = [];
    for (const candidate of candidates.slice(0, 3)) {
      const intent = this.registry.intents.find((item) => item.id === candidate.intent);
      if (!intent) continue;
      options.push({
        label: `${intent.id} — ${intent.description}`,
        intent: intent.id,
        prompt: intent.examples[0] ?? prompt,
      });
    }
    if (options.length === 0) {
      options.push({ label: 'Cancel' });
    }
    return { trigger, question, options: options.slice(0, 4) };
  }

  private route(intent: IntentDefinition, parameters: Record<string, unknown>): ToolStep[] {
    return intent.capabilities.map((capability) => ({
      capability,
      tool: TOOL_FOR_CAPABILITY[capability] ?? capability,
      input: parameters,
    }));
  }

  private issueContract(args: {
    boundIntent: BoundIntent;
    risk: Decision['risk'];
    toolPlan: ToolStep[];
    user: { id: string; role?: string };
    surface: string;
    registryVersion: number;
  }): ExecutionContract {
    const issuedAt = new Date(this.clock()).toISOString();
    const expiresAt = new Date(this.clock() + CONTRACT_TTL_MS).toISOString();
    const contractId = `contract-${this.clock().toString(36)}-${++this.contractSeq}`;
    const unsigned: Omit<ExecutionContract, 'signature'> = {
      contractId,
      traceId: `trace-${contractId}`,
      intent: args.boundIntent,
      risk: args.risk,
      toolPlan: args.toolPlan,
      modelProfile: {
        id: 'local-deterministic',
        provider: 'local',
        model: 'scout-rules-v1',
      },
      scope: {
        user: args.user,
        surface: args.surface,
        capabilities: args.toolPlan.map((step) => step.capability),
      },
      issuedAt,
      expiresAt,
      registryVersion: args.registryVersion,
      policyPackVersion: this.policyPack.join(','),
      signedBy: 'scout',
    };
    return this.sign(unsigned);
  }

  private sign(unsigned: Omit<ExecutionContract, 'signature'>): ExecutionContract {
    const signature = hmacSha256Hex(this.secret, canonicalJson(unsigned));
    return { ...unsigned, signature };
  }
}

export * from './types';
export { normalizeRegistry, findIntent } from './registry';
export { normalizeText, tokenize, bandFor, classifyPrompt, buildProfiles } from './scoring';
export { extractParameters, detectInjection, assessRisk } from './guard';
