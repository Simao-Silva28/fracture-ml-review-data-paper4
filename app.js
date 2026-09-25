/* Data Availability site — vanilla JS, no build step, no external dependencies.
   Renders card-list + sidebar-filter views from static JSON files, plus a
   PRISMA-style funnel summary on the Overview tab. */

const DATA_BASE = "data/";

const state = {
  stage1: null,
  stage2: null,
  stage2b: null,
  stage3: null,
  summary: null,
};

async function loadJSON(name) {
  const res = await fetch(DATA_BASE + name, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load " + name);
  return res.json();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function badgeForDecision(decision) {
  if (!decision) return "";
  const d = decision.toLowerCase();
  if (d.startsWith("include")) return `<span class="badge badge-include">Include</span>`;
  if (d.startsWith("exclude")) return `<span class="badge badge-exclude">Exclude</span>`;
  if (d.startsWith("maybe")) return `<span class="badge badge-maybe">Maybe</span>`;
  return escapeHtml(decision);
}

function badgeForStatus(status) {
  if (!status) return "";
  if (/full-text obtained/i.test(status)) return `<span class="badge badge-include">Full-text obtained</span>`;
  return `<span class="badge badge-maybe">Abstract-only</span>`;
}

function badgeForValidationLevel(level) {
  if (!level) return `<span class="badge badge-unclear">n/a</span>`;
  const l = String(level);
  if (/excluded/i.test(l)) return `<span class="badge badge-excluded" title="${escapeHtml(l)}">Excluded</span>`;
  if (/unclear/i.test(l)) return `<span class="badge badge-unclear">Unclear</span>`;
  const m = l.match(/L(\d)/i);
  if (m) {
    const n = m[1];
    return `<span class="badge badge-l${n}" title="${escapeHtml(l)}">L${n}${/arguable/i.test(l) ? " (arguable)" : ""}</span>`;
  }
  return escapeHtml(l);
}

function badgeForEvidence(ev) {
  if (!ev) return `<span class="badge badge-ev-na">n/a</span>`;
  const e = ev.toLowerCase();
  if (e === "n/a") return `<span class="badge badge-ev-na">N/A</span>`;
  if (e.includes("special")) return `<span class="badge badge-ev-special" title="${escapeHtml(ev)}">Special</span>`;
  if (e.includes("moderate-strong")) return `<span class="badge badge-ev-modstrong">Moderate&ndash;Strong</span>`;
  if (e === "strong") return `<span class="badge badge-ev-strong">Strong</span>`;
  if (e === "moderate") return `<span class="badge badge-ev-moderate">Moderate</span>`;
  if (e.includes("weak-moderate")) return `<span class="badge badge-ev-weakmod">Weak&ndash;Moderate</span>`;
  if (e === "weak") return `<span class="badge badge-ev-weak">Weak</span>`;
  return escapeHtml(ev);
}

function tierForEvidence(ev) {
  if (!ev) return "muted";
  const e = ev.toLowerCase();
  if (e.includes("strong")) return "navy";
  if (e === "moderate") return "teal";
  if (e.includes("weak-moderate")) return "amber";
  if (e === "weak") return "red";
  return "muted";
}

/* ---------- Card list: sortable / searchable / filterable, sidebar UI ---------- */

class CardList {
  constructor({
    mountId,
    sideMountId,
    rows,
    idKey,
    title,
    subtitle,
    metaLeft,
    metaRight,
    tierClass,
    badges,
    searchKeys,
    filters = [],
    sortOptions,
    rowDetail = null,
    detailLink = null,
    emptyLabel = "No entries match the current filters.",
  }) {
    this.mount = document.getElementById(mountId);
    this.sideMount = document.getElementById(sideMountId);
    this.rows = rows;
    this.idKey = idKey;
    this.title = title;
    this.subtitle = subtitle || (() => "");
    this.metaLeft = metaLeft || (() => "");
    this.metaRight = metaRight || (() => "");
    this.tierClass = tierClass || (() => "muted");
    this.badges = badges || (() => []);
    this.searchKeys = searchKeys;
    this.filters = filters; // [{key, label, array?, grid?}]
    this.sortOptions = sortOptions; // [{value:"key:dir", label}]
    this.rowDetail = rowDetail;
    this.detailLink = detailLink; // function(row) -> {href, label} | null
    this.emptyLabel = emptyLabel;

    const [defKey, defDir] = this.sortOptions[0].value.split(":");
    this.sortKey = defKey;
    this.sortDir = parseInt(defDir, 10);
    this.query = "";
    this.activeFilters = {};
    this.expandedId = null;

    this.renderSide();
    this.renderList();
  }

  filteredRows() {
    let rows = this.rows;
    for (const f of this.filters) {
      const val = this.activeFilters[f.key];
      if (!val) continue;
      if (f.array) {
        rows = rows.filter((r) => Array.isArray(r[f.key]) && r[f.key].includes(val));
      } else {
        rows = rows.filter((r) => String(r[f.key] ?? "") === val);
      }
    }
    if (this.query) {
      const q = this.query.toLowerCase();
      rows = rows.filter((r) =>
        this.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q))
      );
    }
    const k = this.sortKey;
    const dir = this.sortDir;
    rows = [...rows].sort((a, b) => {
      let av = a[k], bv = b[k];
      const an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn) && String(an) === String(av).trim()) {
        return (an - bn) * dir;
      }
      av = String(av ?? "").toLowerCase();
      bv = String(bv ?? "").toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }

  distinctValues(f) {
    return f.array
      ? [...new Set(this.rows.flatMap((r) => (Array.isArray(r[f.key]) ? r[f.key] : [])))]
      : [...new Set(this.rows.map((r) => r[f.key]).filter((v) => v !== undefined && v !== null && v !== ""))];
  }

  countFor(f, val) {
    if (f.array) return this.rows.filter((r) => Array.isArray(r[f.key]) && r[f.key].includes(val)).length;
    return this.rows.filter((r) => String(r[f.key] ?? "") === String(val)).length;
  }

  renderSide() {
    if (!this.sideMount) return;
    const el = this.sideMount;
    el.innerHTML = "";

    const searchSection = document.createElement("div");
    searchSection.className = "side-section";
    searchSection.innerHTML = `
      <h4>Search</h4>
      <input type="search" class="search-input" placeholder="Search…" value="${escapeHtml(this.query)}" />
    `;
    el.appendChild(searchSection);

    const sortSection = document.createElement("div");
    sortSection.className = "side-section";
    sortSection.innerHTML = `
      <h4>Sort by</h4>
      <select class="sort-select">
        ${this.sortOptions
          .map(
            (o) =>
              `<option value="${escapeHtml(o.value)}" ${
                o.value === `${this.sortKey}:${this.sortDir}` ? "selected" : ""
              }>${escapeHtml(o.label)}</option>`
          )
          .join("")}
      </select>
    `;
    el.appendChild(sortSection);

    for (const f of this.filters) {
      const values = this.distinctValues(f).sort();
      if (!values.length) continue;
      const section = document.createElement("div");
      section.className = "side-section";
      if (f.grid) {
        section.innerHTML = `
          <h4>${escapeHtml(f.label)}</h4>
          <div class="year-grid" data-filter-key="${f.key}">
            ${values
              .map(
                (v) =>
                  `<button type="button" class="year-chip ${this.activeFilters[f.key] === v ? "active" : ""}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`
              )
              .join("")}
          </div>
        `;
      } else {
        section.innerHTML = `
          <h4>${escapeHtml(f.label)}</h4>
          <div class="chip-row" data-filter-key="${f.key}">
            ${values
              .map(
                (v) =>
                  `<button type="button" class="chip ${this.activeFilters[f.key] === v ? "active" : ""}" data-val="${escapeHtml(v)}">${escapeHtml(v)} <span class="n">${this.countFor(f, v)}</span></button>`
              )
              .join("")}
          </div>
        `;
      }
      el.appendChild(section);
    }

    const footSection = document.createElement("div");
    footSection.className = "side-section";
    footSection.innerHTML = `<button type="button" class="clear-filters">Clear all filters</button>`;
    el.appendChild(footSection);

    el.querySelector(".search-input").addEventListener("input", (e) => {
      this.query = e.target.value;
      this.renderList();
      this.updateCount();
    });
    el.querySelector(".sort-select").addEventListener("change", (e) => {
      const [k, d] = e.target.value.split(":");
      this.sortKey = k;
      this.sortDir = parseInt(d, 10);
      this.renderList();
    });
    el.querySelectorAll("[data-filter-key]").forEach((group) => {
      const key = group.dataset.filterKey;
      group.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = btn.dataset.val;
          this.activeFilters[key] = this.activeFilters[key] === val ? "" : val;
          this.renderSide();
          this.renderList();
        });
      });
    });
    el.querySelector(".clear-filters").addEventListener("click", () => {
      this.activeFilters = {};
      this.query = "";
      this.renderSide();
      this.renderList();
    });
  }

  updateCount() {
    const note = this.mount.parentElement?.querySelector(".result-count");
    if (note) note.textContent = `${this.filteredRows().length} of ${this.rows.length} shown`;
  }

  renderList() {
    const rows = this.filteredRows();

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `<span class="result-count">${rows.length} of ${this.rows.length} shown</span>`;

    const list = document.createElement("div");
    list.className = "card-list";

    if (!rows.length) {
      list.innerHTML = `<div class="card-empty">${escapeHtml(this.emptyLabel)}</div>`;
    }

    for (const row of rows) {
      const rid = String(row[this.idKey]);
      const card = document.createElement("div");
      card.className = `card tier-${this.tierClass(row)}${this.expandedId === rid ? " expanded" : ""}`;
      card.dataset.id = rid;

      const badgesHtml = this.badges(row).filter(Boolean).join("");
      const link = this.detailLink ? this.detailLink(row) : null;
      const linkHtml = link
        ? `<a href="${link.href}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(link.label)} ↗</a>`
        : "";
      const toggleHtml = this.rowDetail
        ? `<button type="button" class="card-toggle">${this.expandedId === rid ? "Hide details" : "Show details"} <span class="arrow">▾</span></button>`
        : "";

      card.innerHTML = `
        <div class="card-top"><span>${escapeHtml(this.metaLeft(row))}</span><span>${escapeHtml(this.metaRight(row))}</span></div>
        <div class="card-title">${this.title(row)}</div>
        <div class="card-sub">${this.subtitle(row)}</div>
        ${badgesHtml ? `<div class="badge-row">${badgesHtml}</div>` : ""}
        ${toggleHtml || linkHtml ? `<div class="card-actions">${toggleHtml}${linkHtml}</div>` : ""}
        ${this.rowDetail && this.expandedId === rid ? `<div class="card-meta">${this.rowDetail(row)}</div>` : ""}
      `;

      if (this.rowDetail) {
        card.addEventListener("click", (e) => {
          if (e.target.closest("a")) return;
          this.expandedId = this.expandedId === rid ? null : rid;
          this.renderList();
        });
      }
      list.appendChild(card);
    }

    this.mount.innerHTML = "";
    this.mount.appendChild(toolbar);
    this.mount.appendChild(list);
  }
}

