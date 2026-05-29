import { nanoid } from 'nanoid';
import type { ID } from '../types';

export interface ProjectMeta {
  id: ID;
  name: string;
}

const PROJECTS_KEY = 'planner-projects';
const ACTIVE_KEY = 'planner-active';

export function getProjectStateKey(id: ID): string {
  return `planner-state-${id}`;
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
  } catch {
    return [];
  }
}

function saveProjects(projects: ProjectMeta[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function getActiveProjectId(): ID | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProjectId(id: ID): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function createProject(name: string): ProjectMeta {
  const project: ProjectMeta = { id: nanoid(), name };
  saveProjects([...listProjects(), project]);
  return project;
}

export function deleteProject(id: ID): void {
  saveProjects(listProjects().filter(p => p.id !== id));
  localStorage.removeItem(getProjectStateKey(id));
}

export function renameProject(id: ID, name: string): void {
  saveProjects(listProjects().map(p => p.id === id ? { ...p, name } : p));
}

// Ensures at least one project exists and an active project is set.
export function initProjects(): ID {
  let projects = listProjects();
  let activeId = getActiveProjectId();

  if (projects.length === 0) {
    const p = createProject('WK 2026');
    projects = [p];
    activeId = p.id;
    setActiveProjectId(p.id);
  } else if (!activeId || !projects.find(p => p.id === activeId)) {
    activeId = projects[0]!.id;
    setActiveProjectId(activeId);
  }

  return activeId!;
}
