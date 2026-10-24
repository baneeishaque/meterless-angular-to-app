import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AssistantPanel } from './components/assistant-panel/assistant-panel';
import { MemoryPanel } from './components/memory-panel/memory-panel';
import { ProviderPanel } from './components/provider-panel/provider-panel';
import { TaskFilters } from './components/task-filters/task-filters';
import { TaskInput } from './components/task-input/task-input';
import type { TaskAddedEvent } from './components/task-input/task-input';
import { TaskItem } from './components/task-item/task-item';
import { TracePanel } from './components/trace-panel/trace-panel';
import { WorldPanel } from './components/world-panel/world-panel';
import { TaskStore } from './services/task-store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TaskInput,
    TaskFilters,
    TaskItem,
    AssistantPanel,
    ProviderPanel,
    MemoryPanel,
    TracePanel,
    WorldPanel,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(TaskStore);

  protected readonly emptyState = computed(() => {
    const total = this.store.counts().all;

    switch (this.store.filter()) {
      case 'active':
        return total === 0
          ? { title: 'Your list is clear', hint: 'Add a task above to get started.' }
          : { title: 'Nothing left to do', hint: 'Every task is complete. Enjoy the quiet.' };
      case 'completed':
        return {
          title: 'No completed tasks yet',
          hint: 'Check off a task and it will appear here.',
        };
      default:
        return { title: 'Your list is clear', hint: 'Add your first task above.' };
    }
  });

  protected addTask(event: TaskAddedEvent): void {
    this.store.add(event.title, event.projectId);
  }

  protected addProject(input: HTMLInputElement): void {
    const project = this.store.addProject(input.value);
    if (project) {
      input.value = '';
      this.store.setProjectFilter(project.id);
    }
  }
}