/* ---------- Tab switching ---------- */

function initTabs() {
  const buttons = document.querySelectorAll("nav.tabs button");
  const panels = document.querySelectorAll(".panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
      if (location.hash !== "#" + btn.dataset.target) {
        history.replaceState(null, "", "#" + btn.dataset.target);
      }
    });
  });
  const hash = location.hash.replace("#", "");
  const target = document.getElementById(hash);
  if (target) {
    document.querySelector(`nav.tabs button[data-target="${hash}"]`)?.click();
  }
}

/* ---------- Detail renderers ---------- */

function stage1Detail(row) {
  const doiHtml = row.doi
    ? `<a href="https://doi.org/${encodeURIComponent(row.doi)}" target="_blank" rel="noopener" class="mono">${escapeHtml(row.doi)}</a>`
    : (row.scopus_url ? `<a href="${escapeHtml(row.scopus_url)}" target="_blank" rel="noopener">View on Scopus</a>` : "&mdash;");
  const citeParts = [row.journal, row.volume ? `Vol. ${row.volume}` : null, row.issue ? `Issue ${row.issue}` : null, row.pages].filter(Boolean);
  return `<div class="detail-grid">
    <div class="detail-item"><dt>DOI</dt><dd>${doiHtml}</dd></div>
    <div class="detail-item"><dt>Authors</dt><dd>${escapeHtml(row.authors) || "&mdash;"}</dd></div>
    <div class="detail-item"><dt>Journal / source</dt><dd>${escapeHtml(citeParts.join(", ")) || "&mdash;"}</dd></div>
    <div class="detail-item"><dt>Open access</dt><dd>${escapeHtml(row.open_access) || "&mdash;"}</dd></div>
    <div class="detail-item"><dt>Document type</dt><dd>${escapeHtml(row.document_type) || "&mdash;"}</dd></div>
    <div class="detail-item"><dt>Duplicate note</dt><dd>${escapeHtml(row.duplicate_note) || "&mdash;"}</dd></div>
    <div class="detail-item" style="grid-column:1/-1"><dt>Screening rationale</dt><dd>${escapeHtml(row.rationale) || "&mdash;"}</dd></div>
    <div class="detail-item" style="grid-column:1/-1"><dt>Author keywords</dt><dd>${escapeHtml(row.author_keywords) || "&mdash;"}</dd></div>
    <div class="detail-item" style="grid-column:1/-1"><dt>Abstract</dt><dd>${escapeHtml(row.abstract) || "&mdash;"}</dd></div>
  </div>`;
}

