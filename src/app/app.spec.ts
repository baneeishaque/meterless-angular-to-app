import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('renders the engine panels', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-assistant-panel')).toBeTruthy();
    expect(compiled.querySelector('app-memory-panel')).toBeTruthy();
    expect(compiled.querySelector('app-trace-panel')).toBeTruthy();
    expect(compiled.querySelector('app-world-panel')).toBeTruthy();
  });

  it('renders the empty state', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Tasks');
    expect(compiled.querySelector('.empty-title')?.textContent).toContain('Your list is clear');
  });

  it('adds a task through the form', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('#new-task') as HTMLInputElement;

    input.value = 'Buy milk';
    input.dispatchEvent(new Event('input'));

    await fixture.whenStable();

    compiled.querySelector('form')?.dispatchEvent(new Event('submit'));

    await fixture.whenStable();

    expect(compiled.querySelector('.title')?.textContent).toContain('Buy milk');
    expect(compiled.querySelector('.remaining')?.textContent).toContain('1 task left');
  });
});
