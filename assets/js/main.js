/*
  main.js
  - بنية جاهزة للتوسع: لاحقاً يمكن ربط المنتجات/المدونة/لوحة الإدارة بواجهة API.
  - حالياً: البيانات تأتي من ملفات JSON محلية.
*/

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DESKTOP_MOTION_MIN_WIDTH = 981;

function hasFinePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function isTouchLike() {
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function getMotionContext() {
  const finePointer = hasFinePointer();
  const touchLike = isTouchLike();
  const desktopLike = window.innerWidth >= DESKTOP_MOTION_MIN_WIDTH;

  return {
    reduced: prefersReducedMotion,
    finePointer,
    touchLike,
    desktopLike,
    allowGsap: !prefersReducedMotion && !!window.gsap,
    allowTilt: !prefersReducedMotion && finePointer && desktopLike,
    allowAmbient: !prefersReducedMotion && finePointer && !touchLike && desktopLike,
  };
}

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function initNav() {
  const toggle = qs(".nav__toggle");
  const menu = qs("#navMenu");
  const backdrop = qs("[data-nav-backdrop]");
  if (!toggle || !menu) return;

  const close = () => {
    menu.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    menu.classList.add("is-open");
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    expanded ? close() : open();
  });

  // Close on link click (mobile)
  qsa("a.nav__link", menu).forEach((a) => a.addEventListener("click", close));

  // Close on outside click
  document.addEventListener("click", (e) => {
    const isToggle = toggle.contains(e.target);
    const isMenu = menu.contains(e.target);
    const isBackdrop = backdrop && backdrop.contains(e.target);
    if (isBackdrop) return close();
    if (!isToggle && !isMenu) close();
  });

  // Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function initHeaderMotion() {
  const header = qs(".header");
  const topbar = qs(".topbar");
  if (!header) return;

  const hasHeroVideo = !!qs(".heroVideo");
  document.body.classList.toggle("has-hero-video", hasHeroVideo);

  const syncOverlayTopbarHeight = () => {
    if (!hasHeroVideo || !topbar) return;
    const h = Math.max(0, Math.round(topbar.offsetHeight || 0));
    document.body.style.setProperty("--overlay-topbar-h", `${h}px`);
  };

  const onScroll = () => {
    const scrolled = (window.scrollY || 0) > 18;
    header.classList.toggle("is-scrolled", scrolled);
    if (topbar) topbar.classList.toggle("is-scrolled", scrolled);
  };

  syncOverlayTopbarHeight();
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", syncOverlayTopbarHeight);

  // Small nav-link entrance for a modern polished feel
  if (!prefersReducedMotion && window.gsap) {
    const links = qsa(".nav__menu .nav__link");
    if (links.length) {
      window.gsap.from(links, {
        y: -8,
        opacity: 0,
        duration: 0.45,
        ease: "power2.out",
        stagger: 0.035,
        delay: 0.1,
      });
    }
  }
}

function initScrollSpy() {
  const routeLinks = qsa("a.nav__link[data-route]");
  const scrollLinks = qsa("a.nav__link[data-scrollspy]");

  // Route-based active state (for multi-page nav)
  if (routeLinks.length) {
    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    routeLinks.forEach((a) => {
      const href = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
      const isActive = href === "/" ? currentPath === "/" : currentPath === href;
      a.classList.toggle("is-active", isActive);
    });
  }

  if (!scrollLinks.length) return;
  const sections = scrollLinks
    .map((a) => {
      const href = a.getAttribute("href") || "";
      const id = href.includes("#") ? href.split("#")[1] : "";
      const el = id ? document.getElementById(id) : null;
      return { a, id, el };
    })
    .filter((x) => x.el);

  if (!sections.length) return;

  const setActive = (id) => {
    scrollLinks.forEach((a) => a.classList.remove("is-active"));
    const match = sections.find((s) => s.id === id);
    if (match) match.a.classList.add("is-active");
  };

  const header = qs(".header");
  const rootMarginTop = header ? Math.max(40, header.offsetHeight + 16) : 90;
  const io = new IntersectionObserver(
    (entries) => {
      // Pick the most visible intersecting section
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
      if (visible[0]) setActive(visible[0].target.id);
    },
    {
      root: null,
      threshold: [0.25, 0.35, 0.5, 0.65],
      rootMargin: `-${rootMarginTop}px 0px -55% 0px`,
    }
  );
  sections.forEach((s) => io.observe(s.el));

  // Ensure an initial active
  const first = sections.find((s) => location.hash === `#${s.id}`) || sections[0];
  if (first) setActive(first.id);
}