function stage2Detail(row) {
  const fields = [
    ["Basin / Field", "Basin/Field"],
    ["Formation", "Formation"],
    ["Lithology", "Lithology"],
    ["Reservoir type", "Reservoir Type"],
    ["Depth range", "Depth Range"],
    ["No. wells", "No. Wells"],
    ["Target property", "Target Property"],
    ["Target units / definition", "Target Units/Definition"],
    ["Reference / label source", "Reference/Label Source"],
    ["Predictor logs", "Predictor Logs"],
    ["Feature engineering", "Feature Engineering"],
    ["ML algorithm(s)", "ML Algorithm(s)"],
    ["Validation strategy (as described)", "Validation Strategy (as described)"],
    ["Validation level (raw extraction note)", "Validation Level (1-6)"],
    ["Performance — train", "Performance - Train"],
    ["Performance — test/val", "Performance - Test/Val"],
    ["Sample size — train", "Sample Size Train"],
    ["Sample size — test", "Sample Size Test"],
    ["Data leakage / independence notes", "Data Leakage / Independence Notes"],
    ["Evidence strength (extraction-stage note)", "Evidence Strength"],
    ["Notes / caveats", "Notes / Caveats"],
  ];
  return `<div class="detail-grid">` +
    fields
      .map(
        ([label, key]) =>
          `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(row[key]) || "&mdash;"}</dd></div>`
      )
      .join("") +
    `</div>`;
}

