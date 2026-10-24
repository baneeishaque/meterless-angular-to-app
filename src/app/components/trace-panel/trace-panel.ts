import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AssistantService } from '../../services/assistant.service';

@Component({
  selector: 'app-trace-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trace-panel.html',
  styleUrl: './trace-panel.css',
})
export class TracePanel {
  protected readonly assistant = inject(AssistantService);

  protected percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  protected duration(value: number): string {
    return `${value} ms`;
  }
}