function initMarquee() {
  const marquees = qsa("[data-marquee]");
  if (!marquees.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setupMarquee = (root) => {
    const viewport = qs("[data-marquee-viewport]", root);
    const runner = qs("[data-marquee-runner]", root);
    const source = qs("[data-marquee-content]", root);
    const hasStaticClone = !!qs("[data-marquee-static-clone]", runner);
    if (!viewport || !runner || !source) return;

    // Remove generated clones before re-measuring
    qsa("[data-marquee-clone]", runner).forEach((node) => node.remove());

    root.classList.remove("is-static");

    const sourceWidth = source.scrollWidth || source.getBoundingClientRect().width;
    const viewportWidth = viewport.clientWidth || viewport.getBoundingClientRect().width;

    if (!sourceWidth || !viewportWidth) {
      root.classList.add("is-static");
      return;
    }

    // Keep cloning only when necessary until the runner is long enough to
    // cover viewport during the whole one-block travel.
    // Seamless condition when animating by sourceWidth:
    // runnerWidth >= viewportWidth + sourceWidth
    const minWidth = Math.max(viewportWidth + sourceWidth, sourceWidth * 2);
    const maxClones = 32;
    let cloneCount = 0;

    while (runner.scrollWidth < minWidth && cloneCount < maxClones) {
      const clone = source.cloneNode(true);
      clone.setAttribute("data-marquee-clone", "true");
      clone.setAttribute("aria-hidden", "true");
      runner.appendChild(clone);
      cloneCount += 1;
    }

    // If markup has no static duplicate and no generated clones were needed,
    // append one fallback clone to guarantee loop continuity.
    if (!hasStaticClone && cloneCount === 0) {
      const clone = source.cloneNode(true);
      clone.setAttribute("data-marquee-clone", "true");
      clone.setAttribute("aria-hidden", "true");
      runner.appendChild(clone);
    }

    // Pixel-distance animation: move exactly one source content width
    root.style.setProperty("--marquee-distance", `${sourceWidth.toFixed(3)}px`);

    // Optional dynamic duration based on px/s speed
    const pxPerSecond = 90;
    const duration = Math.max(8, sourceWidth / pxPerSecond);
    root.style.setProperty("--marquee-duration", `${duration}s`);

    // Restart CSS animation after recalculation so new distance applies immediately
    runner.style.animation = "none";
    // Force reflow
    void runner.offsetWidth;
    runner.style.animation = "";

    if (reduceMotion) {
      root.classList.add("is-static");
    }
  };

  const rebuildAll = () => marquees.forEach(setupMarquee);

  // Initial build
  rebuildAll();

  // Rebuild after fonts load (important for accurate Arabic widths)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rebuildAll).catch(() => {});
  }

  // Rebuild on resize (debounced)
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuildAll, 120);
  });

  // Explicit hover pause class support
  marquees.forEach((root) => {
    root.addEventListener("mouseenter", () => root.classList.add("is-paused"));
    root.addEventListener("mouseleave", () => root.classList.remove("is-paused"));
  });
}

function initFaq() {
  // Fallback behavior when GSAP isn't available.
  // If GSAP is present, we do a richer height animation inside initGsap().
  const motion = getMotionContext();
  if (motion.allowGsap && motion.finePointer) return;

  const items = qsa(".faq__item");
  if (!items.length) return;

  items.forEach((item) => {
    const btn = qs(".faq__q", item);
    const ans = qs(".faq__a", item);
    const icon = qs(".faq__icon", item);
    if (!btn || !ans) return;

    btn.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");
      // close others
      items.forEach((x) => {
        if (x !== item) x.classList.remove("is-open");
      });
      item.classList.toggle("is-open", !isOpen);
      if (icon) icon.textContent = item.classList.contains("is-open") ? "–" : "+";
    });
  });
}

