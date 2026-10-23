import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';

@Component({
  selector: 'app-task-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-input.html',
  styleUrl: './task-input.css',
})
export class TaskInput {
  readonly taskAdded = output<string>();
  protected readonly draft = signal('');

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected addTask(input: HTMLInputElement): void {
    const title = this.draft().trim();

    if (!title) {
      return;
    }

    this.taskAdded.emit(title);
    this.draft.set('');
    input.value = '';
    input.focus();
  }
}
