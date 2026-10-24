import { TestBed } from '@angular/core/testing';
import { AssistantService } from '../../services/assistant.service';
import { AssistantPanel } from './assistant-panel';

describe('AssistantPanel', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [AssistantPanel] }).compileComponents();
  });

  it('shows the routing meta line for the last answer', async () => {
    const assistant = TestBed.inject(AssistantService);
    await assistant.submit('Add a task: buy milk');

    const fixture = TestBed.createComponent(AssistantPanel);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('Scout → task.add');
    expect(text).toContain('direct');
  });
});
