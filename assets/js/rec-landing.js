/**
 * Behaviour for the two /rec campaign landing pages.
 *
 * Served as a plain static file, not through Vite. It is only ever loaded by
 * views/rec-landing.ejs, so bundling it into main.js would ship it to every
 * other page for nothing — and keeping it a real .js file (rather than an
 * inline <script> in the template) is what puts it under eslint and prettier.
 *
 * Three of the page's interactive parts are NOT here, on purpose: the FAQ
 * accordion, the partner marquee and the lazy hero video are all driven by
 * assets/js/main.js off markup contracts the templates already satisfy.
 * What is left is the category filter, the product dialog, and the quote form.
 */
(function () {
  "use strict";

  var configNode = document.getElementById("recLandingConfig");
  if (!configNode) return;

  var config;
  try {
    config = JSON.parse(configNode.textContent);
  } catch (err) {
    return;
  }

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------------------------------------------------------------- filter */

  (function initFilter() {
    var buttons = $$("[data-rec-filter]");
    var cards = $$("[data-rec-category]");
    var count = $("[data-rec-count]");
    if (!buttons.length || !cards.length) return;

    function apply(key) {
      var shown = 0;
      cards.forEach(function (card) {
        var match = key === "all" || card.getAttribute("data-rec-category") === key;
        // The [hidden] attribute alone is not enough: an author `display` rule
        // on the same element beats the UA default for [hidden]. The paired
        // `.recProducts__card[hidden] { display: none }` in rec-landing.css is
        // what actually hides it — this codebase has been bitten by that before
        // (see the .formSteps__nav note in assets/css/styles.css).
        card.hidden = !match;
        if (match) shown += 1;
      });

      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-rec-filter") === key ? "true" : "false");
      });

      // Cards appearing and disappearing is silent to a screen reader.
      if (count) count.textContent = "عرض " + shown + " من " + cards.length;
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        apply(button.getAttribute("data-rec-filter") || "all");
      });
    });

    apply("all");
  })();

  /* ---------------------------------------------------------------- dialog */

  (function initDialog() {
    var dialog = $("#recProductModal");
    if (!dialog || typeof dialog.showModal !== "function") return;

    var image = $("#recModalImage");
    var tag = $("#recModalTag");
    var title = $("#recModalTitle");
    var desc = $("#recModalDesc");
    var extra = $("#recModalExtra");
    var bullets = $("#recModalBullets");

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest ? event.target.closest("[data-rec-open]") : null;
      if (!trigger) return;

      image.src = trigger.getAttribute("data-rec-image") || "";
      image.alt = trigger.getAttribute("data-rec-alt") || "";
      tag.textContent = trigger.getAttribute("data-rec-tag") || "";
      title.textContent = trigger.getAttribute("data-rec-title") || "";
      desc.textContent = trigger.getAttribute("data-rec-desc") || "";
      extra.textContent = trigger.getAttribute("data-rec-extra") || "";

      bullets.textContent = "";
      var list = [];
      try {
        list = JSON.parse(trigger.getAttribute("data-rec-bullets") || "[]");
      } catch (err) {
        list = [];
      }
      list.forEach(function (text) {
        var li = document.createElement("li");
        li.textContent = text;
        bullets.appendChild(li);
      });

      // showModal() puts the dialog in the top layer and contains focus; the
      // browser also restores focus to this trigger on close, which is why
      // there is no manual focus bookkeeping here.
      dialog.showModal();
    });

    // Clicking the backdrop lands on the <dialog> itself, never on its children.
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    // The modal CTA jumps to the quote form, so the dialog has to get out of
    // the way first or the anchor scrolls a page the user cannot see.
    var cta = $("#recModalCta");
    if (cta) {
      cta.addEventListener("click", function () {
        dialog.close();
      });
    }
  })();

  /* ------------------------------------------------------------ attribution */

  /**
   * The campaign source, as far as it can be known.
   *
   * Print has no referrer, so the only signal is the slug plus whatever the
   * QR code appended (`?utm_source=expo2026`). /api/contact has no `source`
   * column, so this rides along inside the message body and inside the
   * prefilled WhatsApp text — greppable, if not queryable.
   */
  var sourceTag = "/rec/" + config.slug + (window.location.search || "");

  // Stamp the source onto every prefilled WhatsApp link on the page.
  $$("[data-rec-wa]").forEach(function (link) {
    var href = link.getAttribute("href") || "";
    if (href.indexOf("?text=") === -1) return;
    link.setAttribute("href", href + encodeURIComponent("\n\n(" + sourceTag + ")"));
  });

  /* ------------------------------------------------------------------ form */

  (function initForm() {
    var form = document.getElementById(config.formId);
    if (!form) return;

    var status = $("[data-rec-status]", form);
    var submit = $(".recQuote__submit", form);

    /**
     * Normalises a Saudi number to the E.164 shape /api/contact demands.
     * Returns "" when it cannot, which downgrades the save but never blocks
     * the WhatsApp handoff.
     */
    function toE164(raw) {
      var digits = String(raw || "").replace(/\D/g, "");
      digits = digits.replace(/^0+/, "");
      if (!digits) return "";
      if (digits.indexOf("966") === 0) return "+" + digits;
      if (/^5\d{8}$/.test(digits)) return "+966" + digits;
      return "+" + digits;
    }

    function fieldValue(name) {
      var el = form.elements[name];
      return el ? String(el.value || "").trim() : "";
    }

    function setError(name, message) {
      var input = form.elements[name];
      var slot = document.getElementById("rec-" + name + "-error");
      if (slot) slot.textContent = message || "";
      if (input && input.setAttribute) {
        if (message) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
    }

    /** Everything the API contract has no column for travels as prose. */
    function composeMessage() {
      var parts = ["طلب من صفحة " + config.pageTitle, "المصدر: " + sourceTag];
      config.fields.forEach(function (field) {
        if (field.apiField || !field.messageLabel) return;
        var value = fieldValue(field.name);
        if (value) parts.push(field.messageLabel + ": " + value);
      });
      // normalizeText() on the server collapses whitespace, so the separator
      // has to survive as visible punctuation rather than as newlines.
      return parts.join(" — ");
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      // Honeypot: invisible to a person, irresistible to a naive bot.
      if (fieldValue("website")) return;

      var name = fieldValue("name");
      var whatsapp = toE164(fieldValue("whatsapp"));
      var message = composeMessage();

      // Validate BEFORE handing off. Both checks are synchronous, so user
      // activation is still intact for the window.open below — the popup-blocker
      // constraint only forbids opening after an `await`, not after an `if`.
      setError("name", "");
      setError("whatsapp", "");
      if (!name || name.length < 2) {
        setError("name", "يرجى إدخال الاسم.");
        form.elements.name.focus();
        return;
      }
      if (!/^\+\d{8,16}$/.test(whatsapp)) {
        setError("whatsapp", "يرجى إدخال رقم واتساب صحيح مع مفتاح الدولة.");
        form.elements.whatsapp.focus();
        return;
      }

      var waText =
        config.waText +
        "\n\n" +
        (name ? "الاسم: " + name + "\n" : "") +
        message;

      // Opened synchronously, inside the user gesture and before any await —
      // a window.open() after an awaited fetch has lost user activation and is
      // blocked outright in Safari and Firefox. Navigating it immediately (and
      // saving the lead afterwards) is what guarantees that a failed or slow
      // API call can never dead-end the visitor, which is the one thing the
      // page this replaces always got right.
      var waUrl = "https://wa.me/" + config.waNumber + "?text=" + encodeURIComponent(waText);
      var opened = window.open(waUrl, "_blank", "noopener");
      if (!opened) window.location.href = waUrl;

      var payload = { name: name, whatsapp: whatsapp, message: message };
      var companyName = fieldValue("companyName");
      if (companyName) payload.companyName = companyName;

      if (submit) submit.disabled = true;
      status.textContent = "جارٍ حفظ طلبك…";

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (res.ok) {
            status.textContent = "تم استلام طلبك، وسنتواصل معك عبر واتساب.";
            form.reset();
            return;
          }
          status.textContent =
            res.status === 429
              ? "لقد أرسلت طلبات كثيرة، حاول بعد دقيقة. المحادثة على واتساب مفتوحة."
              : "تم تحويلك إلى واتساب — تعذّر حفظ الطلب، تابع المحادثة هناك.";
        })
        .catch(function () {
          status.textContent = "تم تحويلك إلى واتساب — تعذّر حفظ الطلب، تابع المحادثة هناك.";
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });
  })();
})();
