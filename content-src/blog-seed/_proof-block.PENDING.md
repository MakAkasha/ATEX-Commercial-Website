# PENDING — proof block (NOT a seed file)

**Do not publish as-is.** Every `{{PLACEHOLDER}}` below is a fact ATEX has not supplied yet.
Replace all of them with verified values, then paste the HTML into the two articles at the
positions listed under "Where to insert". Delete any row whose fact cannot be verified —
do **not** ship an estimate or a rounded guess.

The importer (`tools/import-blog-seeds.js`) reads a hardcoded list of five filenames
(`blog_post_no1.md` … `blog_post_no5.md`), so this file is never picked up. Keep the
`_proof-block.PENDING.md` name until the facts land, then move the HTML into the articles
and delete this file.

## Facts still needed

| Token | What to supply | Notes |
|---|---|---|
| `{{INSTALL_COUNT}}` | Number of completed smart-home / building installs | Count, not "أكثر من" rounding, unless the rounding is defensible |
| `{{FOUNDING_YEAR}}` | Year ATEX started operating | Gregorian |
| `{{KNX_PARTNER_STATUS}}` | Exact KNX membership/certification wording | Must match what the KNX Association actually granted, e.g. "عضو في جمعية KNX" vs "شريك معتمد" — these are different claims |
| `{{REF_PROJECT_1}}` … `{{REF_PROJECT_3}}` | 2–3 anonymized reference projects | Format: type + city + scale, e.g. "فيلا في الرياض، 180 نقطة تحكم، KNX" — no client names without written consent |
| `{{WARRANTY_YEARS}}` | Warranty length ATEX contracts actually carry | State what it covers (devices vs installation vs programming) |
| `{{CITIES_SERVICED}}` | Cities ATEX executes in | Only cities with delivered work, not "we can travel anywhere" |

## HTML to paste

Uses only existing `.art*` component classes and allowed tags/attributes
(`class`/`id` on anything, plus `a[href]`). No `style`, no `aria-*`, no `<svg>`.

```html
<div class="artStats" id="proof-atex">
  <div class="artStat artStat--good">
    <span class="artStat__value">{{INSTALL_COUNT}} مشروع</span>
    <span class="artStat__label">أنظمة منزل ذكي ومبانٍ ذكية سلّمتها أتكس منذ {{FOUNDING_YEAR}}.</span>
  </div>
  <div class="artStat artStat--good">
    <span class="artStat__value">{{KNX_PARTNER_STATUS}}</span>
    <span class="artStat__label">التصميم والبرمجة على KNX تتم داخل الفريق، لا عبر مقاول باطن.</span>
  </div>
  <div class="artStat artStat--good">
    <span class="artStat__value">ضمان {{WARRANTY_YEARS}}</span>
    <span class="artStat__label">يغطي التركيب والبرمجة إضافة إلى ضمان المصنّع على الأجهزة.</span>
  </div>
  <div class="artStat artStat--good">
    <span class="artStat__value">{{CITIES_SERVICED}}</span>
    <span class="artStat__label">مدن نفّذت فيها أتكس مشاريع مسلَّمة ومشغَّلة.</span>
  </div>
</div>

<div class="artTableWrap" id="proof-references">
  <table>
    <thead>
      <tr><th>المشروع</th><th>النظام المنفَّذ</th><th>نقاط التحكم</th></tr>
    </thead>
    <tbody>
      <tr><td>{{REF_PROJECT_1}}</td><td><span class="artTh">النظام المنفَّذ</span>{{REF_1_SYSTEM}}</td><td><span class="artTh">نقاط التحكم</span>{{REF_1_POINTS}}</td></tr>
      <tr><td>{{REF_PROJECT_2}}</td><td><span class="artTh">النظام المنفَّذ</span>{{REF_2_SYSTEM}}</td><td><span class="artTh">نقاط التحكم</span>{{REF_2_POINTS}}</td></tr>
      <tr><td>{{REF_PROJECT_3}}</td><td><span class="artTh">النظام المنفَّذ</span>{{REF_3_SYSTEM}}</td><td><span class="artTh">نقاط التحكم</span>{{REF_3_POINTS}}</td></tr>
    </tbody>
  </table>
</div>

<p class="artNote">أسماء العملاء محجوبة بطلبهم؛ تفاصيل أي مشروع متاحة عند الطلب في اجتماع الدراسة.</p>
```

Drop the `artNote` line if the reference rows end up naming clients with consent.

## Where to insert

- **`blog_post_no5.md` (LONG, `/blog/smart-home-system-types-guide-saudi-arabia`)** —
  immediately after the closing `</ol>` of the six-step process list in
  `<h2 id="contact-atex">شريك تنفيذ لا مورّد أجهزة</h2>`, and **before** the
  `<h3 id="sec-diy-vs-integrator">` paragraph. The section already claims ATEX designs
  rather than supplies; the proof block is what makes that claim checkable.

- **`blog_post_no4.md` (SHORT, `/blog/smart-home-wired-vs-wireless-saudi-arabia`)** —
  use the `artStats` block only (drop the reference table, the article is deliberately
  short) immediately after the closing `</ol>` of the six-step list in
  `<h2 id="contact-atex">كيف تبدأ مع ATEX | أتكس</h2>`, before the closing `.artCta`.

Both ids (`proof-atex`, `proof-references`) are new; nothing else in either article uses
them. If the block is added to both articles, keep the ids — they are page-scoped, so
there is no collision, and sales can deep-link either page.

After inserting, bump the pinned `idCount` values in `test/blog.seed.html.test.js`
(`+1` per new `id` added to each file) and re-run `npm test`.
