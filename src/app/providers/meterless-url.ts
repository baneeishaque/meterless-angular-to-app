export const METERLESS_DEFAULT_BASE_URL = 'http://127.0.0.1:8088/v1';

export interface MeterlessConnectLink {
  baseUrl: string;
  token: string;
}

export function normalizeMeterlessBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return METERLESS_DEFAULT_BASE_URL;
  }

  try {
    const url = new URL(withScheme(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return METERLESS_DEFAULT_BASE_URL;
    }
    return `${url.origin}/v1`;
  } catch {
    return METERLESS_DEFAULT_BASE_URL;
  }
}

export function parseMeterlessConnectLink(raw: string): MeterlessConnectLink | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(withScheme(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const path = url.pathname.replace(/\/+$/, '');
    if (path !== '/connect') {
      return null;
    }

    const token = new URLSearchParams(url.hash.replace(/^#/, '')).get('k')?.trim() ?? '';
    if (!token) {
      return null;
    }

    return { baseUrl: `${url.origin}/v1`, token };
  } catch {
    return null;
  }
}

export function isMeterlessConnectLink(raw: string): boolean {
  return parseMeterlessConnectLink(raw) !== null;
}

function withScheme(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith('::1')) {
    return `http://[::1]${value.slice(3)}`;
  }

  return `http://${value}`;
}
