import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  METERLESS_PLACEHOLDER_TOKEN,
  MeterlessProviderService,
} from '../../providers/meterless-provider.service';

@Component({
  selector: 'app-provider-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-panel.html',
  styleUrl: './provider-panel.css',
})
export class ProviderPanel {
  protected readonly provider = inject(MeterlessProviderService);
  protected readonly draftUrl = signal(this.provider.baseUrl());
  protected readonly tokenDraft = signal('');
  protected readonly prompt = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly showToken = computed(
    () => this.provider.status() !== 'online' || !this.provider.hasToken(),
  );
  protected readonly modelOptions = computed(() => {
    const current = this.provider.model();
    return [current, ...this.provider.models().filter((model) => model !== current)];
  });

  protected onUrlInput(event: Event): void {
    this.draftUrl.set((event.target as HTMLInputElement).value);
  }

  protected onTokenInput(event: Event): void {
    this.tokenDraft.set((event.target as HTMLInputElement).value);
  }

  protected onPromptInput(event: Event): void {
    this.prompt.set((event.target as HTMLInputElement).value);
  }

  protected async connect(): Promise<void> {
    this.error.set(null);
    const status = await this.provider.connect(this.draftUrl());
    this.draftUrl.set(this.provider.baseUrl());

    if (status === 'unauthorized') {
      this.error.set('The token was rejected. Paste the token from proxy-token.');
    } else if (status === 'offline') {
      this.error.set(this.provider.lastError() ?? 'The runtime is offline.');
    }
  }

  protected async autoDetect(): Promise<void> {
    this.error.set(null);
    const status = await this.provider.autoDetect();
    this.draftUrl.set(this.provider.baseUrl());

    if (status === 'unauthorized') {
      this.error.set('Runtime found. Paste the token from proxy-token.');
    } else if (status === 'offline') {
      this.error.set(this.provider.lastError() ?? 'No runtime found.');
    }
  }

  protected saveToken(): void {
    this.error.set(null);
    if (!this.provider.setToken(this.tokenDraft())) {
      this.error.set(this.provider.lastError() ?? 'Paste a valid token.');
      return;
    }

    this.tokenDraft.set('');
    void this.provider.checkStatus();
  }

  protected async importToken(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.error.set(null);
    if (!(await this.provider.loadTokenFromFile(file))) {
      this.error.set(this.provider.lastError() ?? 'The token file was rejected.');
    } else {
      void this.provider.checkStatus();
    }
    input.value = '';
  }

  protected onModelChange(event: Event): void {
    this.provider.setModel((event.target as HTMLSelectElement).value);
  }

  protected async send(): Promise<void> {
    const text = this.prompt().trim();
    if (!text) {
      return;
    }

    this.error.set(null);
    try {
      await this.provider.chat(text);
    } catch (error) {
      this.error.set((error as Error).message);
    }
  }

  protected readonly placeholderToken = METERLESS_PLACEHOLDER_TOKEN;
}
