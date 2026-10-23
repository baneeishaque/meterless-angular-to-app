import type { IntentDefinition, IntentRegistry } from './types';

export function normalizeRegistry(input: IntentRegistry | IntentDefinition[]): IntentRegistry {
  const registry = Array.isArray(input) ? { version: 1, intents: input } : input;

  if (!registry || !Array.isArray(registry.intents)) {
    throw new Error('Scout: intentRegistry must contain an intents array');
  }

  const seen = new Set<string>();
  for (const intent of registry.intents) {
    if (!intent.id || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(intent.id)) {
      throw new Error(`Scout: invalid intent id "${intent.id}"`);
    }
    if (seen.has(intent.id)) {
      throw new Error(`Scout: duplicate intent id "${intent.id}"`);
    }
    seen.add(intent.id);
    if (!Array.isArray(intent.examples) || intent.examples.length === 0) {
      throw new Error(`Scout: intent "${intent.id}" needs at least one example`);
    }
  }

  return {
    version: registry.version ?? 1,
    intents: registry.intents.map((intent) => ({
      ...intent,
      capabilities: intent.capabilities ?? [],
      surfaces: intent.surfaces ?? ['chat'],
      roles: intent.roles ?? ['*'],
      examples: intent.examples,
      parameters: intent.parameters ?? { type: 'object', properties: {} },
      version: intent.version ?? 1,
    })),
  };
}

export function findIntent(registry: IntentRegistry, id: string): IntentDefinition | undefined {
  return registry.intents.find((intent) => intent.id === id);
}
