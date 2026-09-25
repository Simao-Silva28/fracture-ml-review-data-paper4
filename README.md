# Data Availability — Natural Fractures from Conventional Well Logs (ML Review)

This repository is the supporting dataset for the critical literature review:

> **Reading Natural Fractures from Conventional Well Logs: A Critical Review of Machine-Learning Validation and Generalization** (manuscript in preparation)

It documents every stage of the review's literature funnel — from the 96 candidate papers first identified through the literature search, through title/abstract screening and full-text extraction, to the 42-paper corpus used for the validation-hierarchy analysis in the manuscript — so that any inclusion, exclusion, or classification decision can be checked directly against the underlying record.

**Search strategy.** The 96 candidate records were identified in Scopus using the query:

```
TITLE-ABS-KEY(("natural fracture*" OR "fracture density" OR "fracture intensity" OR "fracture porosity") AND ("well log*" OR "wireline log*" OR "conventional log*") AND ("machine learning" OR "neural network*" OR "deep learning"))
```

No publication-year filter was applied at the query stage. This is a single-database (Scopus) search, not cross-checked against a second index or supplemented with citation snowballing; see the manuscript's Section 1.3 for the full screening funnel and this limitation stated in context. The final-corpus table can be filtered by target-property type, ML-algorithm family, feature-engineering category, validation level, and evidence strength — the same taxonomies used in the manuscript's own tables — and the Figures tab draws its charts live from these same records (nothing there is a static image).

**Live site:** enable GitHub Pages for this repository (Settings → Pages → deploy from the `main` branch, root folder) and the page will be served at `https://<your-username>.github.io/<repo-name>/`. Until then, `index.html` can be viewed by serving this folder locally, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

(Opening `index.html` directly via `file://` will not work in most browsers, because the page loads its data with `fetch()`, which browsers block for local files for security reasons.)

## What is in this repository

| File | Contents |
|---|---|
| `data/stage1_screening_96.json` | All 96 candidate papers identified by the literature search, with the title/abstract-level screening decision (Include / Exclude / Maybe) and documented rationale for each. |
| `data/stage2_fulltext_53.json` | The 43 papers with full text obtained and systematically extracted against the review's 26-field framework (bibliographic, geological, target definition, predictor logs, feature engineering, ML algorithm, validation strategy, performance, leakage notes). |
| `data/stage2b_abstract_only_10.json` | 10 further papers marked Include/Maybe at screening but with no accessible full text (institutional paywall, purchase declined); recorded at abstract/screening-note level only and excluded from the quantitative synthesis. |
| `data/stage3_final_corpus_43.json` | The 42 studies referenced throughout the manuscript, plus one further paper cited only descriptively, merged with each paper's resolved Author-Year citation, DOI, and the final validation-level / evidence-strength classification used in Appendix A. |
| `data/summary_counts.json` | The funnel counts shown on the Overview tab. |
| `index.html`, `assets/app.js`, `assets/style.css` | The static site itself (vanilla HTML/CSS/JS, no build step, no external dependencies). The Figures tab is a set of bar charts computed on the fly from the JSON above — there are no image files in this repository. |

## What is *not* in this repository

The original papers' full texts remain the copyright of their respective publishers and are **not** reproduced here. Every paper is linked by DOI instead. What is original to this review — and shared here under an open license — is the screening log, the extraction records, the validation/evidence classification, and the citation-resolution map.

## Known limitations (stated plainly, not smoothed over)

- Six papers left at "Maybe" during screening (#7, #18, #31, #57, #63, #95) were not subsequently pursued to full-text retrieval.
- Where a paper's own text did not state a field clearly enough to classify, that field is recorded as "unclear" or "not determinable" rather than inferred.

## Reconciliation against the original Scopus export (23 September 2026)

The full 96-paper Scopus BibTeX/CSV export (the source of the literature-search funnel) was obtained and checked row-by-row against this repository's screening log and citation records. All 96 papers matched positionally and by DOI — no new or missing papers were found. The check did surface, and this repository now corrects, three citation-data issues:

- **#2** and **#53** — previously flagged `UNRESOLVED` (author name could not be confirmed) — are now resolved: **Heydarpour and Bahroudi, 2023** and **Dan et al., 2021** respectively, confirmed against the Scopus author metadata.
- **#54** (Yan et al., 2026) — the DOI on file (`10.1016/j.jgp.2026.03.007`) did not actually resolve to this paper. The correct DOI, confirmed against Scopus, is `10.13810/j.cnki.issn.1000-7210.20250083`.

`data/stage1_screening_96.json` has also been enriched with full bibliographic metadata (DOI, journal, volume/issue/pages, abstract, author keywords, ISSN, open-access status) from this export, for all 96 papers — not only the 43 in the final corpus.

## License

- **Data** (everything under `data/`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — reuse with attribution.
- **Code** (`index.html`, `assets/`): [MIT License](https://opensource.org/licenses/MIT).

See `LICENSE` for the full text.

## How to cite

Please cite the manuscript once published. See `CITATION.cff` for machine-readable citation metadata, and consider archiving a release of this repository on [Zenodo](https://zenodo.org) (Settings → connect the repository to Zenodo → cut a GitHub release) so the dataset itself has a permanent, version-specific DOI independent of this GitHub account.
