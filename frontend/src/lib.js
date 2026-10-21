let snapOn = true;
export const setSnap = (v) => {
  snapOn = v;
};
const KM = {
  Documents: "ឯកសារ",
  "My documents": "ឯកសាររបស់ខ្ញុំ",
  Annotate: "ដាក់ស្លាក",
  Data: "ទិន្នន័យ",
  Labels: "ស្លាក",
  Users: "អ្នកប្រើប្រាស់",
  "Import / Export": "នាំចូល / នាំចេញ",
  Account: "គណនី",
  "Sign in": "ចូលប្រើប្រាស់",
  "Sign out": "ចាកចេញ",
  Username: "ឈ្មោះអ្នកប្រើប្រាស់",
  Password: "ពាក្យសម្ងាត់",
  "Annotator progress": "វឌ្ឍនភាពអ្នកដាក់ស្លាក",
  Annotator: "អ្នកដាក់ស្លាក",
  Assigned: "បានចាត់ចែង",
  Done: "រួចរាល់",
  Entities: "អង្គភាព",
  entities: "អង្គភាព",
  Title: "ចំណងជើង",
  "Assigned to": "ចាត់ឱ្យ",
  Unassigned: "មិនទាន់ចាត់ចែង",
  Status: "ស្ថានភាព",
  "In progress": "កំពុងធ្វើ",
  Approved: "បានអនុម័ត",
  Returned: "បានបញ្ជូនត្រឡប់",
  Open: "បើក",
  Delete: "លុប",
  Remove: "ដកចេញ",
  Approve: "អនុម័ត",
  Return: "បញ្ជូនត្រឡប់",
  "Reviewer note": "កំណត់ចំណាំ",
  "Mark as done": "សម្គាល់ថារួចរាល់",
  "Mark as in progress": "សម្គាល់ថាកំពុងធ្វើ",
  Undo: "មិនធ្វើវិញ",
  "Snap to words": "ជ្រើសតាមពាក្យ",
  Text: "អត្ថបទ",
  Label: "ស្លាក",
  Range: "ចន្លោះ",
  Document: "ឯកសារ",
  "Add label": "បន្ថែមស្លាក",
  "Label name": "ឈ្មោះស្លាក",
  "Create user": "បង្កើតអ្នកប្រើ",
  Role: "តួនាទី",
  Search: "ស្វែងរក",
  Import: "នាំចូល",
  Export: "នាំចេញ",
  Copy: "ចម្លង",
  Download: "ទាញយក",
  Format: "ទ្រង់ទ្រាយ",
  "Old password": "ពាក្យសម្ងាត់ចាស់",
  "New password": "ពាក្យសម្ងាត់ថ្មី",
  "Change password": "ប្តូរពាក្យសម្ងាត់",
  "Split into sentences at ។": "បំបែកជាប្រយោគតាម ។",
  "Select text to tag it with the chosen label. Keys 1-9 pick a label.":
    "ជ្រើសអត្ថបទ ដើម្បីដាក់ស្លាក។ ចុចលេខ 1-9 ដើម្បីជ្រើសស្លាក។",
  "Your password is weak. Change it in Account.":
    "ពាក្យសម្ងាត់របស់អ្នកខ្សោយ។ សូមប្តូរនៅក្នុងគណនី។",
  "No entities yet.": "មិនទាន់មានអង្គភាព។",
  "Open a document from the Documents tab to start annotating.":
    "សូមបើកឯកសារពីផ្ទាំងឯកសារ ដើម្បីចាប់ផ្តើមដាក់ស្លាក។",
  "No documents yet.": "មិនទាន់មានឯកសារ។",
  "Paste JSON here": "បិទភ្ជាប់ JSON នៅទីនេះ",
};
const isMk = (c) => /[\u17B6-\u17D3\u17DD]/.test(c || "");
function segs(t) {
  try {
    return [...new Intl.Segmenter("km", { granularity: "word" }).segment(t)];
  } catch (e) {
    return [];
  }
}
function snap(t, st, en) {
  if (snapOn)
    for (const g of segs(t)) {
      const a = g.index,
        b = a + g.segment.length;
      if (st >= a && st < b) st = a;
      if (en > a && en <= b) en = b;
    }
  while (st > 0 && isMk(t[st])) st--;
  while (en < t.length && isMk(t[en])) en++;
  return [st, en];
}
function toks(t) {
  const g = segs(t)
    .filter((x) => /\S/.test(x.segment))
    .map((x) => [x.index, x.index + x.segment.length]);
  return g.length
    ? g
    : [...t.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length]);
}

export { KM, snap, toks };
