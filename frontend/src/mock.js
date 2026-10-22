let tok = null;
export const setTok = (t) => {
  tok = t;
};
const MK = "khner2";
let M;
try {
  M = JSON.parse(localStorage.getItem(MK));
} catch (e) {}
M = M || {
  n: 1,
  users: [{ u: "admin", p: "admin123", role: "admin" }],
  labels: [
    { n: "PER", c: "#ef4444" },
    { n: "LOC", c: "#10b981" },
    { n: "ORG", c: "#3b82f6" },
  ],
  docs: [
    {
      id: "1",
      title: "ឧទាហរណ៍",
      text: "លោក សុខ មកពីភ្នំពេញ ហើយធ្វើការនៅធនាគារជាតិនៃកម្ពុជា។ អ្នកស្រី ចាន់ធី ធ្វើការនៅសាកលវិទ្យាល័យភ្នំពេញ។",
      as: "",
      done: false,
      review: "",
      note: "",
      anns: [],
    },
  ],
};
async function local(m, p, b) {
  const sv = () => {
      try {
        localStorage.setItem(MK, JSON.stringify(M));
      } catch (e) {}
    },
    E = (x) => {
      throw new Error(x);
    };
  if (p === "/login") {
    const u = M.users.find((x) => x.u === b.u && x.p === b.p);
    if (!u) E("Wrong username or password.");
    return {
      token: "m:" + u.u,
      user: { u: u.u, role: u.role },
      weak: b.p === "admin123" || b.p.length < 8,
    };
  }
  const U = M.users.find((x) => "m:" + x.u === tok);
  if (!U) E("Please sign in again.");
  const A = U.role === "admin",
    [, r, i] = p.split("/"),
    id = i && decodeURIComponent(i),
    D = () =>
      M.docs.find((d) => d.id === id && (A || d.as === U.u)) ||
      E("Document not found.");
  let out = { ok: 1 };
  if (r === "users") {
    if (!A) E("Admins only.");
    if (m === "GET") return M.users.map(({ u, role }) => ({ u, role }));
    if (m === "POST") {
      if (!b.u || !b.p) E("Enter a username and a password.");
      if (M.users.some((z) => z.u === b.u)) E("That username is taken.");
      M.users.push({ u: b.u, p: b.p, role: b.role });
    } else {
      if (id === U.u) E("You cannot delete yourself.");
      M.users = M.users.filter((z) => z.u !== id);
      M.docs.forEach((d) => {
        if (d.as === id) d.as = "";
      });
    }
  } else if (r === "labels") {
    if (m === "GET") return M.labels;
    if (m === "POST") {
      if (M.labels.some((l) => l.n === b.n)) E("That label already exists.");
      M.labels.push({ n: b.n, c: b.c });
    } else {
      if (M.docs.some((d) => d.anns.some((a) => a.l === id)))
        E("This label is used by annotations. Remove those first.");
      M.labels = M.labels.filter((l) => l.n !== id);
    }
  } else if (r === "docs") {
    if (m === "GET")
      return JSON.parse(
        JSON.stringify(A ? M.docs : M.docs.filter((d) => d.as === U.u)),
      );
    if (m === "DELETE") {
      D();
      M.docs = M.docs.filter((d) => d.id !== id);
    } else if (m === "PATCH") {
      const d = D();
      if (b.assignee !== undefined) {
        if (!A) E("Admins only.");
        if (b.assignee !== null && typeof b.assignee !== "string")
          E("Choose an annotator or unassign the document.");
        if (
          b.assignee &&
          !M.users.some((z) => z.u === b.assignee && z.role === "annotator")
        )
          E("Choose an annotator or unassign the document.");
        d.as = b.assignee;
      }
      if (b.done !== undefined) {
        d.done = b.done;
        if (b.done) d.review = "";
      }
      if (b.review !== undefined) {
        if (!A) E("Admins only.");
        d.review = b.review;
        d.note = b.note || "";
        if (b.review === "returned") d.done = false;
      }
    } else {
      const d = D();
      if (b.start < 0 || b.end <= b.start || b.end > d.text.length)
        E("Invalid selection.");
      if (d.anns.some((a) => b.start < a.e && b.end > a.s))
        E("That text overlaps an existing entity. Remove it first.");
      d.anns.push({
        id: String(++M.n),
        s: b.start,
        e: b.end,
        l: b.label,
        by: U.u,
      });
    }
  } else if (r === "anns") {
    M.docs.forEach((d) => {
      if (A || d.as === U.u) {
        if (m === "DELETE") d.anns = d.anns.filter((a) => a.id !== id);
        else
          d.anns.forEach((a) => {
            if (a.id === id) a.l = b.label;
          });
      }
    });
  } else if (r === "import") {
    let n = 0;
    (b.labels || []).forEach((l) => {
      if (l.n && !M.labels.some((z) => z.n === l.n))
        M.labels.push({ n: l.n, c: l.c || "#888" });
    });
    b.docs.forEach((d) => {
      if (!d.text) return;
      const as = A
          ? M.users.some((z) => z.u === d.assignee && z.role === "annotator")
            ? d.assignee
            : ""
          : U.u,
        anns = [];
      (d.annotations || []).forEach((a) => {
        if (
          a.label &&
          a.start >= 0 &&
          a.end > a.start &&
          a.end <= d.text.length
        ) {
          if (!M.labels.some((z) => z.n === a.label))
            M.labels.push({ n: a.label, c: "#888" });
          anns.push({
            id: String(++M.n),
            s: a.start,
            e: a.end,
            l: a.label,
            by: a.by || "",
          });
        }
      });
      M.docs.push({
        id: String(++M.n),
        title: d.title || "Untitled",
        text: d.text,
        as,
        done: A && !!d.done,
        review: "",
        note: "",
        anns,
      });
      n++;
    });
    out = { count: n };
  } else if (r === "password") {
    if (U.p !== b.old) E("Current password is wrong.");
    if (!b.nw || b.nw.length < 8) E("Use at least 8 characters.");
    U.p = b.nw;
  }
  sv();
  return out;
}

export { local };
