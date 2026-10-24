import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { Project } from '../../models/task.model';

export interface TaskAddedEvent {
  title: string;
  projectId?: string;
}

@Component({
  selector: 'app-task-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-input.html',
  styleUrl: './task-input.css',
})
export class TaskInput {
  readonly projects = input<readonly Project[]>([]);
  readonly taskAdded = output<TaskAddedEvent>();
  protected readonly draft = signal('');
  protected readonly selectedProject = signal('');

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected onProjectChange(event: Event): void {
    this.selectedProject.set((event.target as HTMLSelectElement).value);
  }

  protected addTask(input: HTMLInputElement): void {
    const title = this.draft().trim();

    if (!title) {
      return;
    }

    this.taskAdded.emit({
      title,
      projectId: this.selectedProject() || undefined,
    });
    this.draft.set('');
    input.value = '';
    input.focus();
  }
}
