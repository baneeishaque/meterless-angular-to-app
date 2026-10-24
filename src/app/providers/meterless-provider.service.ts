import { computed, Injectable, signal } from '@angular/core';
import { readJson, writeJson } from '../services/persistence';
import {
  METERLESS_DEFAULT_BASE_URL,
  normalizeMeterlessBaseUrl,
  parseMeterlessConnectLink,
} from './meterless-url';

export const METERLESS_PROVIDER_ID = 'meterless';
export const METERLESS_PROVIDER_NAME = 'Meterless Runtime';
export const METERLESS_APP_ID = 'angular-todo-app';
export const METERLESS_TOKEN_KEY = 'meterless_runtime_token';
export const METERLESS_SETTINGS_KEY = 'meterless_runtime_settings';
export const METERLESS_PLACEHOLDER_TOKEN = 'rt-local';
export const METERLESS_CHAT_TIMEOUT_MS = 180_000;
export const METERLESS_PROBE_TIMEOUT_MS = 5_000;
export const METERLESS_DETECT_PORTS = [8088, 8090, 8787, 11434] as const;
export const METERLESS_DETECT_HOSTS = ['127.0.0.1', 'localhost', '[::1]'] as const;
export const METERLESS_DEFAULT_MODEL = 'meterless/auto';

export type MeterlessStatus = 'unknown' | 'online' | 'unauthorized' | 'offline';

interface MeterlessSettings {
  baseUrl?: string;
  model?: string;
}

interface MeterlessProbe {
  status: MeterlessStatus;
  models: string[];
}

export class MeterlessError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MeterlessError';
  }
}

@Injectable({ providedIn: 'root' })
export class MeterlessProviderService {
  readonly providerId = METERLESS_PROVIDER_ID;
  readonly providerName = METERLESS_PROVIDER_NAME;
  readonly appId = METERLESS_APP_ID;

  readonly baseUrl = signal(METERLESS_DEFAULT_BASE_URL);
  readonly model = signal(METERLESS_DEFAULT_MODEL);
  readonly status = signal<MeterlessStatus>('unknown');
  readonly models = signal<readonly string[]>([]);
  readonly busy = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly lastReply = signal<string | null>(null);

  private readonly token = signal('');
  readonly hasToken = computed(() => this.token().length > 0);

  constructor() {
    const settings = readJson<MeterlessSettings>(METERLESS_SETTINGS_KEY);
    this.baseUrl.set(normalizeMeterlessBaseUrl(settings?.baseUrl ?? METERLESS_DEFAULT_BASE_URL));
    const storedModel = settings?.model?.trim() ?? '';
    this.model.set(storedModel.startsWith('meterless/') ? storedModel : METERLESS_DEFAULT_MODEL);

    const stored = this.readStoredToken();
    if (stored && stored !== METERLESS_PLACEHOLDER_TOKEN) {
      this.token.set(stored);
    }
  }

  setBaseUrl(raw: string): void {
    this.baseUrl.set(normalizeMeterlessBaseUrl(raw));
    this.persist();
  }

  setModel(model: string): boolean {
    const value = model.trim();
    if (!value.startsWith('meterless/')) {
      return false;
    }

    this.model.set(value);
    this.persist();
    return true;
  }

  setToken(raw: string): boolean {
    const value = raw.trim();
    if (!value || value === METERLESS_PLACEHOLDER_TOKEN) {
      this.lastError.set(
        value === METERLESS_PLACEHOLDER_TOKEN
          ? 'The placeholder token rt-local is rejected. Paste the token from proxy-token.'
          : 'Paste the Meterless Runtime token first.',
      );
      return false;
    }

    this.token.set(value);
    this.writeStoredToken(value);
    this.lastError.set(null);
    return true;
  }

  clearToken(): void {
    this.token.set('');
    try {
      globalThis.localStorage?.removeItem(METERLESS_TOKEN_KEY);
    } catch {
      // Storage can be unavailable; the in-memory token is still cleared.
    }
  }

  async loadTokenFromFile(file: File): Promise<boolean> {
    const text = await file.text();
    return this.setToken(text);
  }

  async connect(raw: string): Promise<MeterlessStatus> {
    const link = parseMeterlessConnectLink(raw);
    if (link) {
      this.baseUrl.set(link.baseUrl);
      this.setToken(link.token);
      this.persist();
    } else {
      this.setBaseUrl(raw);
    }

    return this.checkStatus();
  }

  async checkStatus(): Promise<MeterlessStatus> {
    this.busy.set(true);
    this.lastError.set(null);

    try {
      const result = await this.probe(this.baseUrl());
      this.applyProbe(result);
      return result.status;
    } catch {
      this.status.set('offline');
      this.models.set([]);
      this.lastError.set('Meterless Runtime is offline at this address.');
      return 'offline';
    } finally {
      this.busy.set(false);
    }
  }

