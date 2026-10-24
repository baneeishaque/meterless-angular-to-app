import { TestBed } from '@angular/core/testing';
import { TaskStore } from './task-store';

const STORAGE_KEY = 'angular-todo-app.tasks';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(TaskStore);
  });

  it('starts with an empty list', () => {
    expect(store.tasks()).toEqual([]);
    expect(store.remainingCount()).toBe(0);
    expect(store.completedCount()).toBe(0);
  });

  it('adds trimmed tasks and ignores blank input', () => {
    store.add('  Buy milk  ');
    store.add('   ');

    expect(store.tasks()).toHaveLength(1);
    expect(store.tasks()[0].title).toBe('Buy milk');
    expect(store.tasks()[0].completed).toBe(false);
  });

  it('toggles a task between complete and incomplete', () => {
    store.add('Walk the dog');
    const id = store.tasks()[0].id;

    store.toggle(id);
    expect(store.completedCount()).toBe(1);
    expect(store.remainingCount()).toBe(0);

    store.toggle(id);
    expect(store.completedCount()).toBe(0);
    expect(store.remainingCount()).toBe(1);
  });

  it('renames a task', () => {
    store.add('Old title');
    const id = store.tasks()[0].id;

    store.rename(id, '  New title  ');

    expect(store.tasks()[0].title).toBe('New title');
  });

  it('ignores a blank rename', () => {
    store.add('Keep me');
    const id = store.tasks()[0].id;

    store.rename(id, '   ');

    expect(store.tasks()[0].title).toBe('Keep me');
  });

  it('removes a task', () => {
    store.add('One');
    store.add('Two');
    const id = store.tasks()[0].id;

    store.remove(id);

    expect(store.tasks()).toHaveLength(1);
    expect(store.tasks()[0].title).toBe('Two');
  });

  it('filters tasks by all, active and completed', () => {
    store.add('Active task');
    store.add('Completed task');
    store.toggle(store.tasks()[1].id);

    store.setFilter('all');
    expect(store.visibleTasks()).toHaveLength(2);

    store.setFilter('active');
    expect(store.visibleTasks().map((task) => task.title)).toEqual(['Active task']);

    store.setFilter('completed');
    expect(store.visibleTasks().map((task) => task.title)).toEqual(['Completed task']);
  });

  it('persists tasks to localStorage', () => {
    store.add('Persist me');
    TestBed.tick();

    const raw = localStorage.getItem(STORAGE_KEY);

    expect(raw).toContain('Persist me');
  });

  it('restores valid tasks and drops malformed records', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', title: 'Valid', completed: false, createdAt: 1 },
        { id: '2', title: '', completed: false, createdAt: 2 },
        { id: 3, title: 'Bad id', completed: false, createdAt: 3 },
        null,
      ]),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const restored = TestBed.inject(TaskStore);

    expect(restored.tasks()).toHaveLength(1);
    expect(restored.tasks()[0].title).toBe('Valid');
  });
});

describe('TaskStore projects', () => {
  let store: TaskStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(TaskStore);
  });

  it('adds a project and scopes tasks to it', () => {
    const project = store.addProject('Launch');
    store.add('Ship the launch', project?.id);
    store.add('Buy milk');

    store.setProjectFilter(project!.id);

    expect(store.projects()).toHaveLength(1);
    expect(store.visibleTasks().map((task) => task.title)).toEqual(['Ship the launch']);
    expect(store.visibleTasks()[0].projectName).toBe('Launch');
  });

  it('unassigns tasks when a project is removed', () => {
    const project = store.addProject('Launch');
    store.add('Ship the launch', project?.id);

    store.removeProject(project!.id);

    expect(store.projects()).toEqual([]);
    expect(store.tasks()[0].projectId).toBeUndefined();
    expect(store.projectFilter()).toBe('all');
  });
});