function initContactForm() {
  const form = qs("#contactForm");
  if (!form) return;

  const note = qs("[data-contact-note]", form);
  const submitBtn = qs("[data-contact-submit]", form);
  const nameInput = qs('input[name="name"]', form);
  const emailInput = qs('input[name="email"]', form);
  const messageInput = qs('textarea[name="message"]', form);

  const inputs = [nameInput, emailInput, messageInput].filter(Boolean);

  const setNote = (text, type = "info") => {
    if (!note) return;
    note.textContent = text;
    note.classList.remove("is-error", "is-success", "is-info");
    note.classList.add(`is-${type}`);
  };

  const clearInputState = () => {
    inputs.forEach((el) => el.classList.remove("is-invalid"));
  };

  const markInvalid = (el) => {
    if (!el) return;
    el.classList.add("is-invalid");
  };

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());

  const validate = () => {
    clearInputState();

    const name = String(nameInput?.value || "").trim();
    const email = String(emailInput?.value || "").trim();
    const message = String(messageInput?.value || "").trim();

    if (name.length < 2) {
      markInvalid(nameInput);
      setNote("يرجى إدخال اسم صحيح (حرفين على الأقل).", "error");
      return null;
    }

    if (!isValidEmail(email)) {
      markInvalid(emailInput);
      setNote("يرجى إدخال بريد إلكتروني صحيح.", "error");
      return null;
    }

    if (message.length < 10) {
      markInvalid(messageInput);
      setNote("يرجى كتابة وصف أوضح للمشروع (10 أحرف على الأقل).", "error");
      return null;
    }

    return {
      name: name.slice(0, 120),
      email: email.slice(0, 160),
      message: message.slice(0, 3000),
    };
  };

  const mapServerError = (code) => {
    switch (code) {
      case "MISSING_FIELDS":
        return "يرجى تعبئة جميع الحقول المطلوبة.";
      case "INVALID_NAME":
        return "الاسم المدخل غير صالح.";
      case "INVALID_EMAIL":
        return "البريد الإلكتروني غير صالح.";
      case "MESSAGE_TOO_SHORT":
        return "الرسالة قصيرة جدًا. يرجى إضافة تفاصيل أكثر.";
      default:
        return "تعذر إرسال النموذج حالياً. حاول مرة أخرى.";
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn?.disabled) return;

    const payload = validate();
    if (!payload) return;

    const originalBtnText = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري الإرسال...";
    }
    setNote("جاري إرسال طلبك...", "info");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorCode = "SERVER_ERROR";
        try {
          const data = await res.json();
          errorCode = data?.error || errorCode;
        } catch {
          // Keep default error
        }
        setNote(mapServerError(errorCode), "error");
        return;
      }

      form.reset();
      clearInputState();
      setNote("تم استلام طلبك بنجاح ✅ سنقوم بالتواصل معك قريباً.", "success");
    } catch {
      setNote("تعذر الاتصال بالخادم حالياً. يرجى المحاولة لاحقاً.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText || "إرسال";
      }
    }
  });

  inputs.forEach((el) => {
    el.addEventListener("input", () => {
      el.classList.remove("is-invalid");
      if (note?.classList.contains("is-error")) {
        setNote("سنقوم بالتواصل معك في أقرب وقت ممكن.", "info");
      }
    });
  });
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`فشل تحميل البيانات: ${path}`);
  return res.json();
}

function renderProducts(items) {
  const grid = qs("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  items.forEach((p) => {
    const el = document.createElement("article");
    el.className = "item";
    el.setAttribute("data-tilt", "");
    el.innerHTML = `
      <div class="item__media">
        <img src="${p.image}" alt="${p.title}" loading="lazy" />
      </div>
      <div class="item__body">
        <div class="item__tag">${p.category}</div>
        <h3 class="item__title">${p.title}</h3>
        <p class="item__desc">${p.description}</p>
        <div class="item__actions">
          <a class="btn btn--primary btn--small" href="/contact-us">اطلب عرضاً</a>
          <a class="btn btn--ghost btn--small" href="#" aria-disabled="true" tabindex="-1">تحميل كتيّب (قريباً)</a>
        </div>
      </div>
    `;
    grid.appendChild(el);
  });
}

function renderPosts(items) {
  const grid = qs("#postsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  items.forEach((p) => {
    const el = document.createElement("article");
    el.className = "item";
    el.setAttribute("data-tilt", "");
    el.innerHTML = `
      <div class="item__media">
        <img src="${p.image}" alt="${p.title}" loading="lazy" />
      </div>
      <div class="item__body">
        <div class="item__tag">${p.meta}</div>
        <h3 class="item__title">${p.title}</h3>
        <p class="item__desc">${p.excerpt}</p>
        <div class="item__actions">
          <a class="btn btn--ghost btn--small" href="/contact-us">اقرأ المزيد (عبر تواصل)</a>
        </div>
      </div>
    `;
    grid.appendChild(el);
  });
}

