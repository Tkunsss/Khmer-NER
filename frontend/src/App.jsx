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
    [msg, setMsg] = useState(""),
    [weak, setWeak] = useState(false);
  const [qf, setQf] = useState(""),
    [snapOn, setSnapOn] = useState(true);
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
  const run = async (f) => {
    setMsg("");
    try {
      await f();
    } catch (e) {
      setMsg(e.message);
    }
    await load(me.role);
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
    setMsg,
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
        {msg && (
          <p
            className={
              /^(Imported|Password changed|Export copied|Export downloaded)/.test(
                msg,
              )
                ? ""
                : "err"
            }
          >
            {msg}
          </p>
        )}
        <V />
      </div>
    </C.Provider>
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
          placeholder={L("Username")}
          value={u}
          onChange={(x) => setU(x.target.value)}
        />
      </div>
      <div className="row">
        <input
          style={{ width: "100%" }}
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
    run(() => api("PATCH", "/docs/" + d.id, { review: r, note: n }));
  return (
    <>
      <br />
      <input
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
  const changed = selected.length !== current.length || selected.some((u) => !current.includes(u));
  return (
    <div className="assignment">
      <details>
        <summary>{current.length ? `${L("Assigned to")}: ${current.join(", ")}` : L("Unassigned")}</summary>
        <div className="assignment-options">
          {annotators.map((u) => (
            <label key={u.u}>
              <input type="checkbox" checked={selected.includes(u.u)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, u.u] : old.filter((x) => x !== u.u))} />
              {u.u}
            </label>
          ))}
          <button className="p" disabled={!changed} onClick={() => run(() => api("PATCH", "/docs/" + d.id, { assignees: selected }))}>{L("Save assignment")}</button>
        </div>
      </details>
    </div>
  );
}

