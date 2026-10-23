import type { ConfidenceBand, IntentCandidate, IntentDefinition, IntentRegistry } from './types';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'could',
  'do',
  'does',
  'for',
  'from',
  'give',
  'has',
  'have',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'show',
  'so',
  'that',
  'the',
  'their',
  'them',
  'this',
  'to',
  'us',
  'was',
  'we',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function bandFor(score: number): ConfidenceBand {
  if (score >= 0.8) return 'high';
  if (score >= 0.55) return 'medium';
  if (score >= 0.4) return 'low';
  return 'reject';
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface IntentProfile {
  intent: IntentDefinition;
  phrases: string[];
  triggers: RegExp[];
  weights: Map<string, number>;
  exampleTokens: Set<string>[];
}

function addWeight(weights: Map<string, number>, token: string, weight: number): void {
  weights.set(token, Math.max(weights.get(token) ?? 0, weight));
}

export function buildProfiles(registry: IntentRegistry): IntentProfile[] {
  return registry.intents.map((intent) => {
    const weights = new Map<string, number>();
    const phrases = intent.examples.map(normalizeText).filter(Boolean);
    const triggers: RegExp[] = [];
    for (const trigger of intent.triggers ?? []) {
      try {
        triggers.push(new RegExp(trigger, 'i'));
      } catch {
        // A bad trigger is a registry bug; validation remains deterministic.
      }
    }

    for (const part of intent.id.split(/[.-]/)) {
      if (part.length > 1) addWeight(weights, part, 3);
    }
    addWeight(weights, intent.category, 1);
    for (const token of tokenize(intent.description)) addWeight(weights, token, 0.7);
    for (const example of intent.examples) {
      for (const token of tokenize(example)) addWeight(weights, token, 1.5);
    }
    for (const trigger of intent.triggers ?? []) {
      for (const token of tokenize(trigger.replace(/[\\^$.*+?()[\]{}|]/g, ' '))) {
        addWeight(weights, token, 1);
      }
    }

    return {
      intent,
      phrases,
      triggers,
      weights,
      exampleTokens: intent.examples.map((example) => new Set(tokenize(example))),
    };
  });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

function profileScore(
  profile: IntentProfile,
  prompt: string,
  promptNorm: string,
  promptTokens: Set<string>,
): number {
  if (promptNorm.length > 0) {
    for (const phrase of profile.phrases) {
      if (promptNorm === phrase) return 0.95;
      if (promptNorm.includes(phrase)) return 0.95;
      if (phrase.includes(promptNorm) && promptNorm.length >= 8) return 0.93;
    }
  }

  if (profile.triggers.some((trigger) => trigger.test(prompt))) {
    return 0.95;
  }

  let bestExample = 0;
  for (const exampleTokens of profile.exampleTokens) {
    bestExample = Math.max(bestExample, jaccard(promptTokens, exampleTokens));
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const [token, weight] of profile.weights) {
    totalWeight += weight;
    if (promptTokens.has(token)) matchedWeight += weight;
  }
  const idCoverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const promptCoverage =
    promptTokens.size > 0
      ? [...promptTokens].filter((token) => profile.weights.has(token)).length / promptTokens.size
      : 0;

  return clamp01(0.65 * bestExample + 0.25 * idCoverage + 0.1 * promptCoverage);
}

export function scoreIntent(
  profile: IntentProfile,
  prompt: string,
  promptNorm: string,
  promptTokens: Set<string>,
): number {
  return profileScore(profile, prompt, promptNorm, promptTokens);
}

export function classifyPrompt(
  profiles: IntentProfile[],
  prompt: string,
  options: { semanticScorer?: (prompt: string, intent: IntentDefinition) => number } = {},
): IntentCandidate[] {
  const promptNorm = normalizeText(prompt);
  const promptTokens = new Set(tokenize(prompt));
  const candidates: IntentCandidate[] = [];

  for (const profile of profiles) {
    let score = profileScore(profile, prompt, promptNorm, promptTokens);
    if (options.semanticScorer) {
      const semantic = clamp01(options.semanticScorer(prompt, profile.intent));
      score = clamp01(0.8 * score + 0.2 * semantic);
    }
    candidates.push({
      intent: profile.intent.id,
      score: Number(score.toFixed(4)),
      band: bandFor(score),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.intent.localeCompare(b.intent));
  return candidates;
}

export function findSpan(prompt: string, phrase: string): [number, number] | undefined {
  const index = prompt.toLowerCase().indexOf(phrase.toLowerCase());
  if (index < 0) return undefined;
  return [index, index + phrase.length];
}
