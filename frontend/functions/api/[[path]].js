const DEFAULT_BACKEND_URL =
  "https://khmer-ner-api.sotikunchhayny.workers.dev";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "x-forwarded-proto",
  "x-real-ip",
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
  const incomingUrl = new URL(request.url);
  const backendUrl = (env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
  const targetUrl = backendUrl + incomingUrl.pathname + incomingUrl.search;

  try {
    const requestHeaders = new Headers(request.headers);
    stripHopByHopHeaders(requestHeaders);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstreamRequest = new Request(targetUrl, {
      method: request.method,
      headers: requestHeaders,
      body: hasBody ? request.body : undefined,
      duplex: hasBody ? "half" : undefined,
    });
    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);
    stripHopByHopHeaders(responseHeaders);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("API proxy request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
