const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function stripHopByHopHeaders(headers) {
  const connectionHeaders = (headers.get("connection") || "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

  for (const header of [...HOP_BY_HOP_HEADERS, ...connectionHeaders]) {
    headers.delete(header);
  }
}

export async function onRequest({ request, env }) {
  const backendUrl = env.BACKEND_URL;

  if (!backendUrl) {
    return new Response("BACKEND_URL is not configured", { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl =
    backendUrl.replace(/\/$/, "") + incomingUrl.pathname + incomingUrl.search;

  const requestHeaders = new Headers(request.headers);
  stripHopByHopHeaders(requestHeaders);

  const upstreamRequest = new Request(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    duplex:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : "half",
    redirect: request.redirect,
  });
  const upstreamResponse = await fetch(upstreamRequest);
  const responseHeaders = new Headers(upstreamResponse.headers);
  stripHopByHopHeaders(responseHeaders);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