function stage3Detail(row) {
  const fields = [
    ["DOI", "doi"],
    ["Short title", "short_title"],
    ["Basin / field", "basin_field"],
    ["Formation", "formation"],
    ["Lithology", "lithology"],
    ["Reservoir type", "reservoir_type"],
    ["Depth range", "depth_range"],
    ["No. wells", "no_wells"],
    ["Target property", "target_property"],
    ["Target units / definition", "target_units_definition"],
    ["Reference / label source", "reference_label_source"],
    ["Predictor logs", "predictor_logs"],
    ["Feature engineering", "feature_engineering"],
    ["ML algorithm(s)", "ml_algorithms"],
    ["Validation strategy (as described)", "validation_strategy_described"],
    ["Validation level — raw extraction note", "validation_level_raw_extraction"],
    ["Validation level — final classification (Appendix A)", "validation_level_final"],
    ["Performance — train", "performance_train"],
    ["Performance — test/val", "performance_test_val"],
    ["Sample size — train", "sample_size_train"],
    ["Sample size — test", "sample_size_test"],
    ["Data leakage / independence notes", "leakage_independence_notes"],
    ["Evidence strength — final classification (Appendix A)", "evidence_strength_final"],
    ["Notes / caveats", "notes_caveats"],
    ["Role in review", "role_in_review"],
  ];
  const unresolvedNote = row.citation_unresolved
    ? `<p class="unresolved-flag">⚠ Author name could not be independently confirmed for this DOI. See the manuscript's References section for details. Please verify manually before citing.</p>`
    : "";
  const chipRow = (label, cats) =>
    cats && cats.length
      ? `<div class="detail-item" style="grid-column:1/-1"><dt>${escapeHtml(label)}</dt><dd>${cats
          .map((c) => `<span class="badge badge-taxonomy">${escapeHtml(c)}</span>`)
          .join("")}</dd></div>`
      : "";
  const taxonomyHtml =
    `<div class="detail-grid">` +
    chipRow("Target-property taxonomy (Table 1)", row.target_categories) +
    chipRow("Reference-source taxonomy (Table 2)", row.reference_source_categories) +
    chipRow("ML-algorithm-family taxonomy (Table 4)", row.ml_family_categories) +
    chipRow("Feature-engineering taxonomy (Table 5)", row.feature_engineering_categories) +
    `</div>`;
  return unresolvedNote + taxonomyHtml + `<div class="detail-grid">` +
    fields
      .map(
        ([label, key]) =>
          `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(row[key]) || "&mdash;"}</dd></div>`
      )
      .join("") +
    `</div>`;
}

/* ---------- Build card lists ---------- */

function buildStage1List() {
  new CardList({
    mountId: "stage1-list",
    sideMountId: "stage1-side",
    rows: state.stage1,
    idKey: "no",
    title: (r) => escapeHtml(r.title),
    subtitle: (r) => escapeHtml(r.source || ""),
    metaLeft: (r) => `#${r.no}`,
    metaRight: (r) => (r.year || ""),
    tierClass: (r) => {
      const d = (r.decision || "").toLowerCase();
      if (d.startsWith("include")) return "teal";
      if (d.startsWith("exclude")) return "red";
      if (d.startsWith("maybe")) return "amber";
      return "muted";
    },
    badges: (r) => [badgeForDecision(r.decision)],
    detailLink: (r) => (r.doi ? { href: `https://doi.org/${encodeURIComponent(r.doi)}`, label: "DOI" } : null),
    searchKeys: ["title", "source", "rationale", "authors", "abstract", "author_keywords", "doi"],
    filters: [
      { key: "decision", label: "Decision" },
      { key: "year", label: "Year", grid: true },
    ],
    sortOptions: [
      { value: "no:1", label: "# (ascending)" },
      { value: "year:-1", label: "Year (newest first)" },
      { value: "year:1", label: "Year (oldest first)" },
      { value: "title:1", label: "Title (A–Z)" },
    ],
    rowDetail: stage1Detail,
  });
}

