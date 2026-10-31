import { local, setTok } from "./mock.js";
const DEMO = import.meta.env.VITE_DEMO === "1";
export async function api(m, p, b) {
  if (DEMO) {
    if (p === "/me") throw new Error("Please sign in again.");
    if (p === "/logout") {
      setTok(null);
      return { ok: 1 };
    }
    const r = await local(m, p, b);
    if (p === "/login") setTok(r.token);
    return r;
  }
  const r = await fetch("/api" + p, {
    method: m,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "khner",
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      j.error ||
        (r.status === 409
          ? "Already exists (409 Conflict)"
          : r.status === 400
            ? "Invalid input (400 Bad Request). Check the username and password."
            : "Request failed (" + r.status + ")"),
    );
  return j;
}
