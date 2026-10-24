export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  projectId?: string;
  projectName?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export type TaskFilter = 'all' | 'active' | 'completed';
export type ProjectFilter = 'all' | string;