function buildStage2List() {
  // state.stage2 already contains all 53 attempted papers (43 full-text + 10
  // abstract-only stubs); state.stage2b is a redundant export of just the 10
  // abstract-only entries, kept for README/per-file traceability. Merging the
  // two naively would double-count those 10 papers, so instead we label each
  // of the 53 rows using stage2b's paper numbers as the abstract-only set.
  const abstractOnlyIds = new Set(state.stage2b.map((r) => r["PaperNo(v2)"]));
  const rows = state.stage2.map((r) => ({
    ...r,
    _status: abstractOnlyIds.has(r["PaperNo(v2)"])
      ? "Abstract-only (excluded from quantitative synthesis)"
      : "Full-text obtained",
  }));
  new CardList({
    mountId: "stage2-list",
    sideMountId: "stage2-side",
    rows,
    idKey: "PaperNo(v2)",
    title: (r) => escapeHtml(r["Short Title"]),
    subtitle: (r) => escapeHtml([r["Basin/Field"], r["Target Property"]].filter(Boolean).join(" · ")),
    metaLeft: (r) => `#${r["PaperNo(v2)"]}`,
    metaRight: () => "",
    tierClass: (r) => (/full-text obtained/i.test(r._status) ? "teal" : "amber"),
    badges: (r) => [badgeForStatus(r._status)],
    searchKeys: ["Short Title", "Basin/Field", "Target Property", "ML Algorithm(s)"],
    filters: [{ key: "_status", label: "Status" }],
    sortOptions: [
      { value: "PaperNo(v2):1", label: "# (ascending)" },
      { value: "Short Title:1", label: "Title (A–Z)" },
    ],
    rowDetail: stage2Detail,
  });
}

function buildStage3List() {
  new CardList({
    mountId: "stage3-list",
    sideMountId: "stage3-side",
    rows: state.stage3,
    idKey: "paper_no",
    title: (r) =>
      r.citation_unresolved
        ? `<span class="badge badge-unresolved">unresolved</span> ${escapeHtml(r.citation)}`
        : escapeHtml(r.citation),
    subtitle: (r) => escapeHtml([r.basin_field, r.target_property].filter(Boolean).join(" · ")),
    metaLeft: (r) => `#${r.paper_no}`,
    metaRight: (r) => escapeHtml(r.ml_algorithms || ""),
    tierClass: (r) => tierForEvidence(r.evidence_strength_final),
    badges: (r) => [badgeForValidationLevel(r.validation_level_final), badgeForEvidence(r.evidence_strength_final)],
    detailLink: (r) => (r.doi ? { href: `https://doi.org/${encodeURIComponent(r.doi)}`, label: "DOI" } : null),
    searchKeys: [
      "citation",
      "basin_field",
      "target_property",
      "ml_algorithms",
      "short_title",
      "target_categories",
      "ml_family_categories",
      "feature_engineering_categories",
      "reference_source_categories",
    ],
    filters: [
      { key: "validation_level_final", label: "Validation level" },
      { key: "evidence_strength_final", label: "Evidence strength" },
      { key: "role_in_review", label: "Role in review" },
      { key: "target_categories", label: "Target-property type", array: true },
      { key: "ml_family_categories", label: "ML algorithm family", array: true },
      { key: "feature_engineering_categories", label: "Feature engineering", array: true },
    ],
    sortOptions: [
      { value: "paper_no:1", label: "# (ascending)" },
      { value: "validation_level_final:1", label: "Validation level" },
      { value: "evidence_strength_final:1", label: "Evidence strength" },
    ],
    rowDetail: stage3Detail,
  });
}

/* ---------- Figures tab: bar charts computed live from the loaded data ---------- */

function bucketValidationLevel(raw) {
  if (!raw) return "Unclear";
  const l = String(raw);
  if (/excluded/i.test(l)) return "Excluded";
  if (/unclear/i.test(l)) return "Unclear";
  const m = l.match(/L(\d)/i);
  if (m) return "L" + m[1];
  return "Other";
}

function bucketEvidence(raw) {
  if (!raw) return "N/A";
  const e = String(raw).toLowerCase();
  if (e === "n/a") return "N/A";
  if (e.includes("special")) return "Special";
  if (e.includes("moderate-strong")) return "Moderate–Strong";
  if (e === "strong") return "Strong";
  if (e === "moderate") return "Moderate";
  if (e.includes("weak-moderate")) return "Weak–Moderate";
  if (e === "weak") return "Weak";
  return "Other";
}

const SEQ = ["var(--chart-seq-1)", "var(--chart-seq-2)", "var(--chart-seq-3)", "var(--chart-seq-4)", "var(--chart-seq-5)"];
const VALIDATION_ORDER = ["L1", "L2", "L4", "L5", "L6"];
const EVIDENCE_ORDER = ["Weak", "Weak–Moderate", "Moderate", "Moderate–Strong", "Strong"];

