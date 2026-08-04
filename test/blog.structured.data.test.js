"use strict";

/**
 * Blog post JSON-LD, end to end: create a post through the admin API, fetch the
 * public page, and assert on the @graph that views/partials/structured-data.ejs
 * emitted. Also covers the round trip of in-body `id` attributes through
 * sanitizePostHtml (save) and again at render time (server/routes/pages.js).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");

const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

// Same reason as test/admin.auth.test.js: /api CSRF rejects a state-changing
// request that presents no Origin at all.
const sameOrigin = (srv, extra = {}) => ({ ...extra, headers: { origin: srv.origin } });

const FAQ_BLOCK = `
<section class="artFaq" id="faq">
  <h2>الأسئلة الشائعة</h2>
  <div class="artFaq__item">
    <h3 class="artFaq__q">ما هو نظام أتكس؟</h3>
    <div class="artFaq__a"><p>منظومة <strong>متكاملة</strong> للتحكم.</p></div>
  </div>
  <div class="artFaq__item">
    <h3 class="artFaq__q">كم يستغرق التنفيذ؟</h3>
    <div class="artFaq__a"><p>من أربعة إلى ثمانية أسابيع.</p></div>
  </div>
</section>`;

const BODY_WITH_FAQ = `<h2 id="wired-when">متى نختار السلكي؟</h2><p>فقرة.</p>${FAQ_BLOCK}`;
const BODY_WITHOUT_FAQ = '<h2 id="intro">مقدمة</h2><p>فقرة بلا أسئلة شائعة.</p>';

// sanitize-html deliberately leaves `&lt;/script&gt;` as harmless escaped text.
// The FAQ extractor decodes entities, so that text reaches JSON.stringify as a
// literal `</script>` — which, written raw into the JSON-LD block, closes it
// early and turns the rest of the page into live markup (the CSP allows inline
// script). Every `<` in the emitted JSON must therefore leave as `<`.
const BODY_WITH_SCRIPT_ENTITIES = `
<h2 id="intro">مقدمة</h2>
<section class="artFaq" id="faq">
  <div class="artFaq__item">
    <h3 class="artFaq__q">هل يقبل النظام وسم &lt;/script&gt; داخل النص؟</h3>
    <div class="artFaq__a"><p>نعم، يظهر &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; كنص عادي.</p></div>
  </div>
  <div class="artFaq__item">
    <h3 class="artFaq__q">وماذا عن &amp; و &lt;!-- تعليق --&gt;؟</h3>
    <div class="artFaq__a"><p>تُعرض كما هي: &amp; و &lt;!-- تعليق --&gt;.</p></div>
  </div>
</section>`;

/** Pull the JSON-LD @graph out of a rendered page. */
function readGraph(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "no application/ld+json block was rendered");
  const parsed = JSON.parse(match[1]);
  assert.ok(Array.isArray(parsed["@graph"]), "structured data has no @graph array");
  return parsed["@graph"];
}

const nodeOfType = (graph, type) => graph.find((n) => n["@type"] === type);

