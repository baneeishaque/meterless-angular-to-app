import { TestBed } from '@angular/core/testing';
import { MeterlessProviderService } from '../../providers/meterless-provider.service';
import { ProviderPanel } from './provider-panel';

describe('ProviderPanel', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    await TestBed.configureTestingModule({ imports: [ProviderPanel] }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a token field after an unauthorized response', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    provider.setToken('wrong');
    fetchMock.mockResolvedValue(response(401, { error: 'bad token' }));
    await provider.checkStatus();

    const fixture = TestBed.createComponent(ProviderPanel);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('#meterless-token')).toBeTruthy();
    expect(element.textContent).toContain('unauthorized');
  });

  it('auto-detects a runtime and updates the base URL', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === 'http://127.0.0.1:8787/v1/models') {
        return Promise.resolve(response(200, { data: [{ id: 'meterless/auto' }] }));
      }
      return Promise.reject(new Error('connection refused'));
    });

    const fixture = TestBed.createComponent(ProviderPanel);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button.secondary')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector<HTMLInputElement>('#meterless-url')?.value).toBe(
      'http://127.0.0.1:8787/v1',
    );
    expect(element.textContent).toContain('online');
  });

  it('shows a plain-text chat reply', async () => {
    const provider = TestBed.inject(MeterlessProviderService);
    provider.setToken('secret');
    fetchMock.mockResolvedValue(
      response(200, { choices: [{ message: { content: 'plain string reply' } }] }),
    );

    const fixture = TestBed.createComponent(ProviderPanel);
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#meterless-prompt',
    );
    input!.value = 'hello';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('form.chat button')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.reply')?.textContent).toContain(
      'plain string reply',
    );
  });
});

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}
