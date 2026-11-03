export async function onRequest({ request, env }) {
  const backendUrl = env.BACKEND_URL;

  if (!backendUrl) {
    return new Response("BACKEND_URL is not configured", { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl =
    backendUrl.replace(/\/$/, "") + incomingUrl.pathname + incomingUrl.search;

  return fetch(new Request(targetUrl, request));
}