function colorForValidation(label) {
  const idx = VALIDATION_ORDER.indexOf(label);
  return idx >= 0 ? SEQ[idx] : "var(--ink-faint)";
}
function colorForEvidence(label) {
  const idx = EVIDENCE_ORDER.indexOf(label);
  return idx >= 0 ? SEQ[idx] : "var(--ink-faint)";
}
function colorForDecision(label) {
  if (label === "Include") return "var(--chart-good)";
  if (label === "Exclude") return "var(--chart-critical)";
  if (label === "Maybe") return "var(--chart-warning)";
  return "var(--ink-faint)";
}
function colorForStatus(label) {
  return /full-text obtained/i.test(label) ? "var(--chart-good)" : "var(--chart-warning)";
}

function tallyRows(rows, bucketFn, order) {
  const counts = {};
  for (const r of rows) {
    const b = bucketFn(r);
    counts[b] = (counts[b] || 0) + 1;
  }
  let labels = order.filter((l) => counts[l] !== undefined);
  for (const k of Object.keys(counts)) if (!labels.includes(k)) labels.push(k);
  const total = rows.length;
  return labels.map((l) => ({
    label: l,
    value: counts[l],
    pct: total ? Math.round((counts[l] / total) * 1000) / 10 : 0,
  }));
}

let chartTooltipEl = null;
function ensureTooltip() {
  if (!chartTooltipEl) {
    chartTooltipEl = document.createElement("div");
    chartTooltipEl.className = "chart-tooltip";
    chartTooltipEl.style.display = "none";
    document.body.appendChild(chartTooltipEl);
  }
  return chartTooltipEl;
}

