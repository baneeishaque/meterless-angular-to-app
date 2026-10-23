import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AssistantService } from '../../services/assistant.service';

@Component({
  selector: 'app-assistant-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-panel.html',
  styleUrl: './assistant-panel.css',
})
export class AssistantPanel {
  protected readonly assistant = inject(AssistantService);
  protected readonly draft = signal('');

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected send(input: HTMLInputElement): void {
    const text = this.draft();
    if (!text.trim()) {
      return;
    }

    this.draft.set('');
    input.value = '';
    void this.assistant.submit(text);
  }
}
