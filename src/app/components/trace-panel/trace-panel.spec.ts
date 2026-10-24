import { TestBed } from '@angular/core/testing';
import { AssistantService } from '../../services/assistant.service';
import { TracePanel } from './trace-panel';

describe('TracePanel', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [TracePanel] }).compileComponents();
  });

  it('shows a hint before the first assistant request', () => {
    const fixture = TestBed.createComponent(TracePanel);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Ask the assistant and the last routing decision',
    );
  });

  it('renders the last trace after an assistant request', async () => {
    const assistant = TestBed.inject(AssistantService);
    await assistant.submit('Add a task: buy milk');

    const fixture = TestBed.createComponent(TracePanel);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('task.add');
    expect(text).toContain('direct');
    expect(text).toContain('scout-decide');
  });
});
