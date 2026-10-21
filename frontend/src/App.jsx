import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { KM, snap, toks, setSnap } from "./lib.js";
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
    [fmt, setFmt] = useState("json"),
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
    fmt,
    setFmt,
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
      ["data", "Data"],
      ["labels", "Labels"],
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
          <p className={/^(Imported|Password changed)/.test(msg) ? "" : "err"}>
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
                </tr>
              </thead>
              <tbody>
                {an.map((u) => {
                  const d = db.docs.filter((x) => x.as === u.u);
                  return (
                    <tr key={u.u}>
                      <td>{u.u}</td>
                      <td>{d.length}</td>
                      <td>
                        {d.filter((x) => x.done).length}/{d.length}
                      </td>
                      <td>{d.reduce((a, x) => a + x.anns.length, 0)}</td>
                    </tr>
                  );
                })}
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
                    <>
                      <select
                        value={d.as}
                        onChange={(e) =>
                          run(() =>
                            api("PATCH", "/docs/" + d.id, {
                              assignee: e.target.value,
                            }),
                          )
                        }
                      >
                        <option value="">{L("Unassigned")}</option>
                        {an.map((u) => (
                          <option key={u.u} value={u.u}>
                            {u.u}
                          </option>
                        ))}
                      </select>
                      <br />
                    </>
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
    d = db.docs.find((x) => x.id === cur);
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
    parts = [];
  let o = 0;
  a.forEach((n) => {
    if (n.s > o)
      parts.push(
        <span key={"t" + o} data-o={o}>
          {d.text.slice(o, n.s)}
        </span>,
      );
    const c = col(n.l);
    parts.push(
      <mark
        key={n.id}
        data-o={n.s}
        style={{ background: c + "33", borderBottom: "3px solid " + c }}
      >
        {d.text.slice(n.s, n.e)}
        <sup>{n.l}</sup>
      </mark>,
    );
    o = n.e;
  });
  if (o < d.text.length)
    parts.push(
      <span key="end" data-o={o}>
        {d.text.slice(o)}
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
    rows = [],
    cnt = {};
  db.docs.forEach((d) =>
    d.anns.forEach((n) => {
      rows.push([d, n]);
      cnt[n.l] = (cnt[n.l] || 0) + 1;
    }),
  );
  const col = (n) => db.labels.find((l) => l.n === n)?.c || "#888";
  return (
    <>
      <div className="card">
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
            {rows.map(([d, n]) => (
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

function exportText(db, fmt) {
  const D = db.docs;
  if (fmt === "spacy")
    return JSON.stringify(
      D.map((d) => [
        d.text,
        {
          entities: [...d.anns]
            .sort((a, b) => a.s - b.s)
            .map((n) => [n.s, n.e, n.l]),
        },
      ]),
      null,
      1,
    );
  if (fmt === "conll")
    return D.map((d) =>
      toks(d.text)
        .map(([a, b]) => {
          const n = d.anns.find((n) => b > n.s && a < n.e);
          return (
            d.text.slice(a, b) +
            "\t" +
            (n ? (a <= n.s ? "B-" : "I-") + n.l : "O")
          );
        })
        .join("\n"),
    ).join("\n\n");
  return JSON.stringify(
    {
      labels: db.labels,
      docs: D.map((d) => ({
        title: d.title,
        text: d.text,
        assignee: d.as,
        done: d.done,
        annotations: d.anns.map((n) => ({
          start: n.s,
          end: n.e,
          label: n.l,
          text: d.text.slice(n.s, n.e),
          by: n.by,
        })),
      })),
    },
    null,
    2,
  );
}
function IO() {
  const { L, db, load, me, fmt, setFmt, setMsg } = useContext(C),
    [sp, setSp] = useState(true),
    splitSentences = useRef(true),
    [ta, setTa] = useState(""),
    [importing, setImporting] = useState(false),
    txt = exportText(db, fmt);
  const imp = async (raw, name) => {
    let items = [],
      labs = [];
    try {
      let j = JSON.parse(raw);
      if (j && j.labels) labs = j.labels;
      if (j && j.docs) j = j.docs;
      if (!Array.isArray(j)) j = [j];
      items = j.map((x, i) =>
        typeof x === "string"
          ? { title: name + " #" + (i + 1), text: x }
          : {
              title: x.title || name + " #" + (i + 1),
              text: x.text || "",
              assignee: x.assignee,
              done: x.done,
              annotations: x.annotations || [],
            },
      );
    } catch (e) {
      if (/\.json$/i.test(name) || /^\s*[\[{]/.test(raw)) {
        setMsg("This JSON could not be read. Check the format.");
        return;
      }
      items = splitSentences.current
        ? raw
            .split(/(?<=។)\s*/)
            .filter((x) => x.trim())
            .map((x, i) => ({ title: name + " #" + (i + 1), text: x.trim() }))
        : [{ title: name, text: raw }];
    }
    try {
      const r = await api("POST", "/import", {
        labels: labs,
        docs: items.filter((x) => x.text),
      });
      await load(me.role);
      setMsg("Imported " + r.count + " document(s).");
    } catch (e) {
      setMsg(e.message);
    }
  };
  const files = async (fs) => {
    for (const f of [...fs]) {
      const raw = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error("Unable to read file."));
        r.readAsText(f);
      });
      await imp(raw, f.name);
    }
  };
  const dl = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([txt], { type: "text/plain;charset=utf-8" }),
    );
    a.download = "khmer-ner." + (fmt === "conll" ? "conll" : "json");
    a.click();
  };
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{L("Import")} JSON / TXT</h3>
        <div className="row">
          <input
            type="file"
            accept=".json,.txt"
            multiple
            disabled={importing}
            onChange={(e) => {
              const input = e.currentTarget;
              setImporting(true);
              files(input.files)
                .catch((error) =>
                  setMsg("Could not read file: " + error.message),
                )
                .finally(() => {
                  input.value = "";
                  setImporting(false);
                });
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={sp}
              onChange={(e) => {
                splitSentences.current = e.target.checked;
                setSp(e.target.checked);
              }}
            />{" "}
            {L("Split into sentences at ។")}
          </label>
        </div>
        <textarea
          placeholder={L("Paste JSON here")}
          value={ta}
          onChange={(e) => setTa(e.target.value)}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="p" onClick={() => imp(ta, "Pasted")}>
            {L("Import")}
          </button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{L("Export")}</h3>
        <div className="row">
          <label>
            {L("Format")}{" "}
            <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
              <option value="json">JSON</option>
              <option value="conll">CoNLL (BIO)</option>
              <option value="spacy">spaCy</option>
            </select>
          </label>
        </div>
        <textarea readOnly value={txt} />
        <div className="row" style={{ marginTop: 6 }}>
          <button
            className="p"
            onClick={() => navigator.clipboard?.writeText(txt)}
          >
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