function renderBarChart(el, { rows, colorFor, unitLabel = "papers" }) {
  if (!rows.length) {
    el.innerHTML = `<div class="chart-empty">No papers match the current filters.</div>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  const tooltip = ensureTooltip();

  el.innerHTML = `
    <div class="bar-chart">
      ${rows
        .map(
          (r) => `
        <div class="bar-row" tabindex="0" data-label="${escapeHtml(r.label)}" data-value="${r.value}" data-pct="${r.pct}">
          <div class="bar-label">${escapeHtml(r.label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${((r.value / max) * 100).toFixed(1)}%;background:${colorFor(r.label)}"></div></div>
          <div class="bar-value">${r.value} <span class="bar-pct">(${r.pct}%)</span></div>
        </div>`
        )
        .join("")}
    </div>
    <table class="chart-table">
      <caption class="sr-only">Same data as the chart above, in table form</caption>
      <thead><tr><th>Category</th><th>Count</th><th>Share</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${r.value}</td><td>${r.pct}%</td></tr>`).join("")}
      </tbody>
    </table>
  `;

  el.querySelectorAll(".bar-row").forEach((row) => {
    const show = (e) => {
      tooltip.textContent = `${row.dataset.label}: ${row.dataset.value} ${unitLabel} (${row.dataset.pct}%)`;
      tooltip.style.left = e.clientX + "px";
      tooltip.style.top = e.clientY + "px";
      tooltip.style.display = "block";
    };
    row.addEventListener("mousemove", show);
    row.addEventListener("mouseenter", show);
    row.addEventListener("mouseleave", () => (tooltip.style.display = "none"));
    row.addEventListener("focus", (e) => {
      const rect = row.getBoundingClientRect();
      tooltip.textContent = `${row.dataset.label}: ${row.dataset.value} ${unitLabel} (${row.dataset.pct}%)`;
      tooltip.style.left = rect.left + 60 + "px";
      tooltip.style.top = rect.top + "px";
      tooltip.style.display = "block";
    });
    row.addEventListener("blur", () => (tooltip.style.display = "none"));
  });
}

const CHART_VIEWS = [
  { key: "decision", label: "Screening decision (Stage 1, n=96)" },
  { key: "status", label: "Full-text status (Stage 2, n=53)" },
  { key: "validation", label: "Validation level (Stage 3, n=43)" },
  { key: "evidence", label: "Evidence strength (Stage 3, n=43)" },
];

const CHART_TAXONOMY_FILTERS = [
  { key: "role_in_review", label: "Role in review", array: false },
  { key: "target_categories", label: "Target-property type", array: true },
  { key: "ml_family_categories", label: "ML algorithm family", array: true },
  { key: "feature_engineering_categories", label: "Feature engineering", array: true },
];

const chartState = { view: "decision", taxonomyFilters: {} };

function chartFilteredStage3Rows() {
  let rows = state.stage3;
  for (const f of CHART_TAXONOMY_FILTERS) {
    const val = chartState.taxonomyFilters[f.key];
    if (!val) continue;
    rows = f.array
      ? rows.filter((r) => Array.isArray(r[f.key]) && r[f.key].includes(val))
      : rows.filter((r) => String(r[f.key] ?? "") === val);
  }
  return rows;
}

function renderChartView() {
  const mount = document.getElementById("chart-mount");
  const sideMount = document.getElementById("chart-filters");
  const view = chartState.view;

  document.querySelectorAll("#chart-view-chips .view-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  let title, subtitle, rows, isStage3 = false;

  if (view === "decision") {
    title = "Screening decision";
    subtitle = "All 96 candidate papers, title/abstract screening (Stage 1).";
    rows = tallyRows(state.stage1, (r) => r.decision || "Unspecified", ["Include", "Maybe", "Exclude"]);
    renderBarChart(mount, { rows, colorFor: colorForDecision, unitLabel: "papers" });
  } else if (view === "status") {
    title = "Full-text status";
    subtitle = "All 53 papers taken forward to full-text retrieval (Stage 2).";
    const abstractOnlyIds = new Set(state.stage2b.map((r) => r["PaperNo(v2)"]));
    const withStatus = state.stage2.map((r) => ({
      _status: abstractOnlyIds.has(r["PaperNo(v2)"]) ? "Abstract-only" : "Full-text obtained",
    }));
    rows = tallyRows(withStatus, (r) => r._status, ["Full-text obtained", "Abstract-only"]);
    renderBarChart(mount, { rows, colorFor: colorForStatus, unitLabel: "papers" });
  } else if (view === "validation") {
    isStage3 = true;
    title = "Validation level reached";
    subtitle = "Final review corpus (Stage 3) — narrow with the taxonomy filters alongside.";
    rows = tallyRows(chartFilteredStage3Rows(), (r) => bucketValidationLevel(r.validation_level_final), [...VALIDATION_ORDER, "Excluded", "Unclear"]);
    renderBarChart(mount, { rows, colorFor: colorForValidation, unitLabel: "studies" });
  } else if (view === "evidence") {
    isStage3 = true;
    title = "Evidence strength";
    subtitle = "Final review corpus (Stage 3) — narrow with the taxonomy filters alongside.";
    rows = tallyRows(chartFilteredStage3Rows(), (r) => bucketEvidence(r.evidence_strength_final), [...EVIDENCE_ORDER, "Special", "N/A"]);
    renderBarChart(mount, { rows, colorFor: colorForEvidence, unitLabel: "studies" });
  }

  mount.insertAdjacentHTML(
    "afterbegin",
    `<h3 class="chart-title">${escapeHtml(title)}</h3><p class="chart-subtitle">${escapeHtml(subtitle)}</p>`
  );

  if (!isStage3) {
    sideMount.innerHTML = "";
    return;
  }

  sideMount.innerHTML = CHART_TAXONOMY_FILTERS.map((f) => {
    const values = f.array
      ? [...new Set(state.stage3.flatMap((r) => (Array.isArray(r[f.key]) ? r[f.key] : [])))]
      : [...new Set(state.stage3.map((r) => r[f.key]).filter(Boolean))];
    if (!values.length) return "";
    return `
      <div class="side-section">
        <h4>${escapeHtml(f.label)}</h4>
        <div class="chip-row" data-taxo-key="${f.key}">
          ${values
            .sort()
            .map(
              (v) =>
                `<button type="button" class="chip ${chartState.taxonomyFilters[f.key] === v ? "active" : ""}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`
            )
            .join("")}
        </div>
      </div>`;
  }).join("") + `<div class="side-section"><button type="button" class="clear-filters" id="chart-clear-filters">Clear filters</button></div>`;

  sideMount.querySelectorAll("[data-taxo-key]").forEach((group) => {
    const key = group.dataset.taxoKey;
    group.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.val;
        chartState.taxonomyFilters[key] = chartState.taxonomyFilters[key] === val ? "" : val;
        renderChartView();
      });
    });
  });
  const clearBtn = document.getElementById("chart-clear-filters");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    chartState.taxonomyFilters = {};
    renderChartView();
  });
}

function initChartsPanel() {
  const chipsEl = document.getElementById("chart-view-chips");
  chipsEl.innerHTML = CHART_VIEWS.map(
    (v) => `<button type="button" class="chip view-chip ${v.key === chartState.view ? "active" : ""}" data-view="${v.key}">${escapeHtml(v.label)}</button>`
  ).join("");
  chipsEl.querySelectorAll(".view-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      chartState.view = btn.dataset.view;
      renderChartView();
    });
  });
  renderChartView();
}

function renderFunnel() {
  const s = state.summary;
  const el = document.getElementById("funnel");
  el.innerHTML = `
    <div class="funnel-row">
      <div class="funnel-box">
        <div class="count">${s.stage1_screened_total}</div>
        <div class="label">Candidate papers identified via literature search and screened at title/abstract level</div>
      </div>
    </div>
    <div class="funnel-row">
      <div class="funnel-arrow">↓</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-box excl">
        <div class="count">${s.stage1_decision_counts.Exclude}</div>
        <div class="label">Excluded at screening (out of scope — see Stage 1 table for reasons)</div>
      </div>
      <div class="funnel-box branch">
        <div class="count">${s.stage1_included_or_maybe}</div>
        <div class="label">Marked Include / Maybe, carried toward full-text retrieval</div>
      </div>
    </div>
    <div class="funnel-row">
      <div class="funnel-arrow">↓</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-box excl">
        <div class="count">${s.stage1_maybe_not_carried_forward.length}</div>
        <div class="label">Left at "Maybe", not pursued to full-text stage (papers #${s.stage1_maybe_not_carried_forward.join(", #")})</div>
      </div>
      <div class="funnel-box">
        <div class="count">${s.stage2_fulltext_attempted_total}</div>
        <div class="label">Taken forward to full-text retrieval &amp; systematic extraction</div>
      </div>
    </div>
    <div class="funnel-row">
      <div class="funnel-arrow">↓</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-box excl">
        <div class="count">${s.stage2_abstract_only_excluded}</div>
        <div class="label">Full text not accessible (subscription paywall) — retained as abstract-only, excluded from quantitative synthesis</div>
      </div>
      <div class="funnel-box">
        <div class="count">${s.stage2_fulltext_obtained}</div>
        <div class="label">Full text obtained and systematically extracted (26-field framework)</div>
      </div>
    </div>
    <div class="funnel-row">
      <div class="funnel-arrow">↓</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-box excl">
        <div class="count">${s.stage3_cited_separately_1}</div>
        <div class="label">Reclassified abstract-only after a fetch-status inconsistency check (paper #87) — cited descriptively, not in the quantitative corpus</div>
      </div>
      <div class="funnel-box">
        <div class="count">${s.stage3_core_used_in_paper_taxonomy_and_review}</div>
        <div class="label">Final review corpus (the "42 studies" referenced throughout the manuscript)</div>
      </div>
    </div>
    <div class="funnel-row">
      <div class="funnel-arrow">↓</div>
    </div>
    <div class="funnel-row">
      <div class="funnel-box excl">
        <div class="count">${s.stage3_excluded_from_validation_tally_4}</div>
        <div class="label">Excluded from the Level 1&ndash;6 validation-hierarchy tally (synthetic-only ×2, companion/duplicate ×1, unclassifiable ×1) — still discussed qualitatively</div>
      </div>
      <div class="funnel-box">
        <div class="count">${s.stage3_core_used_in_validation_tally_38}</div>
        <div class="label">Core corpus used for the validation-hierarchy &amp; evidence-strength tally (Sections 6&ndash;7)</div>
      </div>
    </div>
  `;

  document.getElementById("stat-grid").innerHTML = `
    <div class="stat-card"><div class="n">${s.stage1_screened_total}</div><div class="t">Papers screened</div></div>
    <div class="stat-card"><div class="n">${s.stage2_fulltext_attempted_total}</div><div class="t">Full-text retrieval attempted</div></div>
    <div class="stat-card"><div class="n">${s.stage3_final_corpus_total}</div><div class="t">Final corpus entries</div></div>
    <div class="stat-card"><div class="n">${s.stage3_core_used_in_validation_tally_38}</div><div class="t">Used in validation tally</div></div>
  `;

  document.getElementById("stat-strip").innerHTML = `
    <div class="stat"><div class="n">${s.stage1_screened_total}</div><div class="t">Screened</div></div>
    <div class="stat"><div class="n">${s.stage2_fulltext_attempted_total}</div><div class="t">Full-text attempted</div></div>
    <div class="stat"><div class="n">${s.stage3_final_corpus_total}</div><div class="t">Final corpus</div></div>
    <div class="stat"><div class="n">${s.stage3_core_used_in_validation_tally_38}</div><div class="t">Validation tally</div></div>
  `;
}

async function main() {
  const [stage1, stage2, stage2b, stage3, summary] = await Promise.all([
    loadJSON("stage1_screening_96.json"),
    loadJSON("stage2_fulltext_53.json"),
    loadJSON("stage2b_abstract_only_10.json"),
    loadJSON("stage3_final_corpus_43.json"),
    loadJSON("summary_counts.json"),
  ]);
  Object.assign(state, { stage1, stage2, stage2b, stage3, summary });

  renderFunnel();
  buildStage1List();
  buildStage2List();
  buildStage3List();
  initChartsPanel();
  initTabs();
}

main().catch((err) => {
  document.body.innerHTML =
    `<div style="padding:40px;font-family:sans-serif;color:#b3261e;">Failed to load data: ${escapeHtml(err.message)}. If you opened this file directly (file://), most browsers block local fetch() calls — serve the folder with a simple HTTP server (e.g. <code>python3 -m http.server</code>) or use the published GitHub Pages URL instead.</div>`;
});