function Tasks() {
  const { L, me, db, run, qf, setQf, setCur, setTab } = useContext(C),
    A = me.role === "admin",
    an = db.users.filter((u) => u.role === "annotator"),
    ds = db.docs.filter((d) => !qf || (d.title + d.text).includes(qf));
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
                  const d = db.docs.filter((x) => x.assignees?.includes(u.u) || x.as === u.u);
                  return (
                    <tr key={u.u}>
                      <td>{u.u}</td>
                      <td>{d.length}</td>
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
                  <td>{db.docs.length}</td>
                  <td>{db.docs.filter((d) => d.done).length}</td>
                  <td>{db.docs.filter((d) => !d.done).length}</td>
                  <td>
                    {db.docs.reduce((total, d) => total + d.anns.length, 0)}
                  </td>
                  <td>
                    {db.docs.length
                      ? Math.round(
                          (db.docs.filter((d) => d.done).length /
                            db.docs.length) *
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
                    <Assignment d={d} annotators={an} L={L} run={run} />
                  )}
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
                    onClick={() => {
                      setCur(d.id);
                      setTab("annotate");
                    }}
                  >
                    {L("Open")}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this document and all its annotations? This cannot be undone.",
                        )
                      )
                        run(() => api("DELETE", "/docs/" + d.id));
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
  const { L, me, db, run, cur, act, setAct, snapOn, setSnapOn } = useContext(C),
    box = useRef(null),
    [lineIndex, setLineIndex] = useState(0),
    [lineInput, setLineInput] = useState("1"),
    d = db.docs.find((x) => x.id === cur);
  useEffect(() => {
    setLineIndex(0);
    setLineInput("1");
  }, [cur]);
  const undo = () => {
    if (!d) return;
    const m = d.anns.filter((n) => n.by === me.u);
    if (m.length)
      run(() =>
        api(
          "DELETE",
          "/anns/" + m.reduce((a, b) => (+b.id > +a.id ? b : a)).id,
        ),
      );
  };
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (/^[1-9]$/.test(e.key) && db.labels[e.key - 1])
        setAct(db.labels[e.key - 1].n);
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
      while (st < en && /\s/.test(t[st])) st++;
      while (en > st && /\s/.test(t[en - 1])) en--;
      [st, en] = snap(t, st, en);
      if (en <= st) return;
      s.removeAllRanges();
      run(() =>
        api("POST", "/docs/" + d.id + "/anns", {
          start: st,
          end: en,
          label: cl,
        }),
      );
    }, 50);
  const a = [...d.anns].sort((x, y) => x.s - y.s),
    lines = [];
  let lineStart = 0;
  for (let i = 0; i < d.text.length; i++) {
    if (d.text[i] === "\n" || d.text[i] === "\r") {
      lines.push({ start: lineStart, end: i, text: d.text.slice(lineStart, i) });
      if (d.text[i] === "\r" && d.text[i + 1] === "\n") i++;
      lineStart = i + 1;
    }
  }
  lines.push({
    start: lineStart,
    end: d.text.length,
    text: d.text.slice(lineStart),
  });
  const currentLineIndex = Math.min(lineIndex, lines.length - 1),
    currentLine = lines[currentLineIndex],
    parts = [];
  let o = currentLine.start;
  a.filter((n) => n.e > currentLine.start && n.s < currentLine.end).forEach((n) => {
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
  });
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
            onClick={() =>
              run(() => api("PATCH", "/docs/" + d.id, { done: !d.done }))
            }
          >
            {d.done ? L("Mark as in progress") : L("Mark as done")}
          </button>
          <button onClick={undo}>{L("Undo")}</button>
          <label>
            <input
              type="checkbox"
              checked={snapOn}
              onChange={(e) => setSnapOn(e.target.checked)}
            />{" "}
            {L("Snap to words")}
          </label>
        </div>
        {d.review === "returned" && d.note && <p className="err">{d.note}</p>}
        <div className="row">
          {db.labels.map((l, i) => (
            <button
              key={l.n}
              className={"chip" + (cl === l.n ? " on" : "")}
              style={{
                borderColor: l.c,
                ...(cl === l.n ? { background: l.c } : {}),
              }}
              onClick={() => setAct(l.n)}
            >
              {i < 9 ? i + 1 + " " : ""}
              {l.n}
            </button>
          ))}
        </div>
        <p className="mut" style={{ margin: "4px 0" }}>
          {L(
            "Select text to tag it with the chosen label. Keys 1-9 pick a label.",
          )}
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button
            disabled={currentLineIndex === 0}
            onClick={() => {
              const nextIndex = currentLineIndex - 1;
              setLineIndex(nextIndex);
              setLineInput(String(nextIndex + 1));
            }}
          >
            {L("Previous")}
          </button>
          <form
            className="row"
            style={{ margin: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const row = Number(lineInput);
              if (Number.isInteger(row) && row >= 1 && row <= lines.length)
                setLineIndex(row - 1);
            }}
          >
            <label htmlFor="row-number">{L("Row")}</label>
            <input
              id="row-number"
              type="number"
              min="1"
              max={lines.length}
              step="1"
              value={lineInput}
              onChange={(e) => setLineInput(e.target.value)}
              style={{ width: 76 }}
            />
            <span className="mut">/ {lines.length}</span>
            <button
              type="submit"
              disabled={
                !Number.isInteger(Number(lineInput)) ||
                Number(lineInput) < 1 ||
                Number(lineInput) > lines.length
              }
            >
              {L("Go")}
            </button>
          </form>
          <button
            disabled={currentLineIndex >= lines.length - 1}
            onClick={() => {
              const nextIndex = currentLineIndex + 1;
              setLineIndex(nextIndex);
              setLineInput(String(nextIndex + 1));
            }}
          >
            {L("Next")}
          </button>
        </div>
        <div id="txt" ref={box} onMouseUp={sel} onTouchEnd={sel}>
          {parts}
        </div>
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
                    value={n.l}
                    onChange={(e) =>
                      run(() =>
                        api("PATCH", "/anns/" + n.id, {
                          label: e.target.value,
                        }),
                      )
                    }
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
                    onClick={() => run(() => api("DELETE", "/anns/" + n.id))}
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
      if ((A && annotator !== "all" && owner !== annotator) || (!A && owner !== me.u))
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
            <select value={annotator} onChange={(e) => { setAnnotator(e.target.value); setRowIndex(0); }}>
              <option value="all">{L("All annotators")}</option>
              {db.users.filter((u) => u.role === "annotator").map((u) => (
                <option key={u.u} value={u.u}>{u.u}</option>
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
          <button disabled={!rows.length || currentIndex === 0} onClick={() => setRowIndex(currentIndex - 1)}>{L("Previous")}</button>
          <span className="mut">{rows.length ? `${currentIndex + 1} / ${rows.length}` : "0 / 0"}</span>
          <button disabled={!rows.length || currentIndex >= rows.length - 1} onClick={() => setRowIndex(currentIndex + 1)}>{L("Next")}</button>
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
  const { L, db, run } = useContext(C),
    [n, setN] = useState(""),
    [c, setC] = useState("#f59e0b");
  return (
    <div className="card">
      <div className="row">
        <input
          style={{ width: 200 }}
          placeholder={L("Label name")}
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
        <input
          type="color"
          value={c}
          onChange={(e) => setC(e.target.value)}
          style={{ padding: 2, width: 50 }}
        />
        <button
          className="p"
          onClick={() => {
            const v = n.trim().toUpperCase();
            if (v) {
              run(() => api("POST", "/labels", { n: v, c }));
              setN("");
            }
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
              style={{ padding: "0 6px" }}
              onClick={() =>
                run(() => api("DELETE", "/labels/" + encodeURIComponent(l.n)))
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
  const { L, rl, me, db, run, setMsg } = useContext(C),
    [u, setU] = useState(""),
    [p, setP] = useState(""),
    [r, setR] = useState("annotator");
  const add = () => {
    if (!u.trim() || !p) {
      setMsg("Enter a username and a password.");
      return;
    }
    run(() => api("POST", "/users", { u: u.trim(), p, role: r }));
    setU("");
    setP("");
  };
  return (
    <>
      <div className="card">
        <div className="row">
          <input
            placeholder={L("Username")}
            value={u}
            onChange={(e) => setU(e.target.value)}
          />
          <input
            type="password"
            placeholder={L("Password")}
            value={p}
            onChange={(e) => setP(e.target.value)}
          />
          <select value={r} onChange={(e) => setR(e.target.value)}>
            <option value="annotator">{rl("annotator")}</option>
            <option value="admin">{rl("admin")}</option>
          </select>
          <button className="p" onClick={add}>
            {L("Create user")}
          </button>
        </div>
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
                      onClick={() =>
                        run(() =>
                          api("DELETE", "/users/" + encodeURIComponent(x.u)),
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
      .filter((a) => annotator === "all" || (a.by || "") === annotator || (!a.by && (d.assignees || []).includes(annotator)))
      .slice().sort((a, b) => a.s - b.s);
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
    exportDocs = db.docs.filter((d) => me.role !== "admin" || exportAnnotator === "all" || d.assignees?.includes(exportAnnotator) || d.as === exportAnnotator),
    txt = exportText({ ...db, docs: exportDocs }, me.role === "admin" ? exportAnnotator : "all"),
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
            await api("POST", "/import/chunk", { uploadId, index: index++, chunk });
          if (index % 8 === 0)
            setMsg(`Uploading ${f.name}: ${Math.round((end / f.size) * 100)}%`);
        }
        const rest = decoder.decode();
        if (rest)
          await api("POST", "/import/chunk", { uploadId, index: index++, chunk: rest });
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
            ref={fileInput}
            type="file"
            multiple
            disabled={importing}
            onChange={(e) => setSelectedFiles([...e.currentTarget.files])}
          />
        </div>
        {selectedFiles.length > 0 && (
          <p className="mut">{selectedFiles.map((file) => file.name).join(", ")}</p>
        )}
        <textarea
          placeholder={L("Write or paste text here")}
          value={ta}
          onChange={(e) => setTa(e.target.value)}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="p" disabled={importing || (!ta.trim() && !selectedFiles.length)} onClick={doImport}>
            {L("Import")}
          </button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{L("Export")}</h3>
        {me.role === "admin" && (
          <div className="row" style={{ marginBottom: 8 }}>
            <label>{L("Annotator")}</label>
            <select value={exportAnnotator} onChange={(e) => setExportAnnotator(e.target.value)}>
              <option value="all">{L("All annotators")}</option>
              {annotators.map((u) => <option key={u.u} value={u.u}>{u.u}</option>)}
            </select>
          </div>
        )}
        <p className="mut">
          {L("Documents included")}: {exportDocs.length} · {L("Annotations")}:{" "}
          {annotationCount}
        </p>
        <p className="mut">{L("Export as JSON")}</p>
        <textarea readOnly value={txt} />
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
          type="password"
          placeholder={L("Old password")}
          value={o}
          onChange={(e) => setO(e.target.value)}
        />
        <input
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
