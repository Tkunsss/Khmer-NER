import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api.js";
import { KM, snap, setSnap } from "./lib.js";
const C = createContext(),
  RL = { admin: "អ្នកគ្រប់គ្រង", annotator: "អ្នកដាក់ស្លាក" };
const stt = (d, L) =>
  L(
    d.review === "approved"
      ? "Approved"
      : d.review === "returned"
        ? "Returned"
        : d.done
          ? "Done"
          : "In progress",
  );
const textLengthWithoutLabels = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.length;
  if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "SUP") return 0;
  return [...node.childNodes].reduce(
    (length, child) => length + textLengthWithoutLabels(child),
    0,
  );
};
const selectionOffset = (root, target, targetOffset) => {
  let length = 0;
  const visit = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "SUP")
      return false;
    if (node === target) {
      length +=
        node.nodeType === Node.TEXT_NODE
          ? targetOffset
          : [...node.childNodes]
              .slice(0, targetOffset)
              .reduce(
                (total, child) => total + textLengthWithoutLabels(child),
                0,
              );
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      length += node.nodeValue.length;
      return false;
    }
    for (const child of node.childNodes)
      if (visit(child)) return true;
    return false;
  };
  return visit(root) ? Number(root.dataset.o) + length : null;
};

export default function App() {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem("lang") || "km";
    } catch (e) {
      return "km";
    }
  });
  const [me, setMe] = useState(null),
    [ready, setReady] = useState(false),
    [db, setDb] = useState({ users: [], labels: [], docs: [] });
  const [tab, setTab] = useState("tasks"),
    [cur, setCur] = useState(null),
    [act, setAct] = useState(null),
    [weak, setWeak] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(null);
  const [docDetails, setDocDetails] = useState({});
  const docDetailsRef = useRef(docDetails);
  const [qf, setQf] = useState(""),
    [snapOn, setSnapOn] = useState(false);
  // Pop-up messages (toasts): always visible on screen, so nobody has to scroll up.
  const [toasts, setToasts] = useState([]),
    timers = useRef({});
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  // kind: "ok" (green) | "danger" (red: errors, deletes, removes) | "info" (blue)
  const notify = (text, kind = "ok", key) => {
    if (!text) return;
    const id = key || String(Date.now() + Math.random());
    setToasts((t) =>
      [...t.filter((x) => x.id !== id), { id, text, kind }].slice(-4),
    );
    clearTimeout(timers.current[id]);
    if (key !== "progress")
      timers.current[id] = setTimeout(
        () => dismiss(id),
        kind === "danger" ? 6000 : 3500,
      );
  };
  // Old string-based messages from Import/Export, Account, Users... become toasts too.
  const setMsg = (m) => {
    if (!m) return;
    dismiss("progress");
    notify(
      m,
      /^(Imported|Password changed|Export copied|Export downloaded)/.test(m)
        ? "ok"
        : "danger",
    );
  };
  const L = (s) => (lang === "km" && KM[s]) || s,
    rl = (r) => (lang === "km" ? RL[r] : r);
  const [confirmState, setConfirmState] = useState(null),
    confirmResolve = useRef(null);
  const ask = (options) =>
    new Promise((resolve) => {
      confirmResolve.current?.(false);
      confirmResolve.current = resolve;
      setConfirmState(options);
    });
  const closeConfirm = useCallback((answer) => {
    confirmResolve.current?.(answer);
    confirmResolve.current = null;
    setConfirmState(null);
  }, []);
  const replaceDocDetails = (details) => {
    docDetailsRef.current = details;
    setDocDetails(details);
  };
  const putDocDetail = (detail) => {
    const next = { ...docDetailsRef.current, [detail.id]: detail };
    docDetailsRef.current = next;
    setDocDetails(next);
  };
  const updateDocDetail = (id, update) => {
    const current = docDetailsRef.current[id];
    if (!current) return;
    const detail = update(current);
    const next = { ...docDetailsRef.current, [id]: detail };
    docDetailsRef.current = next;
    setDocDetails(next);
  };
  const loadAllDocDetails = useCallback(
    async (documents = db.docs) => {
      const loaded = Object.fromEntries(
        documents
          .filter(
            (doc) =>
              !docDetailsRef.current[doc.id] &&
              typeof doc.text === "string" &&
              Array.isArray(doc.anns),
          )
          .map((doc) => [doc.id, doc]),
      );
      const missing = documents.filter(
        (doc) => !docDetailsRef.current[doc.id] && !loaded[doc.id],
      );
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < missing.length) {
          const doc = missing[nextIndex++];
          loaded[doc.id] = await api(
            "GET",
            "/docs/" + encodeURIComponent(doc.id),
          );
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(4, missing.length) },
          () => worker(),
        ),
      );
      const next = { ...docDetailsRef.current, ...loaded };
      replaceDocDetails(next);
      return next;
    },
    [db.docs],
  );
  setSnap(snapOn);
  const toggle = () => {
    const n = lang === "km" ? "en" : "km";
    setLang(n);
    try {
      localStorage.setItem("lang", n);
    } catch (e) {}
  };
  const out = () => {
    setMe(null);
    setCur(null);
    setWeak(false);
    setTab("tasks");
  };
  const load = async (role) => {
    try {
      const [l, d] = await Promise.all([
        api("GET", "/labels"),
        api("GET", "/docs"),
      ]);
      const u = role === "admin" ? await api("GET", "/users") : [];
      setDb({ labels: l, docs: d, users: u });
      const activeDoc = cur && d.find((doc) => doc.id === cur);
      if (activeDoc) {
        replaceDocDetails({
          [activeDoc.id]: await api(
            "GET",
            "/docs/" + encodeURIComponent(activeDoc.id),
          ),
        });
      } else {
        replaceDocDetails({});
      }
      return d;
    } catch (e) {
      if (/sign in/i.test(e.message)) out();
      else setMsg(e.message);
    }
  };
  // run(f) -> null on success, or the error message string on failure.
  // Pass { quiet: true } when the caller shows the error itself (next to its button)
  // so it does not also appear in the banner at the top of the page.
  // opts.ok = message to show after success; opts.kind = "ok" | "danger" | "info".
  const run = async (f, opts = {}) => {
    let error = null;
    try {
      await f();
    } catch (e) {
      error = e.message || "Request failed";
      if (!opts.quiet) notify(error, "danger");
    }
    await load(me.role);
    if (!error && opts.ok) notify(opts.ok, opts.kind || "ok");
    return error;
  };
  useEffect(() => {
    api("GET", "/me")
      .then(async (r) => {
        setMe(r.user);
        await load(r.user.role);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  const X = {
    L,
    rl,
    me,
    db,
    run,
    load,
    setDb,
    setMsg,
    notify,
    tab,
    cur,
    setCur,
    setTab,
    act,
    setAct,
    loadingDoc,
    setLoadingDoc,
    qf,
    setQf,
    snapOn,
    setSnapOn,
    setWeak,
    docDetails,
    putDocDetail,
    updateDocDetail,
    loadAllDocDetails,
    ask,
  };
  if (!me)
    return (
      <C.Provider value={X}>
        <Login
          lang={lang}
          toggle={toggle}
          onIn={async (r) => {
            setMe(r.user);
            setWeak(!!r.weak);
            await load(r.user.role);
          }}
        />
      </C.Provider>
    );
  const A = me.role === "admin",
    T = [
      ["tasks", A ? "Documents" : "My documents"],
      ["annotate", "Annotate"],
      ...(A ? [["data", "Data"]] : []),
      ...(A ? [["labels", "Labels"]] : []),
      ...(A ? [["users", "Users"]] : []),
      ["io", "Import / Export"],
      ["acct", "Account"],
    ];
  const V = {
    tasks: Tasks,
    annotate: Annotate,
    data: A ? Data : Tasks,
    labels: Labels,
    users: Users,
    io: IO,
    acct: Acct,
  }[tab];
  return (
    <C.Provider value={X}>
      <div className="w">
        <header>
          <div className="brand">
            <div className="brand-logo">✎</div>
            <h1>
              Khmer NER Annotator
              <span className="brand-sub">Khmer Named Entity Annotation</span>
            </h1>
          </div>
          <div className="row">
            <button onClick={toggle}>{lang === "km" ? "EN" : "ខ្មែរ"}</button>
            <span className="user-pill">
              {me.u} ({rl(me.role)})
            </span>
            <button
              onClick={async () => {
                try {
                  await api("POST", "/logout");
                } catch (e) {}
                out();
              }}
            >
              {L("Sign out")}
            </button>
          </div>
        </header>
        {weak && (
          <div className="card err">
            {L("Your password is weak. Change it in Account.")}
          </div>
        )}
        <div className="tabs">
          {T.map((x) => (
            <button
              key={x[0]}
              className={tab === x[0] ? "on" : ""}
              disabled={loadingDoc !== null}
              onClick={() => {
                setMsg("");
                setTab(x[0]);
              }}
            >
              {L(x[1])}
            </button>
          ))}
        </div>
        <V />
        <footer className="site-foot">
          <span>Khmer NER Annotator</span>
          <span>© 2026 Khmer NER Project. All rights reserved.</span>
        </footer>
        <Toasts toasts={toasts} dismiss={dismiss} />
        <ConfirmDialog state={confirmState} onClose={closeConfirm} />
      </div>
    </C.Provider>
  );
}

function ConfirmDialog({ state, onClose }) {
  const { L } = useContext(C),
    cancelRef = useRef(null),
    inputRef = useRef(null),
    [typedValue, setTypedValue] = useState("");
  useEffect(() => {
    setTypedValue("");
    if (!state) return;
    (state.requiredText ? inputRef.current : cancelRef.current)?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(false);
      } else if (
        /^[1-9]$/.test(event.key) ||
        event.key.startsWith("Page") ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z")
      ) {
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state, onClose]);
  if (!state) return null;
  const canConfirm =
    state.requiredText === undefined || typedValue === state.requiredText;
  return (
    <div className="confirm-backdrop" onMouseDown={() => onClose(false)}>
      <div
        className="confirm-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-msg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path
              d="M12 3.2 22 20.5H2L12 3.2Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M12 10v4.4M12 17.2v.1"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h3 id="confirm-title">
          <span className="confirm-dot" aria-hidden="true" />
          {L(state.title || "Are you sure?")}
        </h3>
        {state.message && <p id="confirm-msg">{L(state.message)}</p>}
        {state.detail && <div className="confirm-detail">{state.detail}</div>}
        {state.requiredText !== undefined && (
          <label className="confirm-input-label">
            {L(state.requiredPrompt)}
            <input
              ref={inputRef}
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
          </label>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} onClick={() => onClose(false)}>
            {L("Cancel")}
          </button>
          <button
            className="p bad"
            disabled={!canConfirm}
            onClick={() => onClose(true)}
          >
            {L(state.confirmText || "Delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={"toast " + t.kind}
          role={t.kind === "danger" ? "alert" : "status"}
          onClick={() => dismiss(t.id)}
          title="Click to close"
        >
          <span className="toast-icon">
            {t.kind === "danger" ? "✕" : t.kind === "info" ? "ℹ" : "✓"}
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function Login({ onIn, lang, toggle }) {
  const { L } = useContext(C),
    [u, setU] = useState(""),
    [p, setP] = useState(""),
    [e, setE] = useState("");
  const go = async () => {
    try {
      await onIn(await api("POST", "/login", { u: u.trim(), p }));
    } catch (x) {
      setE(x.message);
    }
  };
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <span className="login-tag">● KHMER NLP</span>
        <h1 style={{ marginBottom: 18 }}>Khmer NER Annotator</h1>
        <div className="row">
          <input
            style={{ width: "100%" }}
            id="login-username"
            name="username"
            autoComplete="username"
            placeholder={L("Username")}
            value={u}
            onChange={(x) => setU(x.target.value)}
          />
        </div>
        <div className="row">
          <input
            style={{ width: "100%" }}
            id="login-password"
            name="password"
            autoComplete="current-password"
            type="password"
            placeholder={L("Password")}
            value={p}
            onChange={(x) => setP(x.target.value)}
            onKeyDown={(x) => x.key === "Enter" && go()}
          />
        </div>
        <div className="row">
          <button className="p" onClick={go}>
            {L("Sign in")}
          </button>
          <button onClick={toggle}>{lang === "km" ? "EN" : "ខ្មែរ"}</button>
        </div>
        <p className="err">{e}</p>
      </div>
      <div className="login-foot">NLP ● NAMED ENTITY RECOGNITION SYSTEM</div>
    </div>
  );
}

function Review({ d }) {
  const { L, run } = useContext(C),
    [n, setN] = useState("");
  const go = (r) =>
    run(() => api("PATCH", "/docs/" + d.id, { review: r, note: n }), {
      ok:
        (r === "approved" ? "Approved: " : "Returned to annotator: ") + d.title,
      kind: r === "approved" ? "ok" : "info",
    });
  return (
    <>
      <br />
      <input
        id={"review-note-" + d.id}
        name={"review-note-" + d.id}
        placeholder={L("Reviewer note")}
        value={n}
        onChange={(e) => setN(e.target.value)}
      />{" "}
      <button onClick={() => go("approved")}>{L("Approve")}</button>{" "}
      <button onClick={() => go("returned")}>{L("Return")}</button>
    </>
  );
}

function Assignment({ d, annotators, L, setDb }) {
  const current = d.assignees || (d.as ? [d.as] : []);
  const [selected, setSelected] = useState(current);
  const [rowCount, setRowCount] = useState(
    d.rowCount || (d.text ? documentLines(d.text).length : null),
  );
  const [rowCountLoading, setRowCountLoading] = useState(false);
  useEffect(() => setSelected(current), [d.assignees, d.as]);
  useEffect(() => {
    const count = d.rowCount || (d.text ? documentLines(d.text).length : null);
    setRowCount(count);
    setEnd(count ? String(count) : "");
  }, [d.id, d.rowCount, d.text]);
  const changed =
    selected.length !== current.length ||
    selected.some((u) => !current.includes(u));
  const [username, setUsername] = useState(annotators[0]?.u || ""),
    [start, setStart] = useState("1"),
    [end, setEnd] = useState(
      String(d.rowCount || (d.text ? documentLines(d.text).length : "")),
    );
  // status: "idle" | "busy" | "ok" | "error"
  const IDLE = { status: "idle", text: "", conflicts: [] };
  const [saveState, setSaveState] = useState(IDLE),
    [rowState, setRowState] = useState(IDLE);
  // Any change to the form clears an old error, so a red button never lingers.
  useEffect(
    () => setSaveState((s) => (s.status === "error" ? IDLE : s)),
    [selected.join(",")],
  );
  useEffect(
    () => setRowState((s) => (s.status === "error" ? IDLE : s)),
    [username, start, end],
  );
  const flash = (set, state) => {
    set(state);
    if (state.status === "ok")
      setTimeout(() => set((s) => (s.status === "ok" ? IDLE : s)), 2500);
  };

  const ensureRowCount = async () => {
    if (rowCount || rowCountLoading) return;
    setRowCountLoading(true);
    try {
      const result = await api(
        "GET",
        "/docs/" + encodeURIComponent(d.id) + "/row-count",
      );
      setRowCount(result.rowCount);
      setEnd(String(result.rowCount));
    } catch (error) {
      setRowState({
        ...IDLE,
        status: "error",
        text: error.message || "Could not load document rows.",
      });
    } finally {
      setRowCountLoading(false);
    }
  };

  const saveAssignment = async () => {
    setSaveState({ ...IDLE, status: "busy" });
    let error = null;
    try {
      await api("PATCH", "/docs/" + d.id, { assignees: selected });
      setDb((current) => ({
        ...current,
        docs: current.docs.map((doc) =>
          doc.id === d.id
            ? { ...doc, assignees: selected, as: selected.join(", ") }
            : doc,
        ),
      }));
    } catch (e) {
      error = e.message || "Request failed";
    }
    flash(
      setSaveState,
      error
        ? { ...IDLE, status: "error", text: error }
        : { ...IDLE, status: "ok", text: L("Assignment saved.") },
    );
  };

  // Returns an error message (and the conflicting assignments) or null.
  const checkRows = () => {
    const s = +start,
      e = +end;
    if (!rowCount) return { text: L("Could not load document rows.") };
    if (!annotators.length || !username)
      return { text: L("Choose an annotator.") };
    if (
      !Number.isInteger(s) ||
      !Number.isInteger(e) ||
      s < 1 ||
      e < s ||
      e > rowCount
    )
      return {
        text: `${L("Enter a valid row range between 1 and")} ${rowCount}.`,
      };
    const wholeDoc = d.assignees || (d.as ? [d.as] : []);
    if (wholeDoc.includes(username))
      return {
        text: `${username} ${L("already has the whole document assigned.")}`,
      };
    const otherWhole = wholeDoc.filter((u) => u !== username);
    if (otherWhole.length)
      return {
        text: `${L("The whole document is already assigned to")} ${otherWhole.join(", ")}.`,
      };
    const hits = (d.rowAssignments || []).filter(
      (a) => a.start <= e && a.end >= s,
    );
    if (hits.length) {
      const list = hits
        .map((a) => `${a.username} ${a.start}–${a.end}`)
        .join(", ");
      const mine = hits.every((a) => a.username === username);
      return {
        text: `${L("Already assigned")}: ${list}. ${mine ? L("Remove the old range first, or choose rows that are not assigned yet.") : L("Those rows belong to another annotator.")}`,
        conflicts: hits,
      };
    }
    return null;
  };

  const assignRows = async () => {
    const problem = checkRows();
    if (problem)
      return setRowState({
        ...IDLE,
        status: "error",
        text: problem.text,
        conflicts: problem.conflicts || [],
      });
    setRowState({ ...IDLE, status: "busy" });
    let error = null;
    try {
      await api("PATCH", "/docs/" + d.id, {
        rowAssignment: { username, start: +start, end: +end },
      });
      setDb((current) => ({
        ...current,
        docs: current.docs.map((doc) =>
          doc.id === d.id
            ? {
                ...doc,
                rowAssignments: [
                  ...(doc.rowAssignments || []),
                  { username, start: +start, end: +end },
                ],
              }
            : doc,
        ),
      }));
    } catch (e) {
      error = e.message || "Request failed";
    }
    flash(
      setRowState,
      error
        ? { ...IDLE, status: "error", text: error }
        : {
            ...IDLE,
            status: "ok",
            text: `${L("Rows assigned")}: ${username} ${start}–${end}`,
          },
    );
  };

  const isConflict = (a) =>
    rowState.conflicts.some(
      (c) =>
        c.username === a.username && c.start === a.start && c.end === a.end,
    );
  const btnClass = (st) =>
    "p" + (st.status === "error" ? " bad" : st.status === "ok" ? " good" : "");

  return (
    <div className="assignment">
      <details>
        <summary>
          {current.length
            ? `${L("Assigned to")}: ${current.join(", ")}`
            : L("Unassigned")}
        </summary>
        <div className="assignment-options">
          {annotators.map((u) => (
            <label key={u.u}>
              <input
                type="checkbox"
                id={`assign-${d.id}-${encodeURIComponent(u.u)}`}
                name={`assignee-${d.id}`}
                checked={selected.includes(u.u)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, u.u]
                      : old.filter((x) => x !== u.u),
                  )
                }
              />
              {u.u}
            </label>
          ))}
          <button
            className={btnClass(saveState)}
            disabled={
              (!changed && saveState.status === "idle") ||
              saveState.status === "busy"
            }
            onClick={saveAssignment}
          >
            {saveState.status === "busy"
              ? L("Saving…")
              : saveState.status === "ok"
                ? "✓ " + L("Saved")
                : L("Save assignment")}
          </button>
          {saveState.text && (
            <p
              className={
                "assign-msg " + (saveState.status === "error" ? "bad" : "good")
              }
              role={saveState.status === "error" ? "alert" : "status"}
            >
              {saveState.text}
            </p>
          )}
        </div>
      </details>
      <details onToggle={(event) => event.currentTarget.open && ensureRowCount()}>
        <summary>
          {L("Assign row range")}
          {rowCount ? ` (${rowCount})` : ""}
        </summary>
        <div className="assignment-options">
          <div className="panel-title" title={d.title}>
            {d.title}
          </div>
          <label>
            {L("Annotator")}
            <select
              id={`row-annotator-${d.id}`}
              name={`row-annotator-${d.id}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            >
              {annotators.map((u) => (
                <option key={u.u} value={u.u}>
                  {u.u}
                </option>
              ))}
            </select>
          </label>
          <label>
            {L("From row")}
            <input
              type="number"
              id={`row-from-${d.id}`}
              name={`row-from-${d.id}`}
              min="1"
              max={rowCount || undefined}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {L("To row")}
            <input
              type="number"
              id={`row-to-${d.id}`}
              name={`row-to-${d.id}`}
              min="1"
              max={rowCount || undefined}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button
            className={btnClass(rowState)}
            disabled={
              !annotators.length ||
              !rowCount ||
              rowCountLoading ||
              rowState.status === "busy"
            }
            onClick={assignRows}
          >
            {rowCountLoading
              ? L("Loading…")
              : rowState.status === "busy"
              ? L("Assigning…")
              : rowState.status === "ok"
                ? "✓ " + L("Assigned")
                : L("Assign rows")}
          </button>
          {rowState.text && (
            <p
              className={
                "assign-msg " + (rowState.status === "error" ? "bad" : "good")
              }
              role={rowState.status === "error" ? "alert" : "status"}
            >
              {rowState.text}
            </p>
          )}
          {(d.rowAssignments || []).length > 0 && (
            <div className="scroll-list row-list">
              <div className="list-head">
                {d.title} · {L("Assigned ranges")} ({d.rowAssignments.length})
              </div>
              {[...d.rowAssignments]
                .sort(
                  (x, y) =>
                    x.start - y.start || x.username.localeCompare(y.username),
                )
                .map((assignment, i) => (
                  <div
                    className={
                      "row-assignment" +
                      (isConflict(assignment) ? " conflict" : "")
                    }
                    key={`${assignment.username}-${assignment.start}-${assignment.end}-${i}`}
                  >
                    <span>
                      {assignment.username}: {assignment.start}–{assignment.end}
                    </span>
                    <button
                      className="danger"
                      onClick={async () => {
                        try {
                          await api("PATCH", "/docs/" + d.id, {
                            removeRowAssignment: assignment,
                          });
                          setDb((current) => ({
                            ...current,
                            docs: current.docs.map((doc) =>
                              doc.id === d.id
                                ? {
                                    ...doc,
                                    rowAssignments: (
                                      doc.rowAssignments || []
                                    ).filter(
                                      (item) =>
                                        item.username !== assignment.username ||
                                        item.start !== assignment.start ||
                                        item.end !== assignment.end,
                                    ),
                                  }
                                : doc,
                            ),
                          }));
                          flash(setRowState, {
                            ...IDLE,
                            status: "ok",
                            text: `Removed rows ${assignment.start}–${assignment.end} from ${assignment.username}`,
                          });
                        } catch (error) {
                          flash(setRowState, {
                            ...IDLE,
                            status: "error",
                            text: error.message || "Could not remove row assignment.",
                          });
                        }
                      }}
                    >
                      {L("Remove")}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function documentLines(text) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n" || text[i] === "\r") {
      lines.push({ start, end: i });
      if (text[i] === "\r" && text[i + 1] === "\n") i++;
      start = i + 1;
    }
  }
  lines.push({ start, end: text.length });
  return lines;
}

function rowForOffset(text, offset) {
  let row = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\r") {
      row++;
      if (text[i + 1] === "\n") i++;
    } else if (text[i] === "\n") row++;
  }
  return row;
}

function assignedRows(d, username) {
  const rows = (d.rowAssignments || [])
    .filter((assignment) => assignment.username === username)
    .map(({ start, end }) => ({ start, end }));
  if (rows.length) return rows;
  if ((d.assignees || (d.as ? [d.as] : [])).includes(username))
    return [
      {
        start: 1,
        end: d.rowCount || (d.text ? documentLines(d.text).length : null),
      },
    ];
  return [];
}

function rowCompletion(docs, username) {
  return docs.reduce(
    (total, doc) => {
      const highlightedRows = new Set(
        doc.highlightedRowsByUser?.[username] ||
          (doc.text
            ? (doc.anns || [])
                .filter((annotation) => annotation.by === username)
                .map((annotation) => rowForOffset(doc.text, annotation.s))
            : []),
      );
      const completedRows = new Set();
      for (const range of assignedRows(doc, username)) {
        const end = range.end || doc.rowCount || range.start;
        total.assigned += Math.max(0, end - range.start + 1);
        for (const row of highlightedRows)
          if (row >= range.start && row <= end) completedRows.add(row);
      }
      total.completed += completedRows.size;
      return total;
    },
    { completed: 0, assigned: 0 },
  );
}

function annotationCount(docs, username) {
  return docs.reduce(
    (total, doc) =>
      total +
      (doc.anns || []).filter(
        (annotation) => !username || annotation.by === username,
      ).length,
    0,
  );
}

function Tasks() {
  const {
      L,
      me,
      db,
      run,
      notify,
      ask,
      qf,
      setQf,
      setDb,
      setCur,
      setTab,
      setLoadingDoc,
      putDocDetail,
    } = useContext(C),
    A = me.role === "admin",
    an = db.users.filter((u) => u.role === "annotator"),
    ds = db.docs.filter((d) => !qf || d.title.includes(qf));
  const [openingDoc, setOpeningDoc] = useState(null);
  const myDocs = db.docs.filter(
    (d) =>
      d.assignees?.includes(me.u) ||
      d.as === me.u ||
      d.rowAssignments?.some((assignment) => assignment.username === me.u),
  );
  const myRowProgress = rowCompletion(myDocs, me.u);
  return (
    <>
      {A && (
        <>
          <h3>{L("Annotator progress")}</h3>
          <div className="card tw">
            <table>
              <thead>
                <tr>
                  <th>{L("Annotator")}</th>
                  <th>{L("Assigned")}</th>
                  <th>{L("Done")}</th>
                  <th>{L("Entities")}</th>
                  <th>{L("Completion")}</th>
                </tr>
              </thead>
              <tbody>
                {an.map((u) => {
                  const d = db.docs.filter(
                    (x) =>
                      x.assignees?.includes(u.u) ||
                      x.as === u.u ||
                      x.rowAssignments?.some(
                        (assignment) => assignment.username === u.u,
                      ),
                  );
                  const rows = rowCompletion(d, u.u);
                  return (
                    <tr key={u.u}>
                      <td>{u.u}</td>
                      <td>
                        <div className="scroll-list">
                          {d.map((doc) => (
                            <div className="assigned-range" key={doc.id}>
                              <b>{doc.title}</b>
                              {assignedRows(doc, u.u).map((range) => (
                                <div key={`${range.start}-${range.end}`}>
                                  {range.end
                                    ? `${L("Rows")} ${range.start}–${range.end}`
                                    : L("Full document")}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        {d.filter((x) => x.done).length}/{d.length}
                      </td>
                      <td>{annotationCount(d, u.u)}</td>
                      <td>
                        {rows.completed}/{rows.assigned} (
                        {rows.assigned
                          ? Math.round((rows.completed / rows.assigned) * 100)
                          : 0}
                        %)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!A && (
        <>
          <h3>{L("My progress")}</h3>
          <div className="card tw">
            <table>
              <thead>
                <tr>
                  <th>{L("Assigned")}</th>
                  <th>{L("Done")}</th>
                  <th>{L("Remaining")}</th>
                  <th>{L("Entities")}</th>
                  <th>{L("Completion")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="scroll-list">
                      {myDocs.map((doc) => (
                        <div className="assigned-range" key={doc.id}>
                          <b>{doc.title}</b>
                          {assignedRows(doc, me.u).map((range) => (
                            <div key={`${range.start}-${range.end}`}>
                              {range.end
                                ? `${L("Rows")} ${range.start}–${range.end}`
                                : L("Full document")}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>{myDocs.filter((d) => d.done).length}</td>
                  <td>{myDocs.filter((d) => !d.done).length}</td>
                  <td>{annotationCount(myDocs, me.u)}</td>
                  <td>
                    {myRowProgress.completed}/{myRowProgress.assigned} (
                    {myRowProgress.assigned
                      ? Math.round(
                          (myRowProgress.completed / myRowProgress.assigned) *
                            100,
                        )
                      : 0}
                    %)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <h3>{L(A ? "Documents" : "My documents")}</h3>
      <div className="row">
        <input
          id="doc-search"
          name="search"
          placeholder={L("Search")}
          value={qf}
          onChange={(e) => setQf(e.target.value)}
        />
      </div>
      <div className="card tw">
        <table>
          <thead>
            <tr>
              <th>{L("Title")}</th>
              <th>{A ? L("Assigned to") : L("Status")}</th>
              <th>{L("Entities")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ds.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>
                  {A && (
                    <Assignment d={d} annotators={an} L={L} setDb={setDb} />
                  )}
                  {stt(d, L)}
                  {d.review === "returned" && d.note && (
                    <>
                      <br />
                      <small className="err">{d.note}</small>
                    </>
                  )}
                </td>
                <td>{annotationCount([d], A ? undefined : me.u)}</td>
                <td>
                  <button
                    className="open"
                    disabled={openingDoc !== null}
                    onClick={async () => {
                      setOpeningDoc(d.id);
                      setCur(d.id);
                      setTab("annotate");
                      setLoadingDoc(d.id);
                      try {
                        putDocDetail(
                          await api(
                            "GET",
                            "/docs/" + encodeURIComponent(d.id),
                          ),
                        );
                        notify(`Opened: ${d.title}`, "info");
                      } catch (error) {
                        setCur(null);
                        setTab("tasks");
                        notify(
                          error.message || "Could not open document.",
                          "danger",
                        );
                      } finally {
                        setOpeningDoc(null);
                        setLoadingDoc(null);
                      }
                    }}
                  >
                    {L("Open")}
                  </button>
                  {(A || d.assignees?.includes(me.u)) && (
                    <button
                      className="danger"
                      onClick={async () => {
                        if (
                          !(await ask({
                            title: "Delete document?",
                            message:
                              "Delete this document and all its annotations? This cannot be undone.",
                            detail: d.title,
                            confirmText: "Delete",
                            requiredText: d.title,
                            requiredPrompt:
                              "Type the exact document title to confirm deletion:",
                          }))
                        )
                          return;
                        try {
                          await api("DELETE", "/docs/" + d.id);
                          setDb((current) => ({
                            ...current,
                            docs: current.docs.filter(
                              (doc) => doc.id !== d.id,
                            ),
                          }));
                          notify(`Deleted document: ${d.title}`, "danger");
                        } catch (error) {
                          notify(
                            error.message || "Could not delete document.",
                            "danger",
                          );
                        }
                      }}
                    >
                      {L("Delete")}
                    </button>
                  )}
                  {A && d.done && d.review !== "approved" && <Review d={d} />}
                </td>
              </tr>
            ))}
            {!ds.length && (
              <tr>
                <td colSpan={4} className="mut">
                  {L("No documents yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Annotate() {
  const {
      L,
      me,
      db,
      setDb,
      docDetails,
      updateDocDetail,
      notify,
      cur,
      act,
      setAct,
      loadingDoc,
      snapOn,
      setSnapOn,
    } = useContext(C),
    box = useRef(null),
    card = useRef(null),
    picker = useRef(null),
    touchSelection = useRef(null),
    [lineIndex, setLineIndex] = useState(0),
    [lineInput, setLineInput] = useState("1"),
    [progressLoadedFor, setProgressLoadedFor] = useState(null),
    [progressStatus, setProgressStatus] = useState(""),
    [pending, setPending] = useState(null),
    annotationSaves = useRef(new Set()),
    progressSaveQueue = useRef(Promise.resolve()),
    progressSaveSequence = useRef(0),
    d = docDetails[cur];
  const lines = useMemo(
      () => (d ? documentLines(d.text) : []),
      [d?.text],
    ),
    a = useMemo(
      () => (d ? [...d.anns].sort((x, y) => x.s - y.s) : []),
      [d?.anns],
    );
  useEffect(() => {
    if (!d || !cur || !me?.u) return;
    let active = true;
    const key = `${me.u}:${cur}`;
    const mine = (d?.rowAssignments || []).filter((x) => x.username === me.u);
    const first =
      me.role !== "admin" && mine.length
        ? Math.min(...mine.map((x) => x.start))
        : 1;
    const fullDocumentAssigned =
      me.role === "admin" ||
      (!mine.length &&
        (d.assignees || (d.as ? [d.as] : [])).includes(me.u));
    setProgressLoadedFor(null);
    setProgressStatus("");
    setPending(null);
    const restoreProgress = async () => {
      let row = first;
      try {
        const saved = await api(
          "GET",
          "/docs/" + encodeURIComponent(cur) + "/progress",
        );
        if (
          Number.isInteger(saved.row) &&
          saved.row >= 1 &&
          saved.row <= lines.length &&
          (fullDocumentAssigned ||
            mine.some(
              (assignment) =>
                saved.row >= assignment.start && saved.row <= assignment.end,
            ))
        )
          row = saved.row;
      } catch (error) {
        notify(
          error.message || "Could not load saved progress. Starting at the first assigned row.",
          "danger",
        );
      }
      if (!active) return;
      setLineIndex(row - 1);
      setLineInput(String(row));
      setProgressLoadedFor(key);
    };
    void restoreProgress();
    return () => {
      active = false;
    };
  }, [cur, d?.id, me?.u]);
  const undo = () => {
    if (!d) return;
    const m = d.anns.filter((n) => n.by === me.u);
    if (!m.length) {
      notify("Nothing to undo.", "info");
      return;
    }
    removeAnnotation(
      m.reduce((a, b) => (+b.id > +a.id ? b : a)),
      "Undo: last entity removed",
    );
  };
  const adjustAnnotationCount = (amount, annotation) =>
    setDb((current) => ({
      ...current,
      docs: current.docs.map((doc) =>
        doc.id !== d.id
          ? doc
          : (() => {
              const anns =
                amount > 0
                  ? [...(doc.anns || []), annotation]
                  : (doc.anns || []).filter(
                      (item) => item.id !== annotation.id,
                    );
              let low = 0;
              let high = lines.length;
              while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (lines[middle].start <= annotation.s) low = middle + 1;
                else high = middle;
              }
              const rowIndex = Math.max(0, low - 1);
              const row = rowIndex + 1;
              const lineStart = lines[rowIndex]?.start || 0;
              const nextLineStart =
                lines[rowIndex + 1]?.start ?? d.text.length + 1;
              const rows = new Set(
                doc.highlightedRowsByUser?.[annotation.by] ||
                  (d.text
                    ? (d.anns || [])
                        .filter((item) => item.by === annotation.by)
                        .map((item) => rowForOffset(d.text, item.s))
                    : []),
              );
              if (amount > 0) rows.add(row);
              else if (
                !d.anns.some(
                  (item) =>
                    item.id !== annotation.id &&
                    item.by === annotation.by &&
                    item.s >= lineStart &&
                    item.s < nextLineStart,
                )
              )
                rows.delete(row);
              const highlightedRowsByUser = {
                ...doc.highlightedRowsByUser,
                [annotation.by]: [...rows],
              };
              return {
                ...doc,
                annCount:
                  typeof doc.annCount === "number"
                    ? Math.max(0, doc.annCount + amount)
                    : doc.annCount,
                anns,
                highlightedRowsByUser,
              };
            })(),
      ),
    }));
  const removeAnnotation = async (annotation, message) => {
    if (String(annotation.id).startsWith("tmp-")) {
      updateDocDetail(d.id, (current) => ({
        ...current,
        anns: current.anns.filter((item) => item.id !== annotation.id),
      }));
      return;
    }
    updateDocDetail(d.id, (current) => ({
      ...current,
      anns: current.anns.filter((item) => item.id !== annotation.id),
    }));
    try {
      await api("DELETE", "/anns/" + annotation.id);
      adjustAnnotationCount(-1, annotation);
      if (message) notify(message, "danger");
    } catch (error) {
      updateDocDetail(d.id, (current) => ({
        ...current,
        anns: [...current.anns, annotation].sort((a, b) => a.s - b.s),
      }));
      notify(error.message || "Could not remove the entity.", "danger");
    }
  };
  const chooseLabel = (label) => {
    if (!pending) {
      setAct(label);
      return;
    }
    // Show the new entity at once; save in the background, then sync with the server.
    const { start, end } = pending,
      docId = d.id,
      saveKey = `${docId}:${start}:${end}`,
      temp = {
        id: "tmp-" + crypto.randomUUID(),
        s: start,
        e: end,
        l: label,
        by: me.u,
      };
    if (annotationSaves.current.has(saveKey)) return;
    annotationSaves.current.add(saveKey);
    setPending(null);
    getSelection()?.removeAllRanges();
    updateDocDetail(d.id, (current) => ({
      ...current,
      anns: [...current.anns, temp],
    }));
    api("POST", "/docs/" + docId + "/anns", { start, end, label })
      .then((result) => {
        updateDocDetail(docId, (current) => ({
          ...current,
          anns: current.anns.map((annotation) =>
            annotation.id === temp.id
              ? { ...annotation, id: String(result.id) }
              : annotation,
          ),
        }));
        adjustAnnotationCount(1, { ...temp, id: String(result.id) });
      })
      .catch(async (error) => {
        updateDocDetail(docId, (current) => ({
          ...current,
          anns: current.anns.filter(
            (annotation) => annotation.id !== temp.id,
          ),
        }));
        if (/overlaps an existing entity/i.test(error.message || "")) {
          try {
            const latest = await api(
              "GET",
              "/docs/" + encodeURIComponent(docId),
            );
            updateDocDetail(docId, () => latest);
            notify(
              "Another annotation overlaps that text. The document was refreshed; select a different span.",
              "info",
            );
          } catch (refreshError) {
            notify(
              `That text overlaps an existing annotation. Could not refresh the document: ${
                refreshError.message || "request failed"
              }`,
              "danger",
            );
          }
        } else {
          notify(error.message || "Could not save the entity.", "danger");
        }
      })
      .finally(() => annotationSaves.current.delete(saveKey));
  };
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "Escape" && pending) {
        setPending(null);
        getSelection()?.removeAllRanges();
      } else if (e.key === "Enter" && pending) {
        const label =
          db.labels.find((item) => item.n === act)?.n || db.labels[0]?.n;
        if (label) {
          e.preventDefault();
          chooseLabel(label);
        }
      } else if (/^[1-9]$/.test(e.key) && db.labels[e.key - 1])
        chooseLabel(db.labels[e.key - 1].n);
      else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "PageDown" && d && !pending) {
        const row = stepRow(lineIndex + 1, 1);
        if (row !== null) {
          e.preventDefault();
          goRow(row);
        }
      } else if (e.key === "PageUp" && d && !pending) {
        const row = stepRow(lineIndex + 1, -1);
        if (row !== null) {
          e.preventDefault();
          goRow(row);
        }
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });
  useLayoutEffect(() => {
    if (!pending || !picker.current || !card.current) return;

    const positionPicker = () => {
      const padding = 8,
        gap = 8,
        cardRect = card.current?.getBoundingClientRect();
      if (!cardRect || !picker.current) return;
      picker.current.style.maxWidth = `${Math.max(0, cardRect.width - padding * 2)}px`;
      const pickerRect = picker.current.getBoundingClientRect(),
        minLeft = cardRect.left + padding,
        maxLeft = Math.max(
          minLeft,
          cardRect.right - pickerRect.width - padding,
        ),
        maxTop = Math.max(
          padding,
          window.innerHeight - pickerRect.height - padding,
        ),
        desiredLeft = pending.manuallyPositioned
          ? pending.left
          : pending.anchorLeft,
        left = Math.max(minLeft, Math.min(desiredLeft, maxLeft)),
        below = pending.anchorBottom + gap,
        above = pending.anchorTop - pickerRect.height - gap,
        desiredTop = pending.manuallyPositioned
          ? pending.top
          : below + pickerRect.height <= window.innerHeight - padding
            ? below
            : above >= padding
              ? above
              : Math.min(below, maxTop),
        top = Math.max(padding, Math.min(desiredTop, maxTop));

      if (pending.left !== left || pending.top !== top)
        setPending((current) =>
          current ? { ...current, left, top } : current,
        );
    };

    positionPicker();
    window.addEventListener("resize", positionPicker);
    return () => window.removeEventListener("resize", positionPicker);
  }, [pending]);
  if (!d)
    return (
      <div className="card mut">
        {loadingDoc !== null && loadingDoc === cur
          ? L("Loading document...")
          : L("Open a document from the Documents tab to start annotating.")}
      </div>
    );
  const cl = db.labels.some((l) => l.n === act) ? act : db.labels[0]?.n,
    col = (n) => db.labels.find((l) => l.n === n)?.c || "#888";
  const rowAssignments = d.rowAssignments || [],
    myRowAssignments = rowAssignments.filter(
      (assignment) => assignment.username === me.u,
    ),
    fullDocumentAssigned =
      !myRowAssignments.length &&
      (d.assignees || (d.as ? [d.as] : [])).includes(me.u),
    rowAssigned = (row) =>
      me.role === "admin" ||
      (myRowAssignments.length
        ? myRowAssignments.some(
            (assignment) => row >= assignment.start && row <= assignment.end,
          )
        : fullDocumentAssigned),
    rowLimit =
      me.role === "admin" || fullDocumentAssigned || !myRowAssignments.length
        ? lines.length
        : Math.max(...myRowAssignments.map((assignment) => assignment.end));
  const goRow = (row) => {
    if (!d || !cur || progressLoadedFor !== `${me.u}:${cur}`) return;
    setPending(null);
    setLineIndex(row - 1);
    setLineInput(String(row));
    const sequence = ++progressSaveSequence.current;
    setProgressStatus("saving");
    progressSaveQueue.current = progressSaveQueue.current
      .catch(() => {})
      .then(() =>
        api("PUT", "/docs/" + encodeURIComponent(cur) + "/progress", { row }),
      )
      .then(() => {
        setDb((current) => ({
          ...current,
          docs: current.docs.map((doc) =>
            doc.id === cur
              ? {
                  ...doc,
                  progressByUser: {
                    ...doc.progressByUser,
                    [me.u]: row,
                  },
                }
              : doc,
          ),
        }));
        if (sequence === progressSaveSequence.current)
          setProgressStatus("saved");
      })
      .catch((error) => {
        if (sequence === progressSaveSequence.current) {
          setProgressStatus("error");
          notify(error.message || "Could not save progress.", "danger");
        }
      });
  };
  // Next / previous row the person may work on (skips rows assigned to others).
  const unrestricted =
    me.role === "admin" || fullDocumentAssigned || !myRowAssignments.length;
  const stepRow = (from, dir) => {
    const target = from + dir;
    if (unrestricted)
      return target >= 1 && target <= lines.length ? target : null;
    if (rowAssigned(target)) return target;
    if (dir > 0) {
      const c = myRowAssignments
        .filter((r) => r.start > from)
        .map((r) => r.start);
      return c.length ? Math.min(...c) : null;
    }
    const c = myRowAssignments.filter((r) => r.end < from).map((r) => r.end);
    return c.length ? Math.max(...c) : null;
  };
  const myRanges = (
    me.role === "admin"
      ? [{ start: 1, end: lines.length }]
      : assignedRows(d, me.u)
  ).sort((x, y) => x.start - y.start);
  const myRowCount = myRanges.reduce((n, r) => n + (r.end - r.start + 1), 0);
  const dragPicker = (event) => {
    if (event.button !== 0 || !picker.current) return;
    event.preventDefault();

    const pickerRect = picker.current.getBoundingClientRect(),
      offsetX = event.clientX - pickerRect.left,
      offsetY = event.clientY - pickerRect.top,
      move = (moveEvent) => {
        const padding = 8,
          rect = picker.current?.getBoundingClientRect(),
          cardRect = card.current?.getBoundingClientRect();
        if (!rect || !cardRect) return;
        const minLeft = cardRect.left + padding,
          maxLeft = Math.max(
            minLeft,
            cardRect.right - rect.width - padding,
          ),
          maxTop = Math.max(padding, window.innerHeight - rect.height - padding),
          left = Math.max(
            minLeft,
            Math.min(moveEvent.clientX - offsetX, maxLeft),
          ),
          top = Math.max(
            padding,
            Math.min(moveEvent.clientY - offsetY, maxTop),
          );
        setPending((current) =>
          current
            ? { ...current, left, top, manuallyPositioned: true }
            : current,
        );
      },
      stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  const sel = () =>
    setTimeout(() => {
      const s = getSelection();
      if (!s.rangeCount || s.isCollapsed || !cl) return;
      const r = s.getRangeAt(0),
        startElement =
          r.startContainer.nodeType === Node.ELEMENT_NODE
            ? r.startContainer
            : r.startContainer.parentElement,
        endElement =
          r.endContainer.nodeType === Node.ELEMENT_NODE
            ? r.endContainer
            : r.endContainer.parentElement,
        A = startElement?.closest("[data-o]"),
        B = endElement?.closest("[data-o]"),
        bx = box.current;
      if (!A || !B || !bx.contains(A) || !bx.contains(B)) return;
      const t = d.text;
      let st = selectionOffset(A, r.startContainer, r.startOffset),
        en = selectionOffset(B, r.endContainer, r.endOffset);
      if (st === null || en === null) return;
      if (
        !rowAssigned(rowForOffset(t, st)) ||
        rowForOffset(t, en - 1) !== rowForOffset(t, st)
      )
        return;
      while (st < en && /\s/.test(t[st])) st++;
      while (en > st && /\s/.test(t[en - 1])) en--;
      [st, en] = snap(t, st, en);
      if (en <= st) return;
      if (a.some((annotation) => st < annotation.e && en > annotation.s)) {
        notify("That text overlaps an existing entity. Remove it first.", "danger");
        return;
      }
      const rect = r.getBoundingClientRect();
      setPending({
        start: st,
        end: en,
        anchorLeft: rect.left,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
        left: rect.left,
        top: rect.bottom + 8,
      });
    }, 50);
  const startTouchSelection = (event) => {
      touchSelection.current =
        event.touches.length === 1
        ? {
            startedAt: Date.now(),
            movedBeforeLongPress: false,
            contextMenuTriggered: false,
          }
          : null;
    },
    trackTouchSelection = () => {
      const touch = touchSelection.current;
      if (touch && Date.now() - touch.startedAt < 500)
        touch.movedBeforeLongPress = true;
    },
  handleTouchContextMenu = (event) => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    if (touchSelection.current)
      touchSelection.current.contextMenuTriggered = true;
    sel();
  },
    endTouchSelection = () => {
      const touch = touchSelection.current;
      touchSelection.current = null;
      if (!touch) return;
    if (touch.movedBeforeLongPress && !touch.contextMenuTriggered) {
        const selection = getSelection(),
          range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (
          range &&
          box.current?.contains(range.startContainer) &&
          box.current?.contains(range.endContainer)
        )
          selection.removeAllRanges();
        return;
      }
      sel();
    };
  const currentLineIndex = Math.min(lineIndex, lines.length - 1),
    currentLine = lines[currentLineIndex],
    rowAnnotations = currentLine
      ? a.filter((n) => n.e > currentLine.start && n.s < currentLine.end)
      : [],
    parts = [];
  let o = currentLine.start;
  a.filter((n) => n.e > currentLine.start && n.s < currentLine.end).forEach(
    (n) => {
      const start = Math.max(n.s, currentLine.start),
        end = Math.min(n.e, currentLine.end);
    if (start < o) return;
    if (start > o)
        parts.push(
          <span key={"t" + o} data-o={o}>
            {d.text.slice(o, start)}
          </span>,
        );
      const c = col(n.l);
      parts.push(
        <mark
          key={n.id}
          data-o={start}
          style={{ background: c + "33", borderBottom: "3px solid " + c }}
        >
          {d.text.slice(start, end)}
          <sup>{n.l}</sup>
        </mark>,
      );
      o = end;
    },
  );
  if (o < currentLine.end)
    parts.push(
      <span key="end" data-o={o}>
        {d.text.slice(o, currentLine.end)}
      </span>,
    );
  return (
    <>
      <div className="card" ref={card}>
        <div className="row">
          <b>{d.title}</b>
          <button
            disabled={me.role !== "admin" && !fullDocumentAssigned}
            onClick={() =>
              run(() => api("PATCH", "/docs/" + d.id, { done: !d.done }), {
                ok: d.done ? "Marked as in progress" : "Marked as done",
              })
            }
          >
            {d.done ? L("Mark as in progress") : L("Mark as done")}
          </button>
          <button onClick={undo}>{L("Undo")}</button>
          <label>
            <input
              id="snap-to-words"
              name="snap-to-words"
              type="checkbox"
              checked={snapOn}
              onChange={(e) => setSnapOn(e.target.checked)}
            />{" "}
            {L("Snap to words")}
          </label>
        </div>
        {d.review === "returned" && d.note && <p className="err">{d.note}</p>}
        {!pending && (
          <div className="row">
            {db.labels.map((l, i) => (
              <button
                key={l.n}
                className={"chip" + (cl === l.n ? " on" : "")}
                style={{
                  borderColor: l.c,
                  ...(cl === l.n ? { background: l.c } : {}),
                }}
                onClick={() => chooseLabel(l.n)}
              >
                {i < 9 ? i + 1 + " " : ""}
                {l.n}
              </button>
            ))}
          </div>
        )}
        <div className="assign-banner">
          <b>
            {me.role === "admin" ? L("All rows") : L("Your assigned rows")}:
          </b>
          {myRanges.map((r) => (
            <button
              key={`${r.start}-${r.end}`}
              className={
                "range-chip" +
                (currentLineIndex + 1 >= r.start &&
                currentLineIndex + 1 <= r.end
                  ? " on"
                  : "")
              }
              title={L("Go to row") + " " + r.start}
              disabled={progressLoadedFor !== `${me.u}:${cur}`}
              onClick={() => goRow(r.start)}
            >
              {L("Rows")} {r.start}–{r.end}
            </button>
          ))}
          <span className="mut">
            ({myRowCount} {L("rows")})
          </span>
          <span
            className={
              "row-badge " +
              (rowAssigned(currentLineIndex + 1) ? "good" : "bad")
            }
          >
            {L("Row")} {currentLineIndex + 1}:{" "}
            {rowAssigned(currentLineIndex + 1)
              ? L("assigned to you")
              : L("not assigned to you")}
          </span>
          {progressStatus && (
            <span className="mut" role="status">
              {L(
                progressStatus === "saving"
                  ? "Saving progress..."
                  : progressStatus === "saved"
                    ? "Progress saved"
                    : "Progress save failed",
              )}
            </span>
          )}
        </div>
        <p className="mut" style={{ margin: "4px 0" }}>
          {L(
            "Select text, then press Enter to use the selected label or 1-9 to tag with a label. Page Up/Down moves between rows. Progress saves automatically.",
          )}
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button
            className="nav-btn nav-prev"
            disabled={
              progressLoadedFor !== `${me.u}:${cur}` ||
              stepRow(currentLineIndex + 1, -1) === null
            }
            onClick={() => goRow(stepRow(currentLineIndex + 1, -1))}
          >
            <span className="nav-ico" aria-hidden="true">
              ←
            </span>
            {L("Previous")}
          </button>
          <form
            className="row"
            style={{ margin: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const row = Number(lineInput);
              if (Number.isInteger(row) && row >= 1 && row <= rowLimit) {
                goRow(row);
              }
            }}
          >
            <label htmlFor="row-number">{L("Row")}</label>
            <input
              id="row-number"
              name="row-number"
              type="number"
              min="1"
              max={rowLimit}
              step="1"
              value={lineInput}
              onChange={(e) => setLineInput(e.target.value)}
              style={{ width: 76 }}
            />
            <span className="mut">/ {rowLimit}</span>
            <button
              type="submit"
              disabled={
                progressLoadedFor !== `${me.u}:${cur}` ||
                !Number.isInteger(Number(lineInput)) ||
                Number(lineInput) < 1 ||
                Number(lineInput) > rowLimit
              }
            >
              {L("Go")}
            </button>
          </form>
          <button
            className="nav-btn nav-next"
            disabled={
              progressLoadedFor !== `${me.u}:${cur}` ||
              stepRow(currentLineIndex + 1, 1) === null
            }
            onClick={() => goRow(stepRow(currentLineIndex + 1, 1))}
          >
            {L("Next")}
            <span className="nav-ico" aria-hidden="true">
              →
            </span>
          </button>
        </div>
        <div
          id="txt"
          ref={box}
          onMouseUp={sel}
          onContextMenu={handleTouchContextMenu}
          onTouchStart={startTouchSelection}
          onTouchMove={trackTouchSelection}
          onTouchEnd={endTouchSelection}
          className={rowAssigned(currentLineIndex + 1) ? "" : "unassigned-row"}
        >
          {rowAssigned(currentLineIndex + 1)
            ? parts
            : L("This row is not assigned to you.")}
        </div>
        {pending && (
          <div
            className="label-picker"
            ref={picker}
            style={{ left: pending.left, top: pending.top }}
            role="group"
            aria-label={L("Choose a label for selected text:")}
          >
            <b className="label-picker-handle" onPointerDown={dragPicker}>
              {d.text.slice(pending.start, pending.end)}
            </b>
            <div className="label-picker-options">
              {db.labels.map((l, i) => (
                <button
                  key={l.n}
                  className="chip"
                  style={{ borderColor: l.c, background: l.c + "26" }}
                  onClick={() => chooseLabel(l.n)}
                >
                  {i < 9 ? i + 1 + " " : ""}
                  {l.n}
                </button>
              ))}
              <button
                onClick={() => {
                  setPending(null);
                  getSelection()?.removeAllRanges();
                }}
              >
                {L("Cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="card tw">
        <table>
          <thead>
            <tr>
              <th>{L("Text")}</th>
              <th>{L("Label")}</th>
              <th>{L("Range")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rowAnnotations.map((n) => (
                <tr key={n.id}>
                  <td>{d.text.slice(n.s, n.e)}</td>
                  <td>
                    <select
                      id={"ann-label-" + n.id}
                      name={"ann-label-" + n.id}
                      value={n.l}
                      onChange={async (e) => {
                        const label = e.target.value;
                        updateDocDetail(d.id, (current) => ({
                          ...current,
                          anns: current.anns.map((annotation) =>
                            annotation.id === n.id
                              ? { ...annotation, l: label }
                              : annotation,
                          ),
                        }));
                        try {
                          await api("PATCH", "/anns/" + n.id, { label });
                          notify(`Label changed to ${label}`, "ok");
                        } catch (error) {
                          updateDocDetail(d.id, (current) => ({
                            ...current,
                            anns: current.anns.map((annotation) =>
                              annotation.id === n.id
                                ? { ...annotation, l: n.l }
                                : annotation,
                            ),
                          }));
                          notify(
                            error.message || "Could not change entity label.",
                            "danger",
                          );
                        }
                      }}
                    >
                      {db.labels.map((l) => (
                        <option key={l.n}>{l.n}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {n.s}–{n.e}
                  </td>
                  <td>
                    <button
                      className="danger"
                      disabled={String(n.id).startsWith("tmp-")}
                      onClick={() => {
                        const text = d.text.slice(n.s, n.e);
                        removeAnnotation(n, `Entity removed: "${text}"`);
                      }}
                    >
                      {L("Remove")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function renderAnnotatedRow(doc, lineStart, rowAnnotations, colorForLabel) {
  let lineEnd = lineStart;
  while (
    lineEnd < doc.text.length &&
    doc.text[lineEnd] !== "\r" &&
    doc.text[lineEnd] !== "\n"
  )
    lineEnd++;
  const parts = [];
  let offset = lineStart;
  for (const annotation of rowAnnotations) {
    const start = Math.max(annotation.s, lineStart);
    const end = Math.min(annotation.e, lineEnd);
    if (start < offset) continue;
    if (start > offset)
      parts.push(
        <span key={`text-${offset}`}>
          {doc.text.slice(offset, start)}
        </span>,
      );
    const color = colorForLabel(annotation.l);
    parts.push(
      <mark
        key={annotation.id}
        style={{
          background: color + "33",
          borderBottom: "3px solid " + color,
        }}
      >
        {doc.text.slice(start, end)}
        <sup>{annotation.l}</sup>
      </mark>,
    );
    offset = end;
  }
  if (offset < lineEnd)
    parts.push(<span key="row-end">{doc.text.slice(offset, lineEnd)}</span>);
  return parts;
}

function collectDataRows(documents, docDetails, annotator, isAdmin, username) {
  const groups = new Map(),
    labelCounts = {};
  let entityCount = 0;
  for (const metadata of documents) {
    const doc = docDetails[metadata.id] || metadata;
    if (typeof doc.text !== "string" || !Array.isArray(doc.anns)) continue;
    const annotations = doc.anns
      .filter((annotation) => {
        const owner = annotation.by || doc.as || "";
        return isAdmin
          ? annotator === "all" || owner === annotator
          : owner === username;
      })
      .sort((a, b) => a.s - b.s);
    let position = 0,
      rowNumber = 1,
      lineStart = 0;
    for (const annotation of annotations) {
      while (position < annotation.s) {
        if (doc.text[position] === "\r") {
          if (doc.text[position + 1] === "\n") position++;
          rowNumber++;
          lineStart = position + 1;
        } else if (doc.text[position] === "\n") {
          rowNumber++;
          lineStart = position + 1;
        }
        position++;
      }
      const key = `${doc.id}:${rowNumber}`;
      let group = groups.get(key);
      if (!group) {
        group = { doc, rowNumber, lineStart, annotations: [] };
        groups.set(key, group);
      }
      group.annotations.push(annotation);
      entityCount++;
      labelCounts[annotation.l] = (labelCounts[annotation.l] || 0) + 1;
    }
  }
  return { rows: [...groups.values()], entityCount, labelCounts };
}

function Data() {
  const { L, me, db, docDetails, loadAllDocDetails } = useContext(C),
    A = me.role === "admin",
    [annotator, setAnnotator] = useState("all"),
    [rowIndex, setRowIndex] = useState(0),
    [detailsLoading, setDetailsLoading] = useState(true),
    [detailsError, setDetailsError] = useState(""),
    [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setDetailsLoading(true);
    setDetailsError("");
    loadAllDocDetails(
      db.docs.filter(
        (doc) => typeof doc.annCount !== "number" || doc.annCount > 0,
      ),
    )
      .catch((error) => {
        if (active)
          setDetailsError(error.message || "Could not load annotation data.");
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db.docs, loadAllDocDetails, reloadKey]);
  const { rows, entityCount, labelCounts } = useMemo(
    () => collectDataRows(db.docs, docDetails, annotator, A, me.u),
    [db.docs, docDetails, annotator, A, me.u],
  );
  const currentIndex = Math.min(rowIndex, Math.max(0, rows.length - 1));
  const col = (n) => db.labels.find((l) => l.n === n)?.c || "#888";
  return (
    <>
      <div className="card">
        {A && (
          <div className="tabs" role="tablist" aria-label={L("Annotator")}>
            {[
              { username: "all", label: L("All annotators") },
              ...db.users
                .filter((user) => user.role === "annotator")
                .map((user) => ({ username: user.u, label: user.u })),
            ].map(({ username, label }) => (
              <button
                key={username}
                id={`data-annotator-${encodeURIComponent(username)}`}
                type="button"
                role="tab"
                aria-selected={annotator === username}
                className={annotator === username ? "on" : ""}
                onClick={() => {
                  setAnnotator(username);
                  setRowIndex(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {detailsLoading ? (
          <span role="status">{L("Loading annotation data...")}</span>
        ) : detailsError ? (
          <div className="assign-msg bad" role="alert">
            {detailsError}{" "}
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              {L("Retry")}
            </button>
          </div>
        ) : (
          <>
            <b>{entityCount}</b> {L("entities")}
            <div className="row" style={{ marginTop: 6 }}>
              {Object.keys(labelCounts).map((k) => (
                <span key={k} className="chip" style={{ borderColor: col(k) }}>
                  {k}: {labelCounts[k]}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="card tw">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button
            disabled={!rows.length || currentIndex === 0}
            onClick={() => setRowIndex(currentIndex - 1)}
          >
            {L("Previous")}
          </button>
          <span className="mut">
            {rows.length ? `${currentIndex + 1} / ${rows.length}` : "0 / 0"}
          </span>
          <button
            disabled={!rows.length || currentIndex >= rows.length - 1}
            onClick={() => setRowIndex(currentIndex + 1)}
          >
            {L("Next")}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>{L("Row")}</th>
              <th>{L("Text")}</th>
              <th>{L("Label")}</th>
              <th>{L("Document")}</th>
              {A && <th>{L("Annotator")}</th>}
              <th>{L("Range")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentIndex, currentIndex + 1).map((group) => {
              const { doc: d, rowNumber, lineStart, annotations } = group;
              return (
                <tr key={`${d.id}:${rowNumber}`}>
                  <td>{rowNumber}</td>
                  <td style={{ whiteSpace: "pre-wrap" }}>
                    {renderAnnotatedRow(d, lineStart, annotations, col)}
                  </td>
                  <td>
                    {annotations.map((annotation) => (
                      <div key={annotation.id}>
                        <span
                          className="chip"
                          style={{ borderColor: col(annotation.l) }}
                        >
                          {annotation.l}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td>{d.title}</td>
                  {A && (
                    <td>
                      {annotations.map((annotation) => (
                        <div key={annotation.id}>
                          {annotation.by || d.as || "-"}
                        </div>
                      ))}
                    </td>
                  )}
                  <td>
                    {annotations.map((annotation) => (
                      <div key={annotation.id}>
                        {annotation.s}–{annotation.e}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!detailsLoading && !detailsError && !rows.length && (
              <tr>
                <td colSpan={A ? 6 : 5} className="mut">
                  {L("No entities yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Labels() {
  const { L, db, run, notify, ask } = useContext(C),
    [n, setN] = useState(""),
    [c, setC] = useState("#f59e0b");
  return (
    <div className="card">
      <div className="row">
        <input
          style={{ width: 200 }}
          id="label-name"
          name="label-name"
          placeholder={L("Label name")}
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
        <input
          id="label-color"
          name="label-color"
          type="color"
          value={c}
          onChange={(e) => setC(e.target.value)}
          style={{ padding: 2, width: 50 }}
        />
        <button
          className="p"
          onClick={async () => {
            const v = n.trim().toUpperCase();
            if (!v) return notify("Enter a label name.", "danger");
            if (db.labels.some((l) => l.n.toUpperCase() === v))
              return notify(
                `Label "${v}" already exists. (409 Conflict)`,
                "danger",
              );
            const err = await run(() => api("POST", "/labels", { n: v, c }), {
              ok: `Label added: ${v}`,
              quiet: true,
            });
            if (err)
              notify(
                /exist|conflict|409/i.test(err)
                  ? `Label "${v}" already exists. (409 Conflict)`
                  : err,
                "danger",
              );
            else setN("");
          }}
        >
          {L("Add label")}
        </button>
      </div>
      <div className="row">
        {db.labels.map((l) => (
          <span key={l.n} className="chip" style={{ borderColor: l.c }}>
            {l.n}{" "}
            <button
              className="danger"
              style={{ padding: "0 6px" }}
              title={L("Delete")}
              onClick={async () => {
                if (
                  !(await ask({
                    title: "Delete label?",
                    message:
                      "Delete this label? Entities that use it may be affected.",
                    detail: l.n,
                    confirmText: "Delete",
                    requiredText: l.n,
                    requiredPrompt:
                      "Type the exact label name to confirm deletion:",
                  }))
                )
                  return;
                await run(
                  () =>
                    api(
                      "DELETE",
                      "/labels/" + encodeURIComponent(l.n),
                    ),
                  {
                    ok: `Deleted label: ${l.n}`,
                    kind: "danger",
                  },
                );
              }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Users() {
  const { L, rl, me, db, run, notify, setMsg, ask } = useContext(C),
    [u, setU] = useState(""),
    [p, setP] = useState(""),
    [r, setR] = useState("annotator"),
    [fb, setFb] = useState(null); // { kind: "ok" | "bad" | "busy", text }
  // An error message goes away when the form is edited; a success message after a few seconds.
  useEffect(() => setFb((f) => (f && f.kind === "bad" ? null : f)), [u, p, r]);
  const add = async () => {
    // The result is shown twice: right under the form (always in view) and as a pop-up.
    const say = (text, kind) => {
      setFb({ kind, text });
      notify(text, kind === "ok" ? "ok" : "danger");
      if (kind === "ok")
        setTimeout(() => setFb((f) => (f && f.kind === "ok" ? null : f)), 5000);
    };
    const name = u.trim();
    if (!name || !p) return say("Enter a username and a password.", "bad");
    if (db.users.some((x) => x.u.toLowerCase() === name.toLowerCase()))
      return say(`User "${name}" already exists.`, "bad");
    setFb({ kind: "busy", text: "" });
    const err = await run(
      () => api("POST", "/users", { u: name, p, role: r }),
      { quiet: true },
    );
    if (err)
      say(
        /exist|taken|duplicate|conflict|409/i.test(err)
          ? `User "${name}" already exists.`
          : err,
        "bad",
      );
    else {
      say(`User created: ${name}`, "ok");
      setU("");
      setP("");
    }
  };
  return (
    <>
      <div className="card">
        <div className="row">
          <input
            id="new-username"
            name="new-username"
            autoComplete="off"
            placeholder={L("Username")}
            value={u}
            onChange={(e) => setU(e.target.value)}
          />
          <input
            id="new-user-password"
            name="new-user-password"
            autoComplete="new-password"
            type="password"
            placeholder={L("Password")}
            value={p}
            onChange={(e) => setP(e.target.value)}
          />
          <select
            id="new-user-role"
            name="new-user-role"
            value={r}
            onChange={(e) => setR(e.target.value)}
          >
            <option value="annotator">{rl("annotator")}</option>
            <option value="admin">{rl("admin")}</option>
          </select>
          <button
            className={
              "p" +
              (fb?.kind === "bad" ? " bad" : fb?.kind === "ok" ? " good" : "")
            }
            disabled={fb?.kind === "busy"}
            onClick={add}
          >
            {fb?.kind === "busy"
              ? L("Creating…")
              : fb?.kind === "ok"
                ? "✓ " + L("User created")
                : L("Create user")}
          </button>
        </div>
        {fb?.text && (
          <p
            className={"assign-msg " + (fb.kind === "ok" ? "good" : "bad")}
            role={fb.kind === "ok" ? "status" : "alert"}
          >
            {fb.text}
          </p>
        )}
      </div>
      <div className="card tw">
        <table>
          <thead>
            <tr>
              <th>{L("Username")}</th>
              <th>{L("Role")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {db.users.map((x) => (
              <tr key={x.u}>
                <td>{x.u}</td>
                <td>{rl(x.role)}</td>
                <td>
                  {x.u !== me.u && (
                    <button
                      className="danger"
                      onClick={async () => {
                        if (
                          !(await ask({
                            title: "Delete user?",
                            message: "This user account will be deleted.",
                            detail: x.u,
                            confirmText: "Delete",
                            requiredText: x.u,
                            requiredPrompt:
                              "Type the exact username to confirm deletion:",
                          }))
                        )
                          return;
                        await run(
                          () =>
                            api(
                              "DELETE",
                              "/users/" + encodeURIComponent(x.u),
                            ),
                          { ok: `Deleted user: ${x.u}`, kind: "danger" },
                        );
                      }}
                    >
                      {L("Delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function sentenceRanges(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const boundaries = new Set();
  try {
    const segments = [
      ...new Intl.Segmenter("km", { granularity: "sentence" }).segment(text),
    ];
    for (const segment of segments.slice(0, -1))
      boundaries.add(segment.index + segment.segment.length);
  } catch (e) {
    const boundary = /(?<=[៕.!?])\s+|(?<=។)\s+|\r?\n+/gu;
    for (const match of text.matchAll(boundary))
      boundaries.add(match.index + match[0].length);
  }
  for (const match of text.matchAll(/[។៕]/gu))
    boundaries.add(match.index + match[0].length);
  const ends = [...boundaries]
    .filter((end) => end > 0 && end < text.length)
    .sort((a, b) => a - b);
  ends.push(text.length);
  let start = 0;
  const ranges = ends.map((end) => {
    const range = { start, end };
    start = end;
    return range;
  });
  return ranges
    .map(({ start, end }) => {
      while (start < end && /\s/u.test(text[start])) start++;
      while (end > start && /\s/u.test(text[end - 1])) end--;
      return { start, end };
    })
    .filter(({ start, end }) => end > start);
}

function exportText(db, annotator = "all") {
  const records = [];
  for (const d of db.docs) {
    if (typeof d.text !== "string" || !Array.isArray(d.anns)) continue;
    const ranges = sentenceRanges(d.text);
    const annotations = d.anns
      .filter(
        (a) =>
          annotator === "all" ||
          (a.by || "") === annotator ||
          (!a.by && (d.assignees || []).includes(annotator)),
      )
      .slice()
      .sort((a, b) => a.s - b.s);
    for (const annotation of annotations) {
      const index = ranges.findIndex(
        ({ start, end }) => annotation.s >= start && annotation.s < end,
      );
      while (
        index >= 0 &&
        annotation.e > ranges[index].end &&
        index + 1 < ranges.length
      ) {
        ranges[index].end = ranges[index + 1].end;
        ranges.splice(index + 1, 1);
      }
    }
    for (const range of ranges) {
      const entities = annotations
        .filter(
          (annotation) =>
            annotation.s >= range.start && annotation.e <= range.end,
        )
        .map((annotation) => ({
          start: annotation.s - range.start,
          end: annotation.e - range.start,
          label: annotation.l,
        }));
      if (!entities.length) continue;
      records.push({
        id: `sent_${String(records.length + 1).padStart(3, "0")}`,
        text: d.text.slice(range.start, range.end),
        entities,
      });
    }
  }
  return JSON.stringify(records, null, 2);
}
function IO() {
  const { L, db, docDetails, load, loadAllDocDetails, me, setMsg } =
    useContext(C),
    fileInput = useRef(null),
    [ta, setTa] = useState(""),
    [selectedFiles, setSelectedFiles] = useState([]),
    [exportAnnotator, setExportAnnotator] = useState("all"),
    [importing, setImporting] = useState(false),
    [preparingExport, setPreparingExport] = useState(false),
    [exportPrepared, setExportPrepared] = useState(false),
    [importProgress, setImportProgress] = useState(""),
    annotators = db.users.filter((u) => u.role === "annotator"),
    exportCandidates = db.docs.filter(
      (d) =>
        d.annCount !== 0 &&
        (me.role !== "admin" ||
          exportAnnotator === "all" ||
          d.assignees?.includes(exportAnnotator) ||
          d.as === exportAnnotator ||
          d.rowAssignments?.some(
            (assignment) => assignment.username === exportAnnotator,
          )),
    ),
    exportDocs = exportPrepared
      ? exportCandidates
          .map((doc) => docDetails[doc.id])
          .filter(
            (doc) =>
              typeof doc?.text === "string" && Array.isArray(doc.anns),
          )
      : [],
    txt = exportText(
      { ...db, docs: exportDocs },
      me.role === "admin" ? exportAnnotator : "all",
    ),
    annotationCount = exportDocs.reduce((total, d) => total + d.anns.length, 0);
  const prepareExport = async () => {
    setPreparingExport(true);
    try {
      await loadAllDocDetails(exportCandidates);
      setExportPrepared(true);
    } catch (error) {
      setMsg(error.message || "Could not prepare export.");
    } finally {
      setPreparingExport(false);
    }
  };
  const parseImport = (raw, name) => {
    let items, labels = [];
    try {
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.docs)
          ? parsed.docs
          : parsed && typeof parsed.text === "string"
            ? [parsed]
            : null;
      if (
        values &&
        values.every(
          (item) =>
            typeof item === "string" ||
            (item && typeof item === "object" && typeof item.text === "string"),
        )
      ) {
        if (!Array.isArray(parsed) && Array.isArray(parsed.labels))
          labels = parsed.labels;
        items = values.map((item, i) =>
          typeof item === "string"
            ? { title: name + " #" + (i + 1), text: item }
            : {
                title: item.title || name + " #" + (i + 1),
                text: item.text,
                assignee: item.assignee,
                done: item.done,
                annotations: item.annotations || [],
              },
        );
      }
    } catch (e) {
      items = undefined;
    }
    if (!items) {
      items = [{ title: name, text: raw }];
    }
    return { labels, docs: items.filter((item) => item.text.trim()) };
  };
  const doImport = async () => {
    setImporting(true);
    setImportProgress("");
    let docs = [],
      labels = [],
      importedCount = 0;
    const maxBatchBytes = 8 * 1024 * 1024;
    const payloadBytes = (nextDocs, nextLabels) =>
      new TextEncoder().encode(
        JSON.stringify({ labels: nextLabels, docs: nextDocs }),
      ).byteLength;
    const flush = async () => {
      if (!docs.length) return;
      const result = await api("POST", "/import", { labels, docs });
      importedCount += result.count;
      docs = [];
      labels = [];
    };
    const addImport = async (raw, name) => {
      const parsed = parseImport(raw, name);
      if (!parsed.docs.length) return;
      if (
        docs.length &&
        payloadBytes([...docs, ...parsed.docs], [...labels, ...parsed.labels]) >
          maxBatchBytes
      )
        await flush();
      const nextDocs = [...docs, ...parsed.docs];
      const nextLabels = [...labels, ...parsed.labels];
      if (payloadBytes(nextDocs, nextLabels) > maxBatchBytes)
        throw new Error(
          `Import "${name}" is too large for a single request. Split it into smaller files.`,
        );
      docs = nextDocs;
      labels = nextLabels;
    };
    const uploadLargeFile = async (file) => {
      const uploadId = crypto.randomUUID(),
        chunkBytes = 1024 * 1024,
        concurrentChunks = 4,
        decoder = new TextDecoder("utf-8");
      let index = 0;
      for (let offset = 0; offset < file.size; offset += chunkBytes * concurrentChunks) {
        const batch = Array.from(
          {
            length: Math.min(
              concurrentChunks,
              Math.ceil((file.size - offset) / chunkBytes),
            ),
          },
          (_, i) => {
            const start = offset + i * chunkBytes;
            const end = Math.min(start + chunkBytes, file.size);
            return { end, bytes: file.slice(start, end).arrayBuffer() };
          },
        );
        const buffers = await Promise.all(batch.map((chunk) => chunk.bytes));
        const requests = [];
        for (let i = 0; i < batch.length; i++) {
          const { end } = batch[i];
          const chunk = decoder.decode(buffers[i], { stream: end < file.size });
          if (chunk)
            requests.push(
              api("POST", "/import/chunk", {
                uploadId,
                index: index++,
                chunk,
              }),
            );
        }
        await Promise.all(requests);
        const uploaded = batch[batch.length - 1].end;
        setImportProgress(
          `Uploading ${file.name}: ${Math.round((uploaded / file.size) * 100)}%`,
        );
      }
      const rest = decoder.decode();
      if (rest)
        await api("POST", "/import/chunk", {
          uploadId,
          index: index++,
          chunk: rest,
        });
      setImportProgress(`Finishing import: ${file.name}`);
      const result = await api("POST", "/import/finish", {
        uploadId,
        chunks: index,
        title: file.name,
      });
      importedCount += result.count;
    };
    try {
      for (const file of selectedFiles) {
        setImportProgress(`Preparing ${file.name}`);
        if (file.size > 4 * 1024 * 1024) {
          await flush();
          await uploadLargeFile(file);
          continue;
        }
        const raw = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () =>
            reject(reader.error || new Error("Unable to read file."));
          reader.readAsText(file);
        });
        await addImport(raw, file.name);
      }
      if (ta.trim()) await addImport(ta, "Pasted");
      await flush();
      if (!importedCount) {
        setMsg("There is no text to import.");
        return;
      }
      setMsg("Imported " + importedCount + " document(s).");
      if (ta.trim()) setTa("");
      void load(me.role);
    } catch (error) {
      setMsg("Could not import: " + error.message);
    } finally {
      setSelectedFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      setImporting(false);
      setImportProgress("");
    }
  };
  const dl = () => {
    try {
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob([txt], {
            type: "application/json;charset=utf-8",
          }),
        );
      a.href = url;
      a.download = "khmer-ner-annotations.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("Export downloaded.");
    } catch (e) {
      setMsg("Could not download export: " + e.message);
    }
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard access is unavailable. Use Download.");
      await navigator.clipboard.writeText(txt);
      setMsg("Export copied to clipboard.");
    } catch (e) {
      setMsg("Could not copy export: " + e.message);
    }
  };
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{L("Import")}</h3>
        <div className="row">
          <input
            id="import-files"
            name="import-files"
            ref={fileInput}
            type="file"
            multiple
            disabled={importing}
            onChange={(e) => setSelectedFiles([...e.currentTarget.files])}
          />
        </div>
        {selectedFiles.length > 0 && (
          <p className="mut">
            {selectedFiles.map((file) => file.name).join(", ")}
          </p>
        )}
        <textarea
          id="import-text"
          name="import-text"
          placeholder={L("Write or paste text here")}
          value={ta}
          onChange={(e) => setTa(e.target.value)}
        />
        <div className="row import-actions" style={{ marginTop: 6 }}>
          <button
            className="p"
            disabled={importing || (!ta.trim() && !selectedFiles.length)}
            onClick={doImport}
          >
            {L("Import")}
          </button>
          {importProgress && (
            <span className="import-progress" role="status">
              {importProgress}
            </span>
          )}
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{L("Export")}</h3>
        {me.role === "admin" && (
          <div className="row" style={{ marginBottom: 8 }}>
            <label>{L("Annotator")}</label>
            <select
              id="export-annotator"
              name="export-annotator"
              value={exportAnnotator}
              onChange={(e) => {
                setExportAnnotator(e.target.value);
                setExportPrepared(false);
              }}
            >
              <option value="all">{L("All annotators")}</option>
              {annotators.map((u) => (
                <option key={u.u} value={u.u}>
                  {u.u}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="mut">
          {L("Documents included")}: {exportPrepared ? exportDocs.length : "—"}{" "}
          · {L("Annotations")}: {exportPrepared ? annotationCount : "—"}
        </p>
        <div className="row">
          <button
            className="p"
            disabled={preparingExport}
            onClick={prepareExport}
          >
            {L(preparingExport ? "Preparing export..." : "Prepare export")}
          </button>
          {!exportPrepared && !preparingExport && (
            <span className="mut">
              {L("Prepare export before copying or downloading.")}
            </span>
          )}
        </div>
        <p className="mut">{L("Export as JSON")}</p>
        <textarea id="export-text" name="export-text" readOnly value={txt} />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="p" disabled={!exportPrepared} onClick={copy}>
            {L("Copy")}
          </button>
          <button disabled={!exportPrepared} onClick={dl}>
            {L("Download")}
          </button>
        </div>
      </div>
    </>
  );
}

function Acct() {
  const { L, setMsg, setWeak } = useContext(C),
    [o, setO] = useState(""),
    [n, setN] = useState("");
  const go = async () => {
    try {
      await api("POST", "/password", { old: o, nw: n });
      setWeak(false);
      setMsg("Password changed.");
      setO("");
      setN("");
    } catch (e) {
      setMsg(e.message);
    }
  };
  return (
    <div className="card">
      <div className="row">
        <input
          id="old-password"
          name="old-password"
          autoComplete="current-password"
          type="password"
          placeholder={L("Old password")}
          value={o}
          onChange={(e) => setO(e.target.value)}
        />
        <input
          id="new-password"
          name="new-password"
          autoComplete="new-password"
          type="password"
          placeholder={L("New password")}
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
        <button className="p" onClick={go}>
          {L("Change password")}
        </button>
      </div>
    </div>
  );
}
