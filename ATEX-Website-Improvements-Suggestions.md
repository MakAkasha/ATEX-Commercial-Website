# ATEX Website — Improvement Suggestions

> Backlog captured from the `ux/50-improvements` merge (`main` @ `74f8978`, off base `1b0a144`).
> These were implemented then set aside for re-evaluation. Each item below is an
> independent suggestion — pick, drop, or redesign per item rather than adopting the whole merge.
>
> **Source commits:** `44916bb` · `c5dd880` · `54eb310` · `2cc94b9` · `d23794a` · `895160d`
> **Scope:** 16 files, +2201 / −249 (see stat at bottom).

---

## Global / Foundation

| # | Suggestion |
|---|---|
| 1 | Header collapse-on-scroll (mobile) |
| 3 | Sticky in-page jump-bar on landing, reusing scroll-spy (`section-jumpnav.ejs`) |
| 5 | Persistent breadcrumb trail on solution-detail pages |
| 17 | Per-capability accent hue on solution cards + detail hero/chips |
| 34 | Stop double-rendering marquee content in HTML; JS clones after first paint |
| 35 | Inline SVG for above-fold trust-pill / platform icons |
| 36 | `:active` brightness dip on primary/ghost CTAs |
| 37 | "Launching" spinner state on WhatsApp / tel outbound links |
| 39 | FAQ accordion open duration scales with answer length |
| 40 | Softer hero cycling-word swap — pulsing underline + 150ms cross-fade |
| 41 | Idle-tick on platform LIVE panel so it never visibly freezes |
| 42 | Staggered / emphasized reveal for solution meta-blocks |
| 48 | Replace literal `←` glyphs with CSS-drawn, direction-aware arrows |
| — | **Style pass (`895160d`):** global scale-down, lighter button weights, brand-color WhatsApp button, trustStrip reposition, why/process/faq copy refinements |

## Landing (home.ejs)

| # | Suggestion |
|---|---|
| 6 | Static hero value prop |
| 8 | WhatsApp-primary hero CTA |
| 14 | Real platform sparkline + caption |
| 19 | Asymmetric "why" split layout |
| 20 | Linked Google rating chip |
| 21 | Replace anonymous ★★★★★ quotes with named case studies (real metric) + mobile snap-scroll carousel |
| 24 | In-Kingdom / Jeddah hero pills |
| 26 | Solution-card outcome / audience tags |
| 30 | (landing polish — see commit `c5dd880`) |
| 44 | Chat-vs-form fork on the final CTA |
| 45 | Mid-scroll WhatsApp band after Industries section |

## Solution-detail — Hero

| # | Suggestion |
|---|---|
| 8 (svc) | WhatsApp as primary CTA with pre-filled message |
| 9 | Result-metric + "starting-from" strip |
| 10 | Branded placeholder fallback replacing bare-logo `onerror` |
| 18 | Floating glass metric badge over hero photo |
| 22 | Certification / warranty badge row, conditional per solution |
| 31 | Un-lazy hero image with `fetchpriority` + preload |
| 32 | Solution-specific closing CTA band before cross-sell |
| 38 | Every `wa.me` link site-wide carries a capability-specific pre-filled message (footer popovers, industry-detail, final-cta) |

## Solution-detail — Content

| # | Suggestion |
|---|---|
| 4 | "Who this is for" audience tag under hero H1 + sticky mobile mini-CTA bar (IntersectionObserver) |
| 11 | "ما هو / لمن / ماذا تحصل" plain-language triad after the hero |
| 12 | Tap-to-explain glossary tooltips (GRMS/KNX/Tuya/BMS/PMS/DMX/DALI) — `glossary.json` + shared bottom-sheet module |
| 15 | FAQ grouped by buyer role, with role-label dividers |
| 23 | "كيف ننفذ هذا الحل" 4-step process section (reuses homepage `.processFlow`) |
| 25 | Published warranty / SLA fact-strip (years, SLA hours, support model) |
| 28 | "ماذا يشمل الحل" scope checklist before the detail body |
| 29 | "Starting-from" price anchor before FAQ, with honest custom-quote fallback |

> Data depth added for all 12 solution slugs (5 live get full data, 7 get lighter parity data) in `server/data/solutions.js`.

## Supporting

| # | Suggestion |
|---|---|
| 46 | Low-friction "request a callback" micro-option on solution-detail — inline mini-form (phone + morning/noon/evening chips), posts through existing `/api/contact` |
| 47 | RTL-correct format guidance on contact WhatsApp field (`field__hint`) |
| 50 | Industries panel keyboard/SR accessible (tabindex, role=region, aria-label, RTL arrow-key scroll) + Hijri companion date on platform clock |

## Accessibility

| # | Suggestion |
|---|---|
| 49 | aria-labels for LIVE badge and stat panels |
| 50 | (see Supporting — industries panel a11y) |

---

## Not implemented (no surface)

- **#13** bare use-case chips, **#16** weighted meta-grid bento — live only on solution-detail, skipped on landing.
- **#44** verified already coherent on final-cta + contact-us; no change needed there.

## Change footprint

```
 assets/css/styles.css              | 1148 +++++++++++++++++++++----
 assets/glossary.json               |   37 ++   (new)
 assets/js/glossary.js              |   98 ++   (new)
 assets/js/main.js                  |  265 ++++
 server/data/solutions.js           |  354 ++++
 server/routes/pages.js             |    2 +
 views/contact-us.ejs               |    4 +-
 views/home.ejs                     |  242 +++--
 views/industry-detail.ejs          |    3 +-
 views/partials/final-cta.ejs       |   10 +-
 views/partials/industries-grid.ejs |    4 +-
 views/partials/section-jumpnav.ejs |   10 +    (new)
 views/partials/site-footer.ejs     |    6 +-
 views/partials/site-header.ejs     |    7 +
 views/partials/solutions-grid.ejs  |   31 +-
 views/solution-detail.ejs          |  229 +++-
 16 files changed, 2201 insertions(+), 249 deletions(-)
```

> Full diff recoverable any time: `git diff 1b0a144..74f8978`
