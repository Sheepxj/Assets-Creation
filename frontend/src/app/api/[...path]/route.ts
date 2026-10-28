import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hopByHopHeaders = new Set([
  "connection", "content-length", "host", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const upstream = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, process.env.JAVA_API_URL ?? "http://localhost:8080");
  upstream.search = request.nextUrl.search;
  const headers = new Headers(request.headers);
  for (const header of hopByHopHeaders) headers.delete(header);
  const timeoutMs = Number(process.env.PROXY_TIMEOUT_MS ?? "10000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return Response.json({ code: "PROXY_CONFIGURATION_ERROR", message: "服务连接配置不正确", fieldErrors: {} }, { status: 500 });
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const options: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, timeout]),
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      options.body = request.body;
      options.duplex = "half";
    }
    const response = await fetch(upstream, options);
    const responseHeaders = new Headers(response.headers);
    for (const header of hopByHopHeaders) responseHeaders.delete(header);
    responseHeaders.delete("set-cookie");
    for (const cookie of response.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    responseHeaders.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    const timedOut = timeout.aborted;
    return Response.json({
      code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      message: timedOut ? "请求超时，请稍后重试" : "暂时无法连接服务，请稍后重试",
      fieldErrors: {},
    }, { status: timedOut ? 504 : 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
