import { TestBed } from '@angular/core/testing';
import {
  METERLESS_APP_ID,
  METERLESS_CHAT_TIMEOUT_MS,
  METERLESS_SETTINGS_KEY,
  METERLESS_TOKEN_KEY,
  MeterlessError,
  MeterlessProviderService,
} from './meterless-provider.service';

describe('MeterlessProviderService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the default provider identity and base URL', () => {
    const provider = TestBed.inject(MeterlessProviderService);

    expect(provider.providerId).toBe('meterless');
    expect(provider.providerName).toBe('Meterless Runtime');
    expect(provider.baseUrl()).toBe('http://127.0.0.1:8088/v1');
    expect(provider.model()).toBe('meterless/auto');
    expect(METERLESS_CHAT_TIMEOUT_MS).toBe(180_000);
  });

  it('sends auth and app headers and reads meterless models', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    provider.setToken('secret');
    fetchMock.mockResolvedValue(
      response(200, {
        data: [
          { id: 'meterless/auto' },
          { id: 'meterless/vision.fast' },
          { id: 'meterless/text' },
          { id: 'openai/gpt-4o' },
        ],
      }),
    );

    expect(await provider.checkStatus()).toBe('online');
    expect(provider.models()).toEqual([
      'meterless/auto',
      'meterless/vision.fast',
      'meterless/text',
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('http://127.0.0.1:8088/v1/models');
    expect(headers['Authorization']).toBe('Bearer secret');
    expect(headers['meterless-app']).toBe(METERLESS_APP_ID);
    expect(headers['meterless-scope']).toBeUndefined();
  });

  it('shows unauthorized for 401 and 403, never offline', async () => {
    const provider = TestBed.inject(MeterlessProviderService);

    fetchMock.mockResolvedValueOnce(response(401, { error: 'bad token' }));
    expect(await provider.checkStatus()).toBe('unauthorized');
    expect(provider.status()).toBe('unauthorized');

    fetchMock.mockResolvedValueOnce(response(403, { error: 'forbidden' }));
    expect(await provider.checkStatus()).toBe('unauthorized');
  });

  it('shows offline for a 200 without meterless models', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    fetchMock.mockResolvedValue(response(200, { data: [{ id: 'openai/gpt-4o' }] }));

    expect(await provider.checkStatus()).toBe('offline');
    expect(provider.models()).toEqual([]);
  });

  it('rejects the placeholder token and persists a real token', () => {
    const provider = TestBed.inject(MeterlessProviderService);

    expect(provider.setToken('rt-local')).toBe(false);
    expect(provider.hasToken()).toBe(false);
    expect(localStorage.getItem(METERLESS_TOKEN_KEY)).toBeNull();

    expect(provider.setToken('secret')).toBe(true);
    expect(provider.hasToken()).toBe(true);
    expect(localStorage.getItem(METERLESS_TOKEN_KEY)).toBe('secret');
  });

  it('imports a token file and trims its newline', async () => {
    const provider = TestBed.inject(MeterlessProviderService);

    expect(await provider.loadTokenFromFile(new File(['secret\n'], 'proxy-token'))).toBe(true);
    expect(provider.hasToken()).toBe(true);
    expect(localStorage.getItem(METERLESS_TOKEN_KEY)).toBe('secret');

    expect(await provider.loadTokenFromFile(new File(['rt-local\n'], 'proxy-token'))).toBe(false);
  });

  it('persists the base URL and model under the settings key', () => {
    const provider = TestBed.inject(MeterlessProviderService);
    provider.setBaseUrl('localhost:9000/v1/chat/completions');
    provider.setModel('meterless/deep');

    expect(provider.baseUrl()).toBe('http://localhost:9000/v1');
    expect(JSON.parse(localStorage.getItem(METERLESS_SETTINGS_KEY) ?? '{}')).toEqual({
      baseUrl: 'http://localhost:9000/v1',
      model: 'meterless/deep',
    });
  });

  it('auto-detects and saves the first unauthorized hit', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://127.0.0.1:8090/v1/models') {
        return Promise.resolve(response(401, { error: 'bad token' }));
      }
      return Promise.reject(new Error('connection refused'));
    });

    expect(await provider.autoDetect()).toBe('unauthorized');
    expect(provider.baseUrl()).toBe('http://127.0.0.1:8090/v1');
    expect(JSON.parse(localStorage.getItem(METERLESS_SETTINGS_KEY) ?? '{}').baseUrl).toBe(
      'http://127.0.0.1:8090/v1',
    );
  });

  it('auto-detects and saves the first online hit', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://localhost:8787/v1/models') {
        return Promise.resolve(response(200, { data: [{ id: 'meterless/local' }] }));
      }
      return Promise.reject(new Error('connection refused'));
    });

    expect(await provider.autoDetect()).toBe('online');
    expect(provider.baseUrl()).toBe('http://localhost:8787/v1');
    expect(provider.models()).toEqual(['meterless/local']);
  });

  it('takes the base URL and token from a connect link without logging the key', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(response(200, { data: [{ id: 'meterless/auto' }] }));

    expect(await provider.connect('http://host:8088/connect#k=secret')).toBe('online');

    expect(provider.baseUrl()).toBe('http://host:8088/v1');
    expect(provider.hasToken()).toBe(true);
    expect(localStorage.getItem(METERLESS_TOKEN_KEY)).toBe('secret');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });

  it('returns a plain string from chat and sends chat headers', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    provider.setToken('secret');
    fetchMock.mockResolvedValue(
      response(200, { choices: [{ message: { content: 'hello from the runtime' } }] }),
    );

    expect(await provider.chat('hello')).toBe('hello from the runtime');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('http://127.0.0.1:8088/v1/chat/completions');
    expect(headers['Authorization']).toBe('Bearer secret');
    expect(headers['meterless-app']).toBe(METERLESS_APP_ID);
    expect(headers['meterless-scope']).toBe('user');
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'meterless/auto',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    });
  });

  it('marks chat 401 as unauthorized', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    provider.setToken('wrong');
    fetchMock.mockResolvedValue(response(401, { error: 'bad token' }));

    await expect(provider.chat('hello')).rejects.toBeInstanceOf(MeterlessError);
    expect(provider.status()).toBe('unauthorized');
  });
});

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}
