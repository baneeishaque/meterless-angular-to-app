import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Project, ProjectFilter, TaskFilter } from '../../models/task.model';

interface FilterOption {
  value: TaskFilter;
  label: string;
}

@Component({
  selector: 'app-task-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-filters.html',
  styleUrl: './task-filters.css',
})
export class TaskFilters {
  readonly filter = input.required<TaskFilter>();
  readonly counts = input.required<Record<TaskFilter, number>>();
  readonly projects = input<readonly Project[]>([]);
  readonly projectFilter = input<ProjectFilter>('all');
  readonly filterChange = output<TaskFilter>();
  readonly projectFilterChange = output<ProjectFilter>();

  protected readonly options: readonly FilterOption[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
  ];

  protected onProjectChange(event: Event): void {
    this.projectFilterChange.emit((event.target as HTMLSelectElement).value);
  }
}