function initTilt() {
  // Micro-interaction without external libs.
  const motion = getMotionContext();
  if (!motion.allowTilt) return;

  const cards = qsa("[data-tilt]");
  if (!cards.length) return;

  cards.forEach((card) => {
    let raf = 0;
    let rect = null;
    let resetTimer = 0;
    const maxTilt = 4;

    const clearResetTimer = () => {
      if (!resetTimer) return;
      window.clearTimeout(resetTimer);
      resetTimer = 0;
    };

    const onEnter = () => {
      clearResetTimer();
      rect = card.getBoundingClientRect();
      card.style.willChange = "transform";
      card.style.transition = "transform 140ms ease-out";
    };

    const onMove = (e) => {
      if (!rect) rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * maxTilt;
      const ry = (px - 0.5) * maxTilt;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translate3d(0,-1px,0)`;
      });
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      clearResetTimer();
      rect = null;
      card.style.transition = "transform 220ms ease-out";
      card.style.transform = "";
      resetTimer = window.setTimeout(() => {
        card.style.willChange = "";
      }, 220);
    };

    card.addEventListener("mouseenter", onEnter);
    card.addEventListener("mousemove", onMove);
    card.addEventListener("mouseleave", reset);
  });
}

function initGsap() {
  const motion = getMotionContext();
  if (!motion.allowGsap) return;

  const gsap = window.gsap;
  const ambientMotion = motion.allowAmbient;
  const canUseScrollTrigger = !!window.ScrollTrigger;
  const withScrollTrigger = (config) => (canUseScrollTrigger ? { scrollTrigger: config } : {});

  gsap.defaults({ overwrite: "auto" });
  if (canUseScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
    // Refresh once all media has settled to avoid trigger jitter.
    window.addEventListener("load", () => window.ScrollTrigger.refresh(), { once: true });
  }

  // Intro
  gsap.set([".hero__copy > *", ".hero__scene"], { opacity: 0, y: 22 });
  gsap.to(".hero__copy > *", { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.08, delay: 0.08 });
  gsap.to(".hero__scene", { opacity: 1, y: 0, duration: 1.0, ease: "power3.out", delay: 0.2 });

  // Ambient loops (desktop/fine pointer only)
  if (ambientMotion) {
    gsap.to(".orb--a", { y: 12, x: -6, duration: 6.8, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(".orb--b", { y: -14, x: 8, duration: 7.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
    gsap.to(".orb--c", { y: 10, x: 6, duration: 6.2, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // Counters (stats)
  qsa(".stat").forEach((stat) => {
    const target = Number(stat.getAttribute("data-count") || "0");
    const num = qs(".stat__num", stat);
    if (!num) return;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.4,
      ease: "power2.out",
      onUpdate: () => (num.textContent = String(Math.round(obj.v))),
      ...withScrollTrigger({
        trigger: stat,
        start: "top 85%",
        once: true,
      }),
    });
  });

  // Scroll reveal
  const sections = qsa(".section");
  sections.forEach((sec) => {
    const isWhySection = sec.id === "why";
    const items = isWhySection
      ? qsa(".section__head, .whyKeypoints__item", sec)
      : qsa(".section__head, .grid > *, .banner, .cta, .footer", sec);
    if (!items.length) return;

    gsap.from(items, {
      opacity: 0,
      y: 26,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.06,
      ...withScrollTrigger({
        trigger: sec,
        start: "top 78%",
        once: true,
      }),
    });
  });

  // Subtle button hover pop
  if (motion.finePointer) {
    qsa(".btn, .chip").forEach((el) => {
      el.addEventListener("mouseenter", () => gsap.to(el, { scale: 1.015, duration: 0.16, ease: "power2.out" }));
      el.addEventListener("mouseleave", () => gsap.to(el, { scale: 1.0, duration: 0.2, ease: "power2.out" }));
    });
  }

  // WHY cards: depth stagger + soft floating loop
  const why = qs("#why");
  if (why) {
    const cards = qsa(".whyKeypoints__item", why);
    if (cards.length) {
      gsap.from(cards, {
        opacity: 0,
        y: 28,
        rotateX: 8,
        immediateRender: false,
        duration: 0.75,
        ease: "power3.out",
        stagger: 0.06,
        ...withScrollTrigger({ trigger: why, start: "top 75%", once: true }),
      });
    }
  }

  // PROCESS: flow chart reveal + arrow pulse
  const process = qs("#process");
  const processFlow = process ? qs(".processFlow", process) : null;
  if (processFlow) {
    const items = qsa(".processFlow__item", processFlow);
    const arrows = qsa(".processFlow__arrow", processFlow);

    gsap.from(items, {
      immediateRender: false,
      opacity: 0,
      y: 18,
      duration: 0.6,
      ease: "power2.out",
      stagger: 0.06,
      clearProps: "opacity,transform",
      ...withScrollTrigger({ trigger: processFlow, start: "top 75%", once: true }),
    });

    if (ambientMotion && arrows.length) {
      gsap.fromTo(
        arrows,
        { scale: 0.95, opacity: 0.75 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.45,
          stagger: 0.06,
          ease: "power2.out",
          ...withScrollTrigger({ trigger: processFlow, start: "top 82%", once: true }),
        }
      );
    }
  }

  // INTEGRATIONS: subtle parallax + glow in
  const integrations = qs("#integrations");
  if (integrations) {
    const marquee = qs(".marquee", integrations);
    if (marquee) {
      gsap.from(marquee, {
        opacity: 0,
        y: 12,
        duration: 0.55,
        ease: "power2.out",
        ...withScrollTrigger({ trigger: integrations, start: "top 80%", once: true }),
      });
    }

    const bg = qs(".section__head", integrations);
    if (bg && ambientMotion && canUseScrollTrigger) {
      gsap.to(bg, {
        y: -10,
        ease: "none",
        scrollTrigger: {
          trigger: integrations,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.65,
        },
      });
    }
  }

  // FAQ: height animation + stagger on first view
  const faq = qs("#faq");
  if (faq && motion.finePointer) {
    const items = qsa(".faq__item", faq);
    if (items.length) {
      gsap.from(items, {
      opacity: 0,
        y: 18,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.06,
        ...withScrollTrigger({ trigger: faq, start: "top 78%", once: true }),
      });
    }

    const setFaqIcon = (item) => {
      const icon = qs(".faq__icon", item);
      if (icon) icon.textContent = item.classList.contains("is-open") ? "–" : "+";
    };

    const closeAnswer = (answer) => {
      gsap.killTweensOf(answer);
      const currentHeight = answer.offsetHeight || answer.scrollHeight || 0;
      gsap.fromTo(
        answer,
        { height: currentHeight, overflow: "hidden", display: "block" },
        { height: 0, duration: 0.28, ease: "power2.out" }
      );
    };

    const openAnswer = (answer) => {
      gsap.killTweensOf(answer);
      gsap.set(answer, { display: "block", overflow: "hidden" });
      gsap.fromTo(
        answer,
        { height: answer.offsetHeight || 0 },
        {
          height: answer.scrollHeight,
          duration: 0.32,
          ease: "power2.out",
          onComplete: () => gsap.set(answer, { height: "auto" }),
        }
      );
    };

    // Animate open/close with tween cancelation to avoid jitter on rapid taps/clicks.
    items.forEach((item) => {
      const btn = qs(".faq__q", item);
      const ans = qs(".faq__a", item);
      if (!btn || !ans) return;

      const initiallyOpen = item.classList.contains("is-open");
      gsap.set(ans, {
        height: initiallyOpen ? "auto" : 0,
        overflow: "hidden",
        display: "block",
      });
      setFaqIcon(item);

      btn.addEventListener("click", () => {
        const isOpen = item.classList.contains("is-open");

        // Close others (animated)
        items.forEach((x) => {
          if (x === item || !x.classList.contains("is-open")) return;
          x.classList.remove("is-open");
          const a = qs(".faq__a", x);
          if (a) closeAnswer(a);
          setFaqIcon(x);
        });

        item.classList.toggle("is-open", !isOpen);
        setFaqIcon(item);

        if (item.classList.contains("is-open")) {
          openAnswer(ans);
          return;
        }

        closeAnswer(ans);
      });
    });
  }
}

async function bootstrap() {
  initHeaderMotion();
  initNav();
  initFaq();
  initScrollSpy();
  initMarquee();
  initContactForm();

  // Data-driven render
  try {
    const [productsRes, posts] = await Promise.all([
      fetch("/api/products/public", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error("PUBLIC_PRODUCTS_API_FAILED");
        return r.json();
      }),
      loadJson("data/posts.json"),
    ]);
    const products = Array.isArray(productsRes?.products) ? productsRes.products : [];
    renderProducts(products);
    renderPosts(posts);
  } catch (e) {
    // Fallback to static JSON if API is unavailable.
    Promise.all([loadJson("data/products.json"), loadJson("data/posts.json")])
      .then(([products, posts]) => {
        renderProducts(products);
        renderPosts(posts);
      })
      .catch((err) => console.warn(err || e));
  }

  initTilt();
  initGsap();

  if (window.ScrollTrigger) {
    window.setTimeout(() => window.ScrollTrigger.refresh(), 140);
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
