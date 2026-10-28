"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ApiClient } from "@/lib/api/client";
import { SessionStore, type SessionSnapshot } from "@/features/auth/session";
import { TaskRegistry } from "@/features/tasks/registry";
import { TasksProvider } from "@/features/tasks/provider";
import { AppShell } from "./shell";

interface AppContextValue { api: ApiClient; session: SessionStore; auth: SessionSnapshot; registry: TaskRegistry }
const AppContext = createContext<AppContextValue | null>(null);
export function useApp() { const app = useContext(AppContext); if (!app) throw new Error("Application provider missing"); return app; }

export function Providers({ children }: { children: React.ReactNode }) {
  const [kernel] = useState(() => {
    const queries = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 20000 } } });
    const api = new ApiClient(), registry = new TaskRegistry();
    const session = new SessionStore(api, () => { void queries.cancelQueries(); queries.clear(); registry.clear(); });
    return { queries, api, registry, session };
  });
  const auth = useSyncExternalStore(kernel.session.subscribe, kernel.session.getSnapshot, kernel.session.getServerSnapshot);
  useEffect(() => kernel.session.connect(), [kernel]);
  return <QueryClientProvider client={kernel.queries}>
    <AppContext.Provider value={{ ...kernel, auth }}>
      <TasksProvider><AppShell>{children}</AppShell></TasksProvider>
    </AppContext.Provider>
  </QueryClientProvider>;
}
