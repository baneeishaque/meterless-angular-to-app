import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TaskFilter } from '../../models/task.model';

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
  readonly filterChange = output<TaskFilter>();

  protected readonly options: readonly FilterOption[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
  ];
}