describe("blog post structured data", () => {
  let srv;

  before(async () => {
    srv = await startServer({
      label: "blogld",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      },
    });

    const login = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      sameOrigin(srv, { jar: true })
    );
    assert.equal(login.status, 200, "admin login failed — cannot seed posts");

    for (const [slug, content_html, excerpt] of [
      ["ld-faq-post", BODY_WITH_FAQ, "ملخص المقال."],
      ["ld-plain-post", BODY_WITHOUT_FAQ, "ملخص المقال."],
      ["ld-script-break-post", BODY_WITH_SCRIPT_ENTITIES, "ملخص المقال."],
      ["ld-no-excerpt-post", BODY_WITHOUT_FAQ, ""],
    ]) {
      const res = await srv.post(
        "/api/posts",
        {
          slug,
          title: `مقال ${slug}`,
          excerpt,
          content_html,
          tags: ["أتمتة"],
          published: true,
        },
        sameOrigin(srv, { jar: true })
      );
      assert.equal(res.status, 200, `seeding ${slug} failed`);
    }
  });

  after(async () => {
    await srv.stop();
  });

  it("emits a BlogPosting node with mainEntityOfPage on the canonical URL", async () => {
    const res = await srv.get("/blog/ld-faq-post");
    assert.equal(res.status, 200);

    const graph = readGraph(await res.text());
    const posting = nodeOfType(graph, "BlogPosting");
    assert.ok(posting, `expected a BlogPosting node, got ${graph.map((n) => n["@type"]).join(", ")}`);
    assert.ok(!nodeOfType(graph, "Article"), "the plain Article node should have been replaced");

    const postUrl = `${srv.origin}/blog/ld-faq-post`;
    assert.equal(posting["@id"], `${postUrl}#article`);
    assert.deepEqual(posting.mainEntityOfPage, { "@type": "WebPage", "@id": postUrl });

    // Pre-existing fields must survive the type change.
    assert.equal(posting.url, postUrl);
    assert.equal(posting.headline, "مقال ld-faq-post");
    assert.equal(posting.description, "ملخص المقال.");
    assert.equal(posting.inLanguage, "ar-SA");
    assert.ok(posting.datePublished, "datePublished was dropped");
    assert.ok(posting.publisher && posting.publisher.name, "publisher was dropped");
  });

  it("adds a FAQPage node built from the .artFaq block", async () => {
    const res = await srv.get("/blog/ld-faq-post");
    const faq = nodeOfType(readGraph(await res.text()), "FAQPage");

    assert.ok(faq, "expected a FAQPage node for a post containing an .artFaq block");
    assert.deepEqual(faq.mainEntity, [
      {
        "@type": "Question",
        name: "ما هو نظام أتكس؟",
        acceptedAnswer: { "@type": "Answer", text: "منظومة متكاملة للتحكم." },
      },
      {
        "@type": "Question",
        name: "كم يستغرق التنفيذ؟",
        acceptedAnswer: { "@type": "Answer", text: "من أربعة إلى ثمانية أسابيع." },
      },
    ]);
  });

  it("links the FAQPage node to the BlogPosting it was extracted from", async () => {
    const res = await srv.get("/blog/ld-faq-post");
    const graph = readGraph(await res.text());
    const postUrl = `${srv.origin}/blog/ld-faq-post`;

    const faq = nodeOfType(graph, "FAQPage");
    assert.equal(faq["@id"], `${postUrl}#faq`, "FAQPage node has no stable @id");
    assert.deepEqual(faq.isPartOf, { "@id": `${postUrl}#article` }, "FAQPage is not linked to the article");
    assert.equal(nodeOfType(graph, "BlogPosting")["@id"], faq.isPartOf["@id"], "isPartOf points at nothing in the graph");
  });

  it("omits description rather than emitting an empty string", async () => {
    const res = await srv.get("/blog/ld-no-excerpt-post");
    const posting = nodeOfType(readGraph(await res.text()), "BlogPosting");

    assert.ok(!("description" in posting), `empty description was emitted: ${JSON.stringify(posting.description)}`);
    // The fields that are always present must not have been dropped with it.
    assert.ok(posting.datePublished, "datePublished was dropped");
    assert.ok(posting.dateModified, "dateModified was dropped");
  });

  it("omits the FAQPage node when the article has no .artFaq block", async () => {
    const res = await srv.get("/blog/ld-plain-post");
    const graph = readGraph(await res.text());

    assert.ok(nodeOfType(graph, "BlogPosting"), "BlogPosting node missing");
    assert.equal(nodeOfType(graph, "FAQPage"), undefined, "FAQPage must not appear without an FAQ block");
  });

  // Regression: a body containing escaped `&lt;/script&gt;` used to reach the
  // JSON-LD block as a literal `</script>`, closing it early. That both destroyed
  // all structured data on the page (JSON parse error) and turned whatever
  // followed into live markup.
  describe("a post body containing escaped </script> entities", () => {
    let page;

    before(async () => {
      const res = await srv.get("/blog/ld-script-break-post");
      assert.equal(res.status, 200);
      page = await res.text();
    });

    it("does not break out of the ld+json block", () => {
      const openTag = '<script type="application/ld+json">';
      const open = page.indexOf(openTag);
      assert.notEqual(open, -1, "no ld+json block was rendered");

      const start = open + openTag.length;
      const block = page.slice(start, page.indexOf("</script>", start));
      assert.ok(!block.includes("</script"), "the JSON-LD block was closed early by page content");
      assert.ok(!block.includes("<"), `a raw < reached the JSON-LD block: ${block.slice(0, 400)}`);
      assert.ok(block.includes("\\u003c"), "the escaping that makes that safe is not being applied");
    });

    it("still parses, and round-trips the text back to the original characters", () => {
      const graph = readGraph(page);
      assert.ok(nodeOfType(graph, "BlogPosting"), "structured data was destroyed");

      const faq = nodeOfType(graph, "FAQPage");
      assert.ok(faq, "FAQPage node missing");
      // < is valid JSON and must decode back to the author's own text.
      assert.ok(
        faq.mainEntity[0].acceptedAnswer.text.includes("</script><img src=x onerror=alert(1)>"),
        `answer text was mangled by the escaping: ${faq.mainEntity[0].acceptedAnswer.text}`
      );
      assert.ok(faq.mainEntity[1].acceptedAnswer.text.includes("& و <!-- تعليق -->"), "& / comment text was mangled");
    });
  });

  it("keeps in-body id attributes so section anchors are deep-linkable", async () => {
    const res = await srv.get("/blog/ld-faq-post");
    const body = await res.text();

    assert.ok(body.includes('id="wired-when"'), "heading id was stripped by the sanitizer");
    assert.ok(body.includes('id="faq"'), "FAQ section id was stripped by the sanitizer");
  });
});
