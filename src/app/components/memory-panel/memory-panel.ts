import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MemoryService } from '../../services/memory.service';

@Component({
  selector: 'app-memory-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './memory-panel.html',
  styleUrl: './memory-panel.css',
})
export class MemoryPanel {
  protected readonly memory = inject(MemoryService);
  protected readonly draft = signal('');

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected remember(input: HTMLInputElement): void {
    const content = this.draft().trim();
    if (!content) {
      return;
    }

    this.memory.remember(content);
    this.draft.set('');
    input.value = '';
  }
}
