import type { QueryClient } from "@tanstack/react-query";

const clients = new Set<QueryClient>();
export function trackQueries(client: QueryClient) { clients.add(client); return client; }
export function clearTestQueries() { for (const client of clients) client.clear(); clients.clear(); }
