import {
  METERLESS_DEFAULT_BASE_URL,
  normalizeMeterlessBaseUrl,
  parseMeterlessConnectLink,
} from './meterless-url';

describe('meterless URL normalization', () => {
  it.each([
    'http://127.0.0.1:8088/v1',
    'http://127.0.0.1:8088/v1/',
    'http://127.0.0.1:8088/v1/models',
    'http://127.0.0.1:8088/v1/chat/completions',
    'http://127.0.0.1:8088/healthz',
    '127.0.0.1:8088',
    '127.0.0.1:8088/v1/models',
  ])('normalizes %s to <host>/v1', (input) => {
    expect(normalizeMeterlessBaseUrl(input)).toBe('http://127.0.0.1:8088/v1');
  });

  it('never produces /v1/v1', () => {
    expect(normalizeMeterlessBaseUrl('http://host:9000/v1/v1')).toBe('http://host:9000/v1');
    expect(normalizeMeterlessBaseUrl('http://host:9000/v1/chat/completions')).toBe(
      'http://host:9000/v1',
    );
  });

  it('keeps https and IPv6 hosts', () => {
    expect(normalizeMeterlessBaseUrl('https://runtime.local/v1/models')).toBe(
      'https://runtime.local/v1',
    );
    expect(normalizeMeterlessBaseUrl('[::1]:8787/v1')).toBe('http://[::1]:8787/v1');
  });

  it('falls back to the default for empty or invalid input', () => {
    expect(normalizeMeterlessBaseUrl('')).toBe(METERLESS_DEFAULT_BASE_URL);
    expect(normalizeMeterlessBaseUrl('   ')).toBe(METERLESS_DEFAULT_BASE_URL);
    expect(normalizeMeterlessBaseUrl('ftp://host:8088/v1')).toBe(METERLESS_DEFAULT_BASE_URL);
  });

  it('reads the key from a connect link without keeping it in the URL', () => {
    expect(parseMeterlessConnectLink('http://host:8088/connect#k=secret')).toEqual({
      baseUrl: 'http://host:8088/v1',
      token: 'secret',
    });
    expect(parseMeterlessConnectLink('https://host:9000/connect/#k=a%20b')).toEqual({
      baseUrl: 'https://host:9000/v1',
      token: 'a b',
    });
  });

  it('ignores non-connect links and missing keys', () => {
    expect(parseMeterlessConnectLink('http://host:8088/v1')).toBeNull();
    expect(parseMeterlessConnectLink('http://host:8088/connect')).toBeNull();
    expect(parseMeterlessConnectLink('http://host:8088/connect#k=')).toBeNull();
  });
});