  async autoDetect(): Promise<MeterlessStatus> {
    this.busy.set(true);
    this.lastError.set(null);

    try {
      for (const host of METERLESS_DETECT_HOSTS) {
        for (const port of METERLESS_DETECT_PORTS) {
          const candidate = `http://${host}:${port}/v1`;
          try {
            const result = await this.probe(candidate);
            if (result.status === 'online' || result.status === 'unauthorized') {
              this.baseUrl.set(candidate);
              this.applyProbe(result);
              this.persist();
              return result.status;
            }
          } catch {
            // Keep scanning; a refused port is expected during detection.
          }
        }
      }

      this.status.set('offline');
      this.models.set([]);
      this.lastError.set('No Meterless Runtime found on the standard local ports.');
      return 'offline';
    } finally {
      this.busy.set(false);
    }
  }

  async chat(prompt: string, model = this.model()): Promise<string> {
    if (!this.hasToken()) {
      throw new MeterlessError('Paste the Meterless Runtime token first.');
    }

    this.busy.set(true);
    this.lastError.set(null);
    this.lastReply.set(null);

    try {
      const response = await this.request(
        `${this.baseUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers({ chat: true, json: true }),
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
          }),
        },
        METERLESS_CHAT_TIMEOUT_MS,
      );

      if (response.status === 401 || response.status === 403) {
        this.status.set('unauthorized');
        this.lastError.set('The runtime rejected the token. Paste the token from proxy-token.');
        throw new MeterlessError('unauthorized', response.status);
      }

      if (!response.ok) {
        this.status.set('offline');
        this.lastError.set(`Meterless Runtime returned HTTP ${response.status}.`);
        throw new MeterlessError('request failed', response.status);
      }

      const payload = await this.readJson(response);
      const content = meterlessContent(payload);
      this.status.set('online');
      this.lastReply.set(content);
      return content;
    } catch (error) {
      if (error instanceof MeterlessError) {
        throw error;
      }

      this.status.set('offline');
      this.lastError.set(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Meterless Runtime did not answer within 180 seconds.'
          : 'Meterless Runtime is offline.',
      );
      throw new MeterlessError('request failed');
    } finally {
      this.busy.set(false);
    }
  }

  private async probe(baseUrl: string): Promise<MeterlessProbe> {
    const response = await this.request(
      `${baseUrl}/models`,
      { headers: this.headers() },
      METERLESS_PROBE_TIMEOUT_MS,
    );

    if (response.status === 401 || response.status === 403) {
      return { status: 'unauthorized', models: [] };
    }

    if (!response.ok) {
      return { status: 'offline', models: [] };
    }

    const models = meterlessModelIds(await this.readJson(response));
    return { status: models.length > 0 ? 'online' : 'offline', models };
  }

  private applyProbe(result: MeterlessProbe): void {
    this.status.set(result.status);
    this.models.set(result.models);

    if (result.status === 'unauthorized') {
      this.lastError.set('The runtime rejected the token. Paste the token from proxy-token.');
    } else if (result.status === 'offline') {
      this.lastError.set('The runtime is reachable but did not return meterless models.');
    } else {
      this.lastError.set(null);
    }
  }

  private headers(options: { chat?: boolean; json?: boolean } = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'meterless-app': METERLESS_APP_ID,
    };

    if (this.token()) {
      headers['Authorization'] = `Bearer ${this.token()}`;
    }
    if (options.chat) {
      headers['meterless-scope'] = 'user';
    }
    if (options.json) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  private async request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private persist(): void {
    writeJson(METERLESS_SETTINGS_KEY, {
      baseUrl: this.baseUrl(),
      model: this.model(),
    });
  }

  private readStoredToken(): string {
    try {
      return globalThis.localStorage?.getItem(METERLESS_TOKEN_KEY)?.trim() ?? '';
    } catch {
      return '';
    }
  }

  private writeStoredToken(token: string): void {
    try {
      globalThis.localStorage?.setItem(METERLESS_TOKEN_KEY, token);
    } catch {
      // Storage can be unavailable; the in-memory token still works.
    }
  }
}

export function meterlessModelIds(payload: unknown): string[] {
  const data = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload['data'])
      ? payload['data']
      : [];

  const ids = data
    .map((item) => (typeof item === 'string' ? item : isRecord(item) ? item['id'] : null))
    .filter((id): id is string => typeof id === 'string' && id.startsWith('meterless/'));

  return [...new Set(ids)];
}

export function meterlessContent(payload: unknown): string {
  const choices = isRecord(payload) ? payload['choices'] : undefined;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(first) ? first['message'] : undefined;

  if (!isRecord(message)) {
    return '';
  }

  const value = message['content'];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((part) =>
        typeof part === 'string'
          ? part
          : isRecord(part) && typeof part['text'] === 'string'
            ? part['text']
            : '',
      )
      .join('');
  }

  return typeof value === 'undefined' || value === null ? '' : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
