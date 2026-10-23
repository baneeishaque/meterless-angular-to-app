import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { Autofocus } from '../../directives/autofocus';
import { Task } from '../../models/task.model';

@Component({
  selector: 'li[app-task-item]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autofocus],
  templateUrl: './task-item.html',
  styleUrl: './task-item.css',
  host: {
    '[class.completed]': 'task().completed',
  },
})
export class TaskItem {
  readonly task = input.required<Task>();
  readonly toggled = output<string>();
  readonly renamed = output<{ id: string; title: string }>();
  readonly removed = output<string>();

  protected readonly editing = signal(false);
  protected readonly draft = signal('');

  protected startEditing(): void {
    this.draft.set(this.task().title);
    this.editing.set(true);
  }

  protected onEditInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected commitEdit(): void {
    if (!this.editing()) {
      return;
    }

    const title = this.draft().trim();
    this.editing.set(false);

    if (title && title !== this.task().title) {
      this.renamed.emit({ id: this.task().id, title });
    }
  }

  protected cancelEdit(): void {
    this.editing.set(false);
  }

  protected onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitEdit();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }
}
