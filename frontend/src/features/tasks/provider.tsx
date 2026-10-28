"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/components/providers";
import { isTerminal } from "./registry";
import type { PageResponse, TaskDto } from "@/lib/api/contracts";

interface TasksContextValue {
  tasks: TaskDto[]; loading: boolean; discoveryError: Error | null;
  errors: Map<string, Error>; accept: (task: TaskDto, scope: number) => void;
  refresh: () => void; retry: (id: string) => void; pending: number;
}
const TasksContext = createContext<TasksContextValue | null>(null);
export function useTasks() { const value = useContext(TasksContext); if (!value) throw new Error("Task provider missing"); return value; }

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { api, auth, registry } = useApp();
  const client = useQueryClient();
  const tasks = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const enabled = auth.status === "ready" && !!auth.user;
  const userId = auth.user?.id ?? "anonymous";
  const unfinished = tasks.filter(task => !isTerminal(task));
  const active = useQuery({
    queryKey: ["tasks", userId, "active"], enabled,
    queryFn: async ({ signal }) => {
      const scope = api.scope; const result = await api.request<TaskDto[]>("/api/tasks/active", { signal });
      if (scope === api.scope) result.forEach(task => registry.record(task));
      return result;
    }, staleTime: 0,
    refetchInterval: query => !query.state.error && unfinished.length ? 2000 : false,
  });
  const recent = useQuery({
    queryKey: ["tasks", userId, "recent"], enabled,
    queryFn: async ({ signal }) => {
      const scope = api.scope; const result = await api.request<PageResponse<TaskDto>>("/api/tasks?page=1&pageSize=20", { signal });
      if (scope === api.scope) result.items.forEach(task => registry.record(task));
      return result;
    }, staleTime: 0,
  });
  const tracking = useQueries({ queries: unfinished.map(task => ({
    queryKey: ["tasks", userId, "detail", task.id], enabled,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const scope = api.scope; const result = await api.request<TaskDto>(`/api/tasks/${encodeURIComponent(task.id)}`, { signal });
      if (scope === api.scope && registry.record(result)) {
        void client.invalidateQueries({ queryKey: ["tasks", userId, "history"] });
        void client.invalidateQueries({ queryKey: ["tasks", userId, "recent"] });
      }
      return result;
    },
    retry: false as const, staleTime: 0,
    refetchInterval: (query: { state: { data: TaskDto | undefined; error: Error | null } }) => query.state.error || (query.state.data && isTerminal(query.state.data)) ? false as const : 2000,
  })) });
  const errors = new Map<string, Error>();
  tracking.forEach((query, index) => { if (query.error) errors.set(unfinished[index].id, query.error); });
  const accept = useCallback((task: TaskDto, scope: number) => {
    if (scope !== api.scope) return;
    registry.record(task);
    client.setQueryData(["tasks", userId, "detail", task.id], task);
    void client.invalidateQueries({ queryKey: ["tasks", userId, "active"] });
    void client.invalidateQueries({ queryKey: ["tasks", userId, "recent"] });
    void client.invalidateQueries({ queryKey: ["tasks", userId, "history"] });
  }, [api, registry, client, userId]);
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["tasks", userId] });
  }, [client, userId]);
  const retry = useCallback((id: string) => { void client.refetchQueries({ queryKey: ["tasks", userId, "detail", id] }); }, [client, userId]);
  const visibleTasks = useMemo(() => enabled ? tasks : [], [enabled, tasks]);
  return <TasksContext.Provider value={{ tasks: visibleTasks, pending: enabled ? unfinished.length : 0, accept, refresh, retry, errors,
    loading: enabled && (active.isPending || recent.isPending), discoveryError: enabled ? active.error ?? recent.error : null }}>{children}</TasksContext.Provider>;
}
