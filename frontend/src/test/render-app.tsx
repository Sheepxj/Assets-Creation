import { useEffect } from "react";
import { render } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { Providers } from "@/components/providers";
import { trackQueries } from "./query-clients";

function CaptureQueries() {
  const client = useQueryClient();
  useEffect(() => { trackQueries(client); }, [client]);
  return null;
}
/** Fresh production providers per render, with explicit disposal of their test-owned cache. */
export function renderApp(children: React.ReactNode) { return render(<Providers><CaptureQueries />{children}</Providers>); }
