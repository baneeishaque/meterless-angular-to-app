// Node-only adapter for the Scout eval harness. The browser core takes a
// composed registry object; the harness passes a file path.
import { readFileSync } from 'node:fs';
import { Scout as CoreScout } from '../src/app/engines/scout/index.ts';
import type { IntentRegistry, ScoutOptions } from '../src/app/engines/scout/types.ts';

type HarnessOptions = Omit<ScoutOptions, 'intentRegistry'> & {
  intentRegistry: string | IntentRegistry;
};

export class Scout extends CoreScout {
  constructor(options: HarnessOptions) {
    const registry =
      typeof options.intentRegistry === 'string'
        ? (JSON.parse(readFileSync(options.intentRegistry, 'utf-8')) as IntentRegistry)
        : options.intentRegistry;
    super({ ...options, intentRegistry: registry });
  }
}
