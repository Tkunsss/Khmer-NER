import { createContext, useContext, useEffect, useRef, useState } from "react";
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
  const [qf, setQf] = useState(""),
    [snapOn, setSnapOn] = useState(true);
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
    if (/^(Uploading|Finishing import)/.test(m))
      return notify(m, "info", "progress");
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
    qf,
    setQf,
    snapOn,
    setSnapOn,
    setWeak,
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
      ...(A ? [["labels", "Labels"]] : []),
      ...(A ? [["users", "Users"]] : []),
      ["io", "Import / Export"],
      ["acct", "Account"],
    ];
  const V = {
    tasks: Tasks,
    annotate: Annotate,
    data: Data,
    labels: Labels,
    users: Users,
    io: IO,
    acct: Acct,
  }[tab];
  return (
    <C.Provider value={X}>
      <div className="w">
        <header>
          <h1>Khmer NER Annotator</h1>
          <div className="row">
            <button onClick={toggle}>{lang === "km" ? "EN" : "ខ្មែរ"}</button>
            <span>
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
              onClick={() => {
                setTab(x[0]);
                setMsg("");
              }}
            >
              {L(x[1])}
            </button>
          ))}
        </div>
        <V />
        <Toasts toasts={toasts} dismiss={dismiss} />
      </div>
    </C.Provider>
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
    <div className="card" style={{ maxWidth: 340, margin: "60px auto" }}>
      <h1>Khmer NER Annotator</h1>
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

