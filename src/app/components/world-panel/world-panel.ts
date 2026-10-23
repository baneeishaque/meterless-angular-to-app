import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorldModelService } from '../../services/world-model.service';

const EVENT_LABELS: Record<string, string> = {
  upsertEntity: 'Task synced',
  tombstone: 'Task archived',
  alias: 'Entity merged',
  relate: 'Relationship added',
  assertFact: 'Fact asserted',
  snapshot: 'Snapshot',
  'view-rebuild': 'View rebuilt',
};

@Component({
  selector: 'app-world-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './world-panel.html',
  styleUrl: './world-panel.css',
})
export class WorldPanel {
  protected readonly world = inject(WorldModelService);

  protected kindLabel(kind: string): string {
    return EVENT_LABELS[kind] ?? kind;
  }

  protected time(at: string): string {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
