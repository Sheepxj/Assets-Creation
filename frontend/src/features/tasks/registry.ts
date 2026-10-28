import type { TaskDto } from "@/lib/api/contracts";

export const isTerminal = (task: TaskDto) => task.status === "SUCCEEDED" || task.status === "FAILED";
const progress = (task: TaskDto) => task.status === "QUEUED" ? 0 : task.currentStage === "FINALIZE" ? 3 : task.currentStage === "GENERATE" ? 2 : 1;
export class TaskRegistry {
  private tasks = new Map<string, TaskDto>();
  private snapshot: TaskDto[] = [];
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  record(task: TaskDto) {
    const previous = this.tasks.get(task.id);
    if (previous && isTerminal(previous)) return false;
    // Concurrent discovery/history/detail reads may finish out of order. Java never moves a task backwards.
    if (previous && !isTerminal(task) && progress(task) < progress(previous)) return false;
    this.tasks.set(task.id, task);
    this.snapshot = [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    this.listeners.forEach(listener => listener());
    return isTerminal(task) && (!previous || !isTerminal(previous));
  }
  clear = () => { this.tasks.clear(); this.snapshot = []; this.listeners.forEach(listener => listener()); };
}