function Assignment({ d, annotators, L, run }) {
  const current = d.assignees || (d.as ? [d.as] : []);
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [d.assignees, d.as]);
  const changed =
    selected.length !== current.length ||
    selected.some((u) => !current.includes(u));
  const rows = documentLines(d.text).length,
    [username, setUsername] = useState(annotators[0]?.u || ""),
    [start, setStart] = useState("1"),
    [end, setEnd] = useState(String(rows));
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

  const saveAssignment = async () => {
    setSaveState({ ...IDLE, status: "busy" });
    const err = await run(
      () => api("PATCH", "/docs/" + d.id, { assignees: selected }),
      { quiet: true },
    );
    flash(
      setSaveState,
      err
        ? { ...IDLE, status: "error", text: err }
        : { ...IDLE, status: "ok", text: L("Assignment saved.") },
    );
  };

  // Returns an error message (and the conflicting assignments) or null.
  const checkRows = () => {
    const s = +start,
      e = +end;
    if (!annotators.length || !username)
      return { text: L("Choose an annotator.") };
    if (
      !Number.isInteger(s) ||
      !Number.isInteger(e) ||
      s < 1 ||
      e < s ||
      e > rows
    )
      return { text: `${L("Enter a valid row range between 1 and")} ${rows}.` };
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
    const err = await run(
      () =>
        api("PATCH", "/docs/" + d.id, {
          rowAssignment: { username, start: +start, end: +end },
        }),
      { quiet: true },
    );
    flash(
      setRowState,
      err
        ? { ...IDLE, status: "error", text: err }
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
      <details>
        <summary>
          {L("Assign row range")} ({rows})
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
              max={rows}
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
              max={rows}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button
            className={btnClass(rowState)}
            disabled={!annotators.length || rowState.status === "busy"}
            onClick={assignRows}
          >
            {rowState.status === "busy"
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
                      onClick={() =>
                        run(
                          () =>
                            api("PATCH", "/docs/" + d.id, {
                              removeRowAssignment: assignment,
                            }),
                          {
                            ok: `Removed rows ${assignment.start}–${assignment.end} from ${assignment.username}`,
                            kind: "danger",
                          },
                        )
                      }
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
    return [{ start: 1, end: documentLines(d.text).length }];
  return [];
}

function Tasks() {
  const { L, me, db, run, notify, qf, setQf, setCur, setTab } = useContext(C),
    A = me.role === "admin",
    an = db.users.filter((u) => u.role === "annotator"),
    ds = db.docs.filter((d) => !qf || (d.title + d.text).includes(qf)),
    myDocs = db.docs.filter(
      (d) =>
        d.assignees?.includes(me.u) ||
        d.as === me.u ||
        d.rowAssignments?.some((assignment) => assignment.username === me.u),
    );
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
                                  {L("Rows")} {range.start}–{range.end}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        {d.filter((x) => x.done).length}/{d.length}
                      </td>
                      <td>{d.reduce((a, x) => a + x.anns.length, 0)}</td>
                      <td>
                        {d.length
                          ? Math.round(
                              (d.filter((x) => x.done).length / d.length) * 100,
                            )
                          : 0}
                        %
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
                              {L("Rows")} {range.start}–{range.end}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>{myDocs.filter((d) => d.done).length}</td>
                  <td>{myDocs.filter((d) => !d.done).length}</td>
                  <td>
                    {myDocs.reduce(
                      (total, d) => total + (d.anns || []).length,
                      0,
                    )}
                  </td>
                  <td>
                    {myDocs.length
                      ? Math.round(
                          (myDocs.filter((d) => d.done).length /
                            myDocs.length) *
                            100,
                        )
                      : 0}
                    %
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
                  {A && <Assignment d={d} annotators={an} L={L} run={run} />}
                  {stt(d, L)}
                  {d.review === "returned" && d.note && (
                    <>
                      <br />
                      <small className="err">{d.note}</small>
                    </>
                  )}
                </td>
                <td>{d.anns.length}</td>
                <td>
                  <button
                    className="open"
                    onClick={() => {
                      setCur(d.id);
                      setTab("annotate");
                      notify(`Opened: ${d.title}`, "info");
                    }}
                  >
                    {L("Open")}
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this document and all its annotations? This cannot be undone.",
                        )
                      )
                        run(() => api("DELETE", "/docs/" + d.id), {
                          ok: `Deleted document: ${d.title}`,
                          kind: "danger",
                        });
                    }}
                  >
                    {L("Delete")}
                  </button>
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
      run,
      load,
      setDb,
      notify,
      cur,
      act,
      setAct,
      snapOn,
      setSnapOn,
    } = useContext(C),
    box = useRef(null),
    [lineIndex, setLineIndex] = useState(0),
    [lineInput, setLineInput] = useState("1"),
    [pending, setPending] = useState(null),
    d = db.docs.find((x) => x.id === cur);
  useEffect(() => {
    // Annotators start on the first row that was assigned to them.
    const mine = (d?.rowAssignments || []).filter((x) => x.username === me.u);
    const first =
      me.role !== "admin" && mine.length
        ? Math.min(...mine.map((x) => x.start))
        : 1;
    setLineIndex(first - 1);
    setLineInput(String(first));
    setPending(null);
  }, [cur]);
  const undo = () => {
    if (!d) return;
    const m = d.anns.filter((n) => n.by === me.u);
    if (m.length)
      run(
        () =>
          api(
            "DELETE",
            "/anns/" + m.reduce((a, b) => (+b.id > +a.id ? b : a)).id,
          ),
        { ok: "Undo: last entity removed", kind: "danger" },
      );
    else notify("Nothing to undo.", "info");
  };
  const chooseLabel = (label) => {
    if (!pending) {
      setAct(label);
      return;
    }
    // Show the new entity at once; save in the background, then sync with the server.
    const { start, end } = pending,
      docId = d.id,
      temp = { id: "tmp-" + Date.now(), s: start, e: end, l: label, by: me.u };
    setPending(null);
    getSelection()?.removeAllRanges();
    setDb((old) => ({
      ...old,
      docs: old.docs.map((x) =>
        x.id === docId ? { ...x, anns: [...x.anns, temp] } : x,
      ),
    }));
    api("POST", "/docs/" + docId + "/anns", { start, end, label })
      .catch((e) => notify(e.message || "Could not save the entity.", "danger"))
      .finally(() => load(me.role));
  };
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "Escape" && pending) {
        setPending(null);
        getSelection()?.removeAllRanges();
      } else if (/^[1-9]$/.test(e.key) && db.labels[e.key - 1])
        chooseLabel(db.labels[e.key - 1].n);
      else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });
  if (!d)
    return (
      <div className="card mut">
        {L("Open a document from the Documents tab to start annotating.")}
      </div>
    );
  const cl = db.labels.some((l) => l.n === act) ? act : db.labels[0]?.n,
    col = (n) => db.labels.find((l) => l.n === n)?.c || "#888";
  const lines = documentLines(d.text),
    rowAssignments = d.rowAssignments || [],
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
    setPending(null);
    setLineIndex(row - 1);
    setLineInput(String(row));
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
  const sel = () =>
    setTimeout(() => {
      const s = getSelection();
      if (!s.rangeCount || s.isCollapsed || !cl) return;
      const r = s.getRangeAt(0),
        A = r.startContainer.parentElement?.closest("[data-o]"),
        B = r.endContainer.parentElement?.closest("[data-o]"),
        bx = box.current;
      if (!A || !B || !bx.contains(A) || !bx.contains(B)) return;
      const t = d.text;
      let st = +A.dataset.o + r.startOffset,
        en = +B.dataset.o + r.endOffset;
      if (
        !rowAssigned(rowForOffset(t, st)) ||
        rowForOffset(t, en - 1) !== rowForOffset(t, st)
      )
        return;
      while (st < en && /\s/.test(t[st])) st++;
      while (en > st && /\s/.test(t[en - 1])) en--;
      [st, en] = snap(t, st, en);
      if (en <= st) return;
      const rect = r.getBoundingClientRect(),
        left = Math.max(8, Math.min(rect.left, window.innerWidth - 260)),
        top =
          rect.bottom + 58 < window.innerHeight
            ? rect.bottom + 8
            : Math.max(8, rect.top - 58);
      setPending({ start: st, end: en, left, top });
    }, 50);
  const a = [...d.anns].sort((x, y) => x.s - y.s);
  const currentLineIndex = Math.min(lineIndex, lines.length - 1),
    currentLine = lines[currentLineIndex],
    parts = [];
  let o = currentLine.start;
  a.filter((n) => n.e > currentLine.start && n.s < currentLine.end).forEach(
    (n) => {
      const start = Math.max(n.s, currentLine.start),
        end = Math.min(n.e, currentLine.end);
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
      <div className="card">
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
        </div>
        <p className="mut" style={{ margin: "4px 0" }}>
          {L(
            "Select text to tag it with the chosen label. Keys 1-9 pick a label.",
          )}
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button
            disabled={stepRow(currentLineIndex + 1, -1) === null}
            onClick={() => goRow(stepRow(currentLineIndex + 1, -1))}
          >
            {L("Previous")}
          </button>
          <form
            className="row"
            style={{ margin: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const row = Number(lineInput);
              if (Number.isInteger(row) && row >= 1 && row <= rowLimit) {
                setPending(null);
                setLineIndex(row - 1);
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
                !Number.isInteger(Number(lineInput)) ||
                Number(lineInput) < 1 ||
                Number(lineInput) > rowLimit
              }
            >
              {L("Go")}
            </button>
          </form>
          <button
            disabled={stepRow(currentLineIndex + 1, 1) === null}
            onClick={() => goRow(stepRow(currentLineIndex + 1, 1))}
          >
            {L("Next")}
          </button>
        </div>
        <div
          id="txt"
          ref={box}
          onMouseUp={sel}
          onTouchEnd={sel}
          className={rowAssigned(currentLineIndex + 1) ? "" : "unassigned-row"}
        >
          {rowAssigned(currentLineIndex + 1)
            ? parts
            : L("This row is not assigned to you.")}
        </div>
        {pending && (
          <div
            className="label-picker"
            style={{ left: pending.left, top: pending.top }}
            role="group"
            aria-label={L("Choose a label for selected text:")}
          >
            <b>{d.text.slice(pending.start, pending.end)}</b>
            <div className="label-picker-options">
              {db.labels.map((l, i) => (
                <button
                  key={l.n}
                  className="chip"
                  style={{ borderColor: l.c }}
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
            {a.map((n) => (
              <tr key={n.id}>
                <td>{d.text.slice(n.s, n.e)}</td>
                <td>
                  <select
                    id={"ann-label-" + n.id}
                    name={"ann-label-" + n.id}
                    value={n.l}
                    onChange={(e) => {
                      const label = e.target.value;
                      run(() => api("PATCH", "/anns/" + n.id, { label }), {
                        ok: `Label changed to ${label}`,
                      });
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
                    onClick={() =>
                      run(() => api("DELETE", "/anns/" + n.id), {
                        ok: `Entity removed: "${d.text.slice(n.s, n.e)}"`,
                        kind: "danger",
                      })
                    }
                  >
                    {L("Remove")}
                  </button>
                </td>
              </tr>
            ))}
            {!a.length && (
              <tr>
                <td colSpan={4} className="mut">
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

function Data() {
  const { L, me, db } = useContext(C),
    A = me.role === "admin",
    [annotator, setAnnotator] = useState("all"),
    [rowIndex, setRowIndex] = useState(0),
    rows = [],
    cnt = {};
  db.docs.forEach((d) =>
    d.anns.forEach((n) => {
      const owner = n.by || d.as || "";
      if (
        (A && annotator !== "all" && owner !== annotator) ||
        (!A && owner !== me.u)
      )
        return;
      rows.push([d, n]);
      cnt[n.l] = (cnt[n.l] || 0) + 1;
    }),
  );
  const currentIndex = Math.min(rowIndex, Math.max(0, rows.length - 1));
  const col = (n) => db.labels.find((l) => l.n === n)?.c || "#888";
  return (
    <>
      <div className="card">
        {A && (
          <div className="row" style={{ marginBottom: 8 }}>
            <label>{L("Annotator")}</label>
            <select
              id="data-annotator"
              name="data-annotator"
              value={annotator}
              onChange={(e) => {
                setAnnotator(e.target.value);
                setRowIndex(0);
              }}
            >
              <option value="all">{L("All annotators")}</option>
              {db.users
                .filter((u) => u.role === "annotator")
                .map((u) => (
                  <option key={u.u} value={u.u}>
                    {u.u}
                  </option>
                ))}
            </select>
          </div>
        )}
        <b>{rows.length}</b> {L("entities")}
        <div className="row" style={{ marginTop: 6 }}>
          {Object.keys(cnt).map((k) => (
            <span key={k} className="chip" style={{ borderColor: col(k) }}>
              {k}: {cnt[k]}
            </span>
          ))}
        </div>
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
              <th>{L("Text")}</th>
              <th>{L("Label")}</th>
              <th>{L("Document")}</th>
              {A && <th>{L("Annotator")}</th>}
              <th>{L("Range")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentIndex, currentIndex + 1).map(([d, n]) => (
              <tr key={n.id}>
                <td>{d.text.slice(n.s, n.e)}</td>
                <td>{n.l}</td>
                <td>{d.title}</td>
                {A && <td>{n.by || d.as || "-"}</td>}
                <td>
                  {n.s}–{n.e}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="mut">
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
  const { L, db, run, notify } = useContext(C),
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
              onClick={() =>
                run(() => api("DELETE", "/labels/" + encodeURIComponent(l.n)), {
                  ok: `Deleted label: ${l.n}`,
                  kind: "danger",
                })
              }
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
  const { L, rl, me, db, run, notify, setMsg } = useContext(C),
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
                      onClick={() =>
                        run(
                          () =>
                            api("DELETE", "/users/" + encodeURIComponent(x.u)),
                          { ok: `Deleted user: ${x.u}`, kind: "danger" },
                        )
                      }
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
  const { L, db, load, me, setMsg } = useContext(C),
    fileInput = useRef(null),
    [ta, setTa] = useState(""),
    [selectedFiles, setSelectedFiles] = useState([]),
    [exportAnnotator, setExportAnnotator] = useState("all"),
    [importing, setImporting] = useState(false),
    annotators = db.users.filter((u) => u.role === "annotator"),
    exportDocs = db.docs.filter(
      (d) =>
        me.role !== "admin" ||
        exportAnnotator === "all" ||
        d.assignees?.includes(exportAnnotator) ||
        d.as === exportAnnotator ||
        d.rowAssignments?.some(
          (assignment) => assignment.username === exportAnnotator,
        ),
    ),
    txt = exportText(
      { ...db, docs: exportDocs },
      me.role === "admin" ? exportAnnotator : "all",
    ),
    annotationCount = exportDocs.reduce((total, d) => total + d.anns.length, 0);
  const imp = async (raw, name) => {
    if (!raw.trim()) {
      setMsg("There is no text to import.");
      return;
    }
    let items,
      labs = [];
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
          labs = parsed.labels;
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
    try {
      const r = await api("POST", "/import", {
        labels: labs,
        docs: items.filter((x) => x.text.trim()),
      });
      await load(me.role);
      setMsg("Imported " + r.count + " document(s).");
      if (name === "Pasted") setTa("");
    } catch (e) {
      setMsg(e.message);
    }
  };
  const files = async (fs) => {
    for (const f of [...fs]) {
      if (f.size > 4 * 1024 * 1024) {
        const uploadId = crypto.randomUUID(),
          chunkBytes = 1024 * 1024,
          decoder = new TextDecoder("utf-8");
        let index = 0;
        for (let offset = 0; offset < f.size; offset += chunkBytes) {
          const end = Math.min(offset + chunkBytes, f.size),
            bytes = await f.slice(offset, end).arrayBuffer(),
            chunk = decoder.decode(bytes, { stream: end < f.size });
          if (chunk)
            await api("POST", "/import/chunk", {
              uploadId,
              index: index++,
              chunk,
            });
          if (index % 8 === 0)
            setMsg(`Uploading ${f.name}: ${Math.round((end / f.size) * 100)}%`);
        }
        const rest = decoder.decode();
        if (rest)
          await api("POST", "/import/chunk", {
            uploadId,
            index: index++,
            chunk: rest,
          });
        setMsg(`Finishing import: ${f.name}`);
        const r = await api("POST", "/import/finish", {
          uploadId,
          chunks: index,
          title: f.name,
        });
        await load(me.role);
        setMsg("Imported " + r.count + " document(s).");
        continue;
      }
      const raw = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error("Unable to read file."));
        r.readAsText(f);
      });
      await imp(raw, f.name);
    }
  };
  const doImport = async () => {
    setImporting(true);
    try {
      if (selectedFiles.length) await files(selectedFiles);
      if (ta.trim()) await imp(ta, "Pasted");
    } catch (error) {
      setMsg("Could not read file: " + error.message);
    } finally {
      setSelectedFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      setImporting(false);
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
        <div className="row" style={{ marginTop: 6 }}>
          <button
            className="p"
            disabled={importing || (!ta.trim() && !selectedFiles.length)}
            onClick={doImport}
          >
            {L("Import")}
          </button>
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
              onChange={(e) => setExportAnnotator(e.target.value)}
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
          {L("Documents included")}: {exportDocs.length} · {L("Annotations")}:{" "}
          {annotationCount}
        </p>
        <p className="mut">{L("Export as JSON")}</p>
        <textarea id="export-text" name="export-text" readOnly value={txt} />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="p" onClick={copy}>
            {L("Copy")}
          </button>
          <button onClick={dl}>{L("Download")}</button>
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
