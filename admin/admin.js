(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setByPath(obj, path, value) {
    const parts = String(path).split(".").filter(Boolean);
    if (!parts.length) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function getByPath(obj, path) {
    const parts = String(path).split(".").filter(Boolean);
    let cur = obj;
    for (const k of parts) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[k];
    }
    return cur;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) throw Object.assign(new Error(json.error || "REQUEST_FAILED"), { status: res.status, json });
    return json;
  }

  function readJSONStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSONStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  }

  // --- Login page ---
  const loginForm = $("#loginForm");
  if (loginForm) {
    const errorBox = $("#errorBox");
    const passwordInput = $("#password");
    const togglePassword = $("#togglePassword");
    const submitBtn = $('button[type="submit"]', loginForm);

    if (togglePassword && passwordInput) {
      togglePassword.addEventListener("change", () => {
        passwordInput.type = togglePassword.checked ? "text" : "password";
      });
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.hidden = true;

      const fd = new FormData(loginForm);
      const payload = {
        username: String(fd.get("username") || "").trim(),
        password: String(fd.get("password") || ""),
      };

      // UX guardrail: prevent typing both values in the username field
      if (!payload.password && /\s/.test(payload.username)) {
        errorBox.textContent = "الرجاء كتابة اسم المستخدم في حقل \"اسم المستخدم\" وكلمة المرور في حقل \"كلمة المرور\".";
        errorBox.hidden = false;
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "جارٍ التحقق...";
      }

      try {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
        window.location.href = "/admin";
      } catch (err) {
        if (err?.status === 401) {
          errorBox.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة.";
        } else if (err?.status === 400) {
          errorBox.textContent = "الرجاء إدخال اسم المستخدم وكلمة المرور بشكل صحيح.";
        } else {
          errorBox.textContent = "تعذر تسجيل الدخول حالياً. حاول مرة أخرى بعد قليل.";
        }
        errorBox.hidden = false;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "دخول";
        }
      }
    });
    return;
  }

  // --- Admin shell routing (new sidebar UX) ---
  const pages = $$('[data-page]');
  const navItems = $$('[data-route]');
  const breadcrumbs = $("#breadcrumbs");
  const quickActions = $("#quickActions");
  const toastStack = $("#toastStack");

  const STORAGE_KEYS = {
    sideGroups: "admin.side.groups.v1",
    favorites: "admin.side.favorites.v1",
  };

  const ROUTE_LABELS = {
    dashboard: "الرئيسية",
    home: "الصفحة الرئيسية",
    blog: "المدونة",
    "custom-pages": "الصفحات المخصصة",
    analytics: "التحليلات والتتبع",
    "website-stats": "إحصائيات الموقع",
    leads: "العملاء المحتملون",
    products: "المنتجات",
    categories: "التصنيفات",
    settings: "الإعدادات العامة",
    users: "المستخدمون والصلاحيات",
  };

  const dirtyState = {
    home: false,
    blog: false,
    "custom-pages": false,
    analytics: false,
    products: false,
    settings: false,
  };

  function anyDirty() {
    return Object.values(dirtyState).some(Boolean);
  }

  function setDirty(section, value = true) {
    if (!(section in dirtyState)) return;
    dirtyState[section] = !!value;
    if (section === "home" && $("#homeSaveIndicator")) {
      $("#homeSaveIndicator").textContent = value ? "غير محفوظ" : "جاهز";
    }
  }

  function routeHref(route) {
    return `#/${route}`;
  }

  function bindDirtyInputs(rootSelector, section) {
    const root = $(rootSelector);
    if (!root) return;
    root.addEventListener("input", () => setDirty(section, true));
    root.addEventListener("change", () => setDirty(section, true));
  }

  function showToast(message, type = "info", timeout = 2200) {
    if (!toastStack) return;
    const item = document.createElement("div");
    item.className = `toast${type === "error" ? " toast--error" : ""}`;
    item.textContent = message;
    toastStack.appendChild(item);
    setTimeout(() => {
      item.remove();
    }, timeout);
  }

  function formatDateTime(isoLike) {
    if (!isoLike) return "—";
    const raw = String(isoLike).replace(" ", "T");
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(isoLike);
    return d.toLocaleString("ar-SA", { hour12: false });
  }

  window.addEventListener("beforeunload", (e) => {
    if (!anyDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Sidebar groups + favorites
  const navFavoritesGroup = $("#favoritesGroup");
  const navFavoritesLinks = $("#favoritesLinks");
  let favoriteRoutes = new Set(readJSONStorage(STORAGE_KEYS.favorites, []));
  const collapsedGroups = readJSONStorage(STORAGE_KEYS.sideGroups, {});

  function saveFavorites() {
    writeJSONStorage(STORAGE_KEYS.favorites, Array.from(favoriteRoutes));
  }

  function renderFavorites() {
    if (!navFavoritesGroup || !navFavoritesLinks) return;
    const allRoutes = Array.from(favoriteRoutes).filter((r) => ROUTE_LABELS[r]);
    if (!allRoutes.length) {
      navFavoritesGroup.hidden = true;
      navFavoritesLinks.innerHTML = "";
    } else {
      navFavoritesGroup.hidden = false;
      navFavoritesLinks.innerHTML = allRoutes
        .map((route) => `<a class="sideNav__item" href="${routeHref(route)}" data-route="${route}">${ROUTE_LABELS[route]}</a>`)
        .join("");
    }

    $$('[data-fav-route]').forEach((star) => {
      const route = star.getAttribute("data-fav-route");
      const on = favoriteRoutes.has(route);
      star.classList.toggle("is-on", on);
      star.textContent = on ? "★" : "☆";
    });
  }

  function setupSidebarGroups() {
    $$('[data-group-toggle]').forEach((toggle, idx) => {
      const group = toggle.closest('.sideNav__group');
      if (!group) return;
      const key = toggle.textContent.trim() || `g${idx}`;
      if (collapsedGroups[key]) group.classList.add('is-collapsed');
      toggle.addEventListener('click', () => {
        group.classList.toggle('is-collapsed');
        collapsedGroups[key] = group.classList.contains('is-collapsed');
        writeJSONStorage(STORAGE_KEYS.sideGroups, collapsedGroups);
      });
    });
  }

  function setupFavoriteStars() {
    $$('[data-fav-route]').forEach((star) => {
      star.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const route = star.getAttribute('data-fav-route');
        if (!route) return;
        if (favoriteRoutes.has(route)) favoriteRoutes.delete(route);
        else favoriteRoutes.add(route);
        saveFavorites();
        renderFavorites();
        showToast('تم تحديث المفضلة');
      });
    });
  }

  setupSidebarGroups();
  setupFavoriteStars();
  renderFavorites();

  // Command palette
  const palette = $("#commandPalette");
  const paletteBtn = $("#commandPaletteBtn");
  const paletteInput = $("#commandPaletteInput");
  const paletteResults = $("#commandPaletteResults");

  const commandItems = [
    ...Object.entries(ROUTE_LABELS).map(([route, label]) => ({
      key: `route:${route}`,
      label,
      run: () => {
        location.hash = routeHref(route);
      },
    })),
    {
      key: "action:new-post",
      label: "إجراء: مقال جديد",
      run: () => {
        location.hash = "#/blog";
        setTimeout(() => $("#newPostBtn")?.click(), 60);
      },
    },
    {
      key: "action:new-custom-page",
      label: "إجراء: إنشاء صفحة مخصصة",
      run: () => {
        location.hash = "#/custom-pages";
        setTimeout(() => $("#createCustomPageBtn")?.click(), 60);
      },
    },
    {
      key: "action:save-current",
      label: "إجراء: حفظ الصفحة الحالية",
      run: () => {
        const r = activeRoute;
        if (r === "home") $("#saveHomeBtn")?.click();
        if (r === "blog") $("#savePostBtn")?.click();
        if (r === "analytics") $("#analyticsForm")?.requestSubmit();
        if (r === "custom-pages") $("#customPageEditor")?.requestSubmit();
        if (r === "products") $("#productEditor")?.requestSubmit();
        if (r === "settings") $("#settingsForm")?.requestSubmit();
      },
    },
  ];

  function closePalette() {
    if (!palette) return;
    palette.hidden = true;
  }

  function renderPaletteResults(query = "") {
    if (!paletteResults) return;
    const q = String(query || "").trim().toLowerCase();
    const list = commandItems
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .slice(0, 12);
    paletteResults.innerHTML =
      list
        .map((c, idx) => `<div class="cmdItem" data-cmd-idx="${idx}">${c.label}</div>`)
        .join("") || '<div class="cmdItem muted">لا توجد أوامر</div>';
    $$("[data-cmd-idx]", paletteResults).forEach((row) => {
      row.addEventListener("click", () => {
        const i = Number(row.getAttribute("data-cmd-idx"));
        const cmd = list[i];
        if (!cmd) return;
        cmd.run();
        closePalette();
      });
    });
  }

  function openPalette() {
    if (!palette) return;
    palette.hidden = false;
    renderPaletteResults("");
    if (paletteInput) {
      paletteInput.value = "";
      setTimeout(() => paletteInput.focus(), 0);
    }
  }

  paletteBtn?.addEventListener("click", openPalette);
  $("[data-close-palette]")?.addEventListener("click", closePalette);
  paletteInput?.addEventListener("input", (e) => renderPaletteResults(e.target.value));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if (e.key === "Escape") closePalette();
  });

  function setActiveRoute(route) {
    pages.forEach((p) => {
      p.hidden = p.getAttribute('data-page') !== route;
    });
    $$('[data-route]').forEach((a) => a.classList.toggle('is-active', a.getAttribute('data-route') === route));

    if (breadcrumbs) {
      const label = ROUTE_LABELS[route] || 'لوحة الإدارة';
      breadcrumbs.textContent = `لوحة الإدارة / ${label}`;
    }

    if (quickActions) {
      quickActions.innerHTML = '';
      const addLink = (href, text) => {
        const a = document.createElement('a');
        a.className = 'btn btn--ghost';
        a.href = href;
        a.textContent = text;
        quickActions.appendChild(a);
      };
      if (route === 'leads') addLink('#/leads', 'إضافة عميل محتمل');
      if (route === 'products') addLink('#/products', 'إضافة منتج');
      if (route === 'custom-pages') addLink('#/custom-pages', 'إنشاء صفحة مخصصة');
    }
  }

  function currentRoute() {
    const h = String(location.hash || '');
    const m = h.match(/^#\/(.+)$/);
    const r = (m ? m[1] : '').split('?')[0];
    return r || 'dashboard';
  }

  let activeRoute = currentRoute();
  let ignoreNextHash = false;
  window.addEventListener('hashchange', () => {
    if (ignoreNextHash) {
      ignoreNextHash = false;
      return;
    }
    const nextRoute = currentRoute();
    if (dirtyState[activeRoute]) {
      const ok = window.confirm('لديك تغييرات غير محفوظة. هل تريد المتابعة بدون حفظ؟');
      if (!ok) {
        ignoreNextHash = true;
        location.hash = routeHref(activeRoute);
        return;
      }
      setDirty(activeRoute, false);
    }
    activeRoute = nextRoute;
    setActiveRoute(nextRoute);
  });

  // Mobile sidebar toggle
  const sidebarToggle = $("#sidebarToggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
    document.addEventListener('click', (e) => {
      const sidebar = $("#sidebar");
      if (!sidebar) return;
      const isInside = sidebar.contains(e.target) || sidebarToggle.contains(e.target);
      if (!isInside) document.body.classList.remove('sidebar-open');
    });
  }

  // Initialize route
  setActiveRoute(activeRoute);

  // --- Dashboard page ---
  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      window.location.href = "/admin-login";
    });
  }

  // (Tabs removed; routing now controls visibility)

  // Home editor
  let homeDraft = null;
  let heroVideosCache = [];

  function el(tag, attrs = {}, html = "") {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || typeof v === "undefined") return;
      if (k === "class") node.className = v;
      else if (k === "dataset") Object.entries(v).forEach(([dk, dv]) => (node.dataset[dk] = dv));
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    });
    if (html) node.innerHTML = html;
    return node;
  }

  function bindInput(id, getter, setter) {
    const input = $(id.startsWith("#") ? id : `#${id}`);
    if (!input) return;
    input.value = getter() || "";
    input.addEventListener("input", () => setter(input.value));
  }

  function moveArrayItem(arr, from, to) {
    if (!Array.isArray(arr)) return;
    if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
  }

  function defaultItemFor(path) {
    switch (path) {
      case "solutions.cards":
      case "why.cards":
        return { iconClass: "fa-solid fa-circle", title: "", desc: "" };
      case "process.steps":
        return { title: "", desc: "" };
      case "integrations.chips":
        return "";
      case "faq.items":
        return { q: "", a: "" };
      case "stats":
        return { value: 0, label: "", suffix: "" };
      default:
        return {};
    }
  }

  function renderArray(path) {
    if (!homeDraft) return;
    const container = document.querySelector(`[data-array="${path}"]`);
    if (!container) return;

    const arr = getByPath(homeDraft, path);
    if (!Array.isArray(arr)) {
      setByPath(homeDraft, path, []);
    }
    const list = getByPath(homeDraft, path);

    container.innerHTML = "";

    list.forEach((item, idx) => {
      const row = el("div", { class: "row" });

      const head = el("div", { class: "row__head" });
      head.appendChild(el("div", { class: "row__title" }, `${path} #${idx + 1}`));

      const tools = el("div", { class: "row__tools" });
      tools.appendChild(
        el(
          "button",
          {
            type: "button",
            class: "iconBtn",
            onClick: () => {
              moveArrayItem(list, idx, idx - 1);
              renderArray(path);
            },
          },
          "↑"
        )
      );
      tools.appendChild(
        el(
          "button",
          {
            type: "button",
            class: "iconBtn",
            onClick: () => {
              moveArrayItem(list, idx, idx + 1);
              renderArray(path);
            },
          },
          "↓"
        )
      );
      tools.appendChild(
        el(
          "button",
          {
            type: "button",
            class: "iconBtn iconBtn--danger",
            onClick: () => {
              list.splice(idx, 1);
              renderArray(path);
            },
          },
          "حذف"
        )
      );
      head.appendChild(tools);
      row.appendChild(head);

      // Fields per item type
      if (path === "integrations.chips") {
        const input = el("input", { class: "field__input", type: "text", value: String(item || "") });
        input.addEventListener("input", () => (list[idx] = input.value));
        row.appendChild(input);
      } else if (path === "stats") {
        const g = el("div", { class: "grid3" });
        const v = el("input", { class: "field__input", type: "number", value: item?.value ?? 0, dir: "ltr" });
        const label = el("input", { class: "field__input", type: "text", value: item?.label ?? "" });
        const suffix = el("input", { class: "field__input", type: "text", value: item?.suffix ?? "", dir: "ltr" });
        v.addEventListener("input", () => (list[idx].value = Number(v.value || 0)));
        label.addEventListener("input", () => (list[idx].label = label.value));
        suffix.addEventListener("input", () => (list[idx].suffix = suffix.value));
        g.appendChild(v);
        g.appendChild(label);
        g.appendChild(suffix);
        row.appendChild(g);
      } else if (path === "process.steps") {
        const title = el("input", { class: "field__input", type: "text", value: item?.title ?? "" });
        const desc = el("textarea", { class: "field__input", rows: "3" }, "");
        desc.value = item?.desc ?? "";
        title.addEventListener("input", () => (list[idx].title = title.value));
        desc.addEventListener("input", () => (list[idx].desc = desc.value));
        row.appendChild(title);
        row.appendChild(desc);
      } else if (path === "faq.items") {
        const q = el("input", { class: "field__input", type: "text", value: item?.q ?? "" });
        const a = el("textarea", { class: "field__input", rows: "3" }, "");
        a.value = item?.a ?? "";
        q.addEventListener("input", () => (list[idx].q = q.value));
        a.addEventListener("input", () => (list[idx].a = a.value));
        row.appendChild(q);
        row.appendChild(a);
      } else {
        // cards type
        const iconClass = el("input", { class: "field__input", type: "text", value: item?.iconClass ?? "", dir: "ltr" });
        const title = el("input", { class: "field__input", type: "text", value: item?.title ?? "" });
        const desc = el("textarea", { class: "field__input", rows: "3" }, "");
        desc.value = item?.desc ?? "";
        iconClass.addEventListener("input", () => (list[idx].iconClass = iconClass.value));
        title.addEventListener("input", () => (list[idx].title = title.value));
        desc.addEventListener("input", () => (list[idx].desc = desc.value));
        row.appendChild(iconClass);
        row.appendChild(title);
        row.appendChild(desc);
      }

      container.appendChild(row);
    });
  }

  function renderAllArrays() {
    ["solutions.cards", "stats", "why.cards", "process.steps", "integrations.chips", "faq.items"].forEach(renderArray);
  }

  function wireAddButtons() {
    $$(`[data-add-item]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!homeDraft) return;
        const path = btn.getAttribute("data-add-item");
        const arr = getByPath(homeDraft, path);
        if (!Array.isArray(arr)) setByPath(homeDraft, path, []);
        getByPath(homeDraft, path).push(defaultItemFor(path));
        renderArray(path);
      });
    });
  }

  function setHeroVideoModeUI() {
    const sourceType = String($("#heroVideoSourceType")?.value || "youtube").toLowerCase();
    const youtubeWrap = $("#heroVideoYoutubeWrap");
    const uploadWrap = $("#heroVideoUploadWrap");
    const library = $("#heroVideoLibrary");
    const showUpload = sourceType === "upload";

    if (youtubeWrap) youtubeWrap.hidden = showUpload;
    if (uploadWrap) uploadWrap.hidden = !showUpload;
    if (library) library.hidden = !showUpload;
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const kb = 1024;
    const mb = kb * 1024;
    if (n >= mb) return `${(n / mb).toFixed(1)} MB`;
    if (n >= kb) return `${(n / kb).toFixed(1)} KB`;
    return `${n} B`;
  }

  function renderHeroVideoLibrary() {
    const container = $("#heroVideoLibrary");
    if (!container) return;

    if (!heroVideosCache.length) {
      container.innerHTML = `<div class="videoLibrary__empty">لا توجد فيديوهات مرفوعة بعد.</div>`;
      return;
    }

    const selectedUrl = String($("#heroVideoUploadedUrl")?.value || "").trim();
    container.innerHTML = heroVideosCache
      .map((v, idx) => {
        const active = selectedUrl && selectedUrl === v.url;
        const when = v.mtimeMs ? new Date(v.mtimeMs).toLocaleString("ar-SA", { hour12: false }) : "—";
        return `
          <button class="videoItem${active ? " is-active" : ""}" type="button" data-video-idx="${idx}">
            <span class="videoItem__name" dir="ltr">${v.name || v.url}</span>
            <span class="videoItem__meta" dir="ltr">${formatBytes(v.size)} • ${when}</span>
            <span class="videoItem__url" dir="ltr">${v.url}</span>
          </button>
        `;
      })
      .join("");

    $$("[data-video-idx]", container).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-video-idx"));
        const item = heroVideosCache[idx];
        if (!item) return;
        const input = $("#heroVideoUploadedUrl");
        if (input) input.value = item.url;
        renderHeroVideoLibrary();
        setDirty("home", true);
      });
    });
  }

  async function loadHeroVideosList() {
    const status = $("#heroVideoUploadStatus");
    try {
      const res = await api("/api/uploads/videos");
      heroVideosCache = Array.isArray(res?.videos) ? res.videos : [];
      renderHeroVideoLibrary();
      if (status) status.textContent = "";
    } catch (e) {
      heroVideosCache = [];
      renderHeroVideoLibrary();
      if (status) status.textContent = "تعذر تحميل قائمة الفيديوهات";
    }
  }

  async function uploadHeroVideo(file) {
    const form = new FormData();
    form.append("video", file);
    const res = await fetch("/api/uploads/videos", { method: "POST", body: form, credentials: "same-origin" });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: "UPLOAD_FAILED" };
    }
    if (!res.ok) throw new Error(json.error || "UPLOAD_FAILED");
    return json.url;
  }

  function fillHomeFieldsFromDraft() {
    if (!homeDraft) return;

    // Topbar
    $("#topbarSupportText").value = homeDraft.topbar?.supportText || "";
    $("#topbarPhone").value = homeDraft.topbar?.phone || "";
    $("#topbarTagline").value = homeDraft.topbar?.tagline || "";
    $("#topbarCtaText").value = homeDraft.topbar?.ctaText || "";
    $("#topbarCtaHref").value = homeDraft.topbar?.ctaHref || "";

    // Hero
    $("#heroKicker").value = homeDraft.hero?.kicker || "";
    $("#heroTitle").value = homeDraft.hero?.title || "";
    $("#heroDesc").value = homeDraft.hero?.desc || "";
    $("#heroCtaPrimary").value = homeDraft.hero?.ctaPrimary || "";
    $("#heroCtaSecondary").value = homeDraft.hero?.ctaSecondary || "";

    // Hero video
    const sourceType = homeDraft.heroVideo?.sourceType === "upload" ? "upload" : "youtube";
    $("#heroVideoSourceType").value = sourceType;
    $("#heroVideoYoutubeUrl").value = homeDraft.heroVideo?.youtubeUrl || "https://www.youtube.com/watch?v=xwYbULh3aRE";
    $("#heroVideoUploadedUrl").value = homeDraft.heroVideo?.uploadedVideoUrl || "";
    setHeroVideoModeUI();

    // Solutions
    $("#solutionsHeading").value = homeDraft.solutions?.heading || "";
    $("#solutionsSubheading").value = homeDraft.solutions?.subheading || "";

    // Platform
    $("#platformKicker").value = homeDraft.platform?.kicker || "";
    $("#platformTitle").value = homeDraft.platform?.title || "";
    $("#platformDesc").value = homeDraft.platform?.desc || "";
    $("#platformCtaPrimary").value = homeDraft.platform?.ctaPrimary || "";
    $("#platformCtaSecondary").value = homeDraft.platform?.ctaSecondary || "";

    // Why
    $("#whyHeading").value = homeDraft.why?.heading || "";
    $("#whySubheading").value = homeDraft.why?.subheading || "";

    // Process
    $("#processHeading").value = homeDraft.process?.heading || "";
    $("#processSubheading").value = homeDraft.process?.subheading || "";
    const productsToggle = $("#sectionsProductsEnabled");
    if (productsToggle) productsToggle.checked = homeDraft.sections?.productsEnabled !== false;
    const blogToggle = $("#sectionsBlogEnabled");
    if (blogToggle) blogToggle.checked = homeDraft.sections?.blogEnabled === true;

    // Integrations
    $("#integrationsHeading").value = homeDraft.integrations?.heading || "";
    $("#integrationsSubheading").value = homeDraft.integrations?.subheading || "";

    // FAQ
    $("#faqHeading").value = homeDraft.faq?.heading || "";
    $("#faqSubheading").value = homeDraft.faq?.subheading || "";

    // Contact
    $("#contactHeading").value = homeDraft.contact?.heading || "";
    $("#contactSubheading").value = homeDraft.contact?.subheading || "";
    $("#contactEmail").value = homeDraft.contact?.email || "";
    $("#contactPhone").value = homeDraft.contact?.phone || "";
    $("#contactAddress").value = homeDraft.contact?.address || "";
    $("#contactBackToTopText").value = homeDraft.contact?.backToTopText || "";
  }

  function syncDraftFromFields() {
    if (!homeDraft) return;

    homeDraft.topbar = homeDraft.topbar || {};
    homeDraft.hero = homeDraft.hero || {};
    homeDraft.heroVideo = homeDraft.heroVideo || {};
    homeDraft.solutions = homeDraft.solutions || {};
    homeDraft.platform = homeDraft.platform || {};
    homeDraft.why = homeDraft.why || {};
    homeDraft.process = homeDraft.process || {};
    homeDraft.sections = homeDraft.sections || {};
    homeDraft.integrations = homeDraft.integrations || {};
    homeDraft.faq = homeDraft.faq || {};
    homeDraft.contact = homeDraft.contact || {};

    // Topbar
    homeDraft.topbar.supportText = $("#topbarSupportText").value.trim();
    homeDraft.topbar.phone = $("#topbarPhone").value.trim();
    homeDraft.topbar.tagline = $("#topbarTagline").value.trim();
    homeDraft.topbar.ctaText = $("#topbarCtaText").value.trim();
    homeDraft.topbar.ctaHref = $("#topbarCtaHref").value.trim();

    // Hero
    homeDraft.hero.kicker = $("#heroKicker").value.trim();
    homeDraft.hero.title = $("#heroTitle").value.trim();
    homeDraft.hero.desc = $("#heroDesc").value.trim();
    homeDraft.hero.ctaPrimary = $("#heroCtaPrimary").value.trim();
    homeDraft.hero.ctaSecondary = $("#heroCtaSecondary").value.trim();

    // Hero video
    homeDraft.heroVideo.sourceType = $("#heroVideoSourceType").value === "upload" ? "upload" : "youtube";
    homeDraft.heroVideo.youtubeUrl = $("#heroVideoYoutubeUrl").value.trim();
    homeDraft.heroVideo.uploadedVideoUrl = $("#heroVideoUploadedUrl").value.trim();

    // Solutions
    homeDraft.solutions.heading = $("#solutionsHeading").value.trim();
    homeDraft.solutions.subheading = $("#solutionsSubheading").value.trim();

    // Platform
    homeDraft.platform.kicker = $("#platformKicker").value.trim();
    homeDraft.platform.title = $("#platformTitle").value.trim();
    homeDraft.platform.desc = $("#platformDesc").value.trim();
    homeDraft.platform.ctaPrimary = $("#platformCtaPrimary").value.trim();
    homeDraft.platform.ctaSecondary = $("#platformCtaSecondary").value.trim();

    // Why
    homeDraft.why.heading = $("#whyHeading").value.trim();
    homeDraft.why.subheading = $("#whySubheading").value.trim();

    // Process
    homeDraft.process.heading = $("#processHeading").value.trim();
    homeDraft.process.subheading = $("#processSubheading").value.trim();
    const productsToggle = $("#sectionsProductsEnabled");
    homeDraft.sections.productsEnabled = productsToggle ? !!productsToggle.checked : homeDraft.sections.productsEnabled !== false;
    const blogToggle = $("#sectionsBlogEnabled");
    homeDraft.sections.blogEnabled = blogToggle ? !!blogToggle.checked : homeDraft.sections.blogEnabled === true;

    // Integrations
    homeDraft.integrations.heading = $("#integrationsHeading").value.trim();
    homeDraft.integrations.subheading = $("#integrationsSubheading").value.trim();

    // FAQ
    homeDraft.faq.heading = $("#faqHeading").value.trim();
    homeDraft.faq.subheading = $("#faqSubheading").value.trim();

    // Contact
    homeDraft.contact.heading = $("#contactHeading").value.trim();
    homeDraft.contact.subheading = $("#contactSubheading").value.trim();
    homeDraft.contact.email = $("#contactEmail").value.trim();
    homeDraft.contact.phone = $("#contactPhone").value.trim();
    homeDraft.contact.address = $("#contactAddress").value.trim();
    homeDraft.contact.backToTopText = $("#contactBackToTopText").value.trim();
  }

  async function loadHome() {
    const { content } = await api("/api/content/home");
    homeDraft = content || null;
    if (!homeDraft) return;

    // Basic fields
    fillHomeFieldsFromDraft();

    // Arrays
    renderAllArrays();
    wireAddButtons();
    await loadHeroVideosList();
  }

  async function saveHome() {
    const status = $("#homeStatus");
    status.textContent = "جارٍ الحفظ...";
    if (!homeDraft) {
      const { content } = await api("/api/content/home");
      homeDraft = content || {};
    }
    syncDraftFromFields();

    try {
      await api("/api/content/home", { method: "PUT", body: JSON.stringify({ content: homeDraft }) });
      status.textContent = "تم الحفظ";
      setDirty("home", false);
      showToast("تم حفظ الصفحة الرئيسية");
      setTimeout(() => (status.textContent = ""), 1500);
    } catch (err) {
      status.textContent = err?.status === 401 ? "انتهت الجلسة، سجّل الدخول مرة أخرى" : "فشل حفظ الصفحة";
      showToast(status.textContent, "error");
      throw err;
    }
  }

  const saveHomeBtn = $("#saveHomeBtn");
  if (saveHomeBtn) saveHomeBtn.addEventListener("click", () => saveHome().catch(console.error));

  async function saveHomeSectionsPatch() {
    const status = $("#homeStatus");
    const productsToggle = $("#sectionsProductsEnabled");
    const productsEnabled = productsToggle ? !!productsToggle.checked : true;
    const blogToggle = $("#sectionsBlogEnabled");
    const blogEnabled = blogToggle ? !!blogToggle.checked : false;

    status.textContent = "جارٍ الحفظ...";
    await api("/api/content/home/sections", {
      method: "PATCH",
      body: JSON.stringify({
        sections: { productsEnabled, blogEnabled },
      }),
    });
    status.textContent = "تم الحفظ";
    setDirty("home", false);
    showToast("تم حفظ إعدادات الأقسام");
    setTimeout(() => (status.textContent = ""), 1500);
  }

  $("#sectionsProductsEnabled")?.addEventListener("change", async () => {
    setDirty("home", true);
    try {
      await saveHomeSectionsPatch();
    } catch (err) {
      const status = $("#homeStatus");
      status.textContent = err?.status === 401 ? "انتهت الجلسة، سجّل الدخول مرة أخرى" : "فشل حفظ إعدادات الأقسام";
      showToast(status.textContent, "error");
    }
  });

  $("#sectionsBlogEnabled")?.addEventListener("change", async () => {
    setDirty("home", true);
    try {
      await saveHomeSectionsPatch();
    } catch (err) {
      const status = $("#homeStatus");
      status.textContent = err?.status === 401 ? "انتهت الجلسة، سجّل الدخول مرة أخرى" : "فشل حفظ إعدادات الأقسام";
      showToast(status.textContent, "error");
    }
  });

  $("#heroVideoSourceType")?.addEventListener("change", () => {
    setHeroVideoModeUI();
    setDirty("home", true);
  });
  $("#heroVideoYoutubeUrl")?.addEventListener("input", () => setDirty("home", true));
  $("#heroVideoUploadedUrl")?.addEventListener("input", () => {
    renderHeroVideoLibrary();
    setDirty("home", true);
  });
  $("#heroVideoRefreshListBtn")?.addEventListener("click", () => loadHeroVideosList().catch(console.error));
  $("#heroVideoUploadBtn")?.addEventListener("click", async () => {
    const status = $("#heroVideoUploadStatus");
    const fileInput = $("#heroVideoUploadFile");
    const file = fileInput?.files?.[0];
    if (!file) {
      if (status) status.textContent = "اختر ملف فيديو أولاً";
      return;
    }

    if (status) status.textContent = "جارٍ رفع الفيديو...";
    try {
      const url = await uploadHeroVideo(file);
      const uploadedField = $("#heroVideoUploadedUrl");
      const sourceTypeField = $("#heroVideoSourceType");
      if (uploadedField) uploadedField.value = url;
      if (sourceTypeField) sourceTypeField.value = "upload";
      if (fileInput) fileInput.value = "";
      setHeroVideoModeUI();
      await loadHeroVideosList();
      if (status) status.textContent = "تم رفع الفيديو";
      setDirty("home", true);
      showToast("تم رفع فيديو جديد");
      setTimeout(() => {
        if (status) status.textContent = "";
      }, 1500);
    } catch (e) {
      if (status) status.textContent = "فشل رفع الفيديو";
      showToast("فشل رفع الفيديو", "error");
    }
  });

  // Blog editor (TinyMCE self-hosted)
  const editorSurface = $("#postEditorSurface");
  let blogEditorReady = false;
  let pendingEditorHtml = "";

  function getTinyEditor() {
    return window.tinymce?.get("postEditorSurface") || null;
  }

  function focusEditorSurface() {
    const editor = getTinyEditor();
    if (editor) editor.focus();
    else editorSurface?.focus();
  }

  function getEditorHtml() {
    const editor = getTinyEditor();
    if (editor) return String(editor.getContent() || "").trim();
    return String(editorSurface?.value || pendingEditorHtml || "").trim();
  }

  function setEditorHtml(html) {
    const normalized = String(html || "").trim();
    pendingEditorHtml = normalized;
    const editor = getTinyEditor();
    if (editor) {
      editor.setContent(normalized);
      return;
    }
    if (editorSurface) editorSurface.value = normalized;
  }

  async function uploadImage(file) {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch("/api/uploads/images", { method: "POST", body: form, credentials: "same-origin" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "UPLOAD_FAILED");
    return json.url;
  }

  // Initialize TinyMCE when DOM is ready and script is loaded
  function initTinyMCE() {
    if (!editorSurface) return;
    if (!window.tinymce) {
      console.error("TinyMCE not loaded");
      return;
    }
    
    console.log("Initializing TinyMCE...");
    
    window.tinymce.init({
      selector: "#postEditorSurface",
      license_key: "gpl",
      menubar: false,
      promotion: false,
      branding: false,
      directionality: "rtl",
      height: 520,
      placeholder: "اكتب محتوى المقال هنا...",
      plugins: "lists link image table code autoresize directionality",
      toolbar:
        "undo redo | blocks fontsize | bold italic underline | alignright aligncenter alignleft | bullist numlist | link image table | removeformat code",
      block_formats: "فقرة=p; عنوان رئيسي=h2; عنوان فرعي=h3; عنوان صغير=h4",
      fontsize_formats: "12px 14px 16px 18px 20px 24px 28px 32px",
      automatic_uploads: false,
      images_upload_handler: async (blobInfo) => {
        const file = blobInfo.blob();
        return uploadImage(file);
      },
      content_style:
        'body { font-family: Cairo, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; direction: rtl; text-align: right; font-size: 15px; line-height: 1.95; margin: 16px; color: #1d2939; } img { max-width: 100%; height: auto; border-radius: 14px; }',
      setup: (editor) => {
        editor.on("init", () => {
          blogEditorReady = true;
          if (pendingEditorHtml) editor.setContent(pendingEditorHtml);
        });
        editor.on("change input undo redo setcontent", () => {
          if (blogEditorReady) setDirty("blog", true);
        });
      },
    });
  }

  async function importProductsCsv(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/products/import-csv", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: "IMPORT_FAILED" };
    }
    if (!res.ok) throw Object.assign(new Error(json.error || "IMPORT_FAILED"), { status: res.status, json });
    return json;
  }

  function selectLocalImage() {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        const editor = getTinyEditor();
        if (editor) {
          editor.focus();
          editor.insertContent(`<img src="${url}" alt="" />`);
        }
        setDirty("blog", true);
      } catch (e) {
        console.error(e);
        alert("فشل رفع الصورة");
      }
    };
  }

  let currentPostId = null;
  let postsCache = [];

  function slugifyArabic(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\u0600-\u06FF0-9a-z\-]+/gi, "")
      .replace(/\-+/g, "-")
      .replace(/^\-+|\-+$/g, "");
  }

  function normalizeTagsInput(value) {
    return String(value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function updatePostCoverPreview(url) {
    const img = $("#postCoverPreview");
    const empty = $("#postCoverEmpty");
    const normalized = String(url || "").trim();
    if (!img || !empty) return;
    if (!normalized) {
      img.hidden = true;
      img.removeAttribute("src");
      empty.hidden = false;
      return;
    }
    img.src = normalized;
    img.hidden = false;
    empty.hidden = true;
  }

  function updateBlogStats() {
    const total = postsCache.length;
    const published = postsCache.filter((p) => !!p.published).length;
    const drafts = total - published;
    const selected = currentPostId ? postsCache.find((p) => Number(p.id) === Number(currentPostId)) : null;
    if ($("#blogTotalPosts")) $("#blogTotalPosts").textContent = String(total);
    if ($("#blogPublishedPosts")) $("#blogPublishedPosts").textContent = String(published);
    if ($("#blogDraftPosts")) $("#blogDraftPosts").textContent = String(drafts);
    if ($("#blogSelectedPost")) $("#blogSelectedPost").textContent = selected?.title || "—";
  }

  function updatePostEditorMeta(post) {
    const meta = $("#postEditorMeta");
    if (!meta) return;
    if (!post?.id) {
      meta.textContent = "تعمل الآن على مسودة جديدة غير محفوظة";
      return;
    }
    meta.textContent = `المقال الحالي: ${post.title} • آخر تحديث: ${formatDateTime(post.updated_at || post.created_at)}`;
  }

  function renderPostsList() {
    const list = $("#postsList");
    const summary = $("#postsListSummary");
    if (!list) return;
    const q = String($("#postsFilter")?.value || "").trim().toLowerCase();
    const rows = postsCache.filter((p) => {
      if (!q) return true;
      return String(p.title || "").toLowerCase().includes(q) || String(p.slug || "").toLowerCase().includes(q);
    });
    if (summary) summary.textContent = rows.length ? `عدد النتائج: ${rows.length}` : "لا توجد نتائج مطابقة";
    list.innerHTML = "";
    rows.forEach((p) => {
      const el = document.createElement("div");
      el.className = `postItem${Number(currentPostId) === Number(p.id) ? " is-active" : ""}`;
      el.innerHTML = `
        <div class="postItem__title">${p.title}</div>
        <div class="postItem__meta" dir="ltr">/${p.slug}</div>
        <div class="postItem__badges">
          <span class="pill ${p.published ? "pill--pub" : "pill--draft"}">${p.published ? "منشور" : "مسودة"}</span>
          <span class="pill pill--draft">${formatDateTime(p.updated_at || p.created_at)}</span>
        </div>
      `;
      el.addEventListener("click", () => selectPost(p));
      list.appendChild(el);
    });
  }

  async function loadPosts() {
    const list = $("#postsList");
    if (list) list.textContent = "جارٍ التحميل...";
    const { posts } = await api("/api/posts");
    postsCache = Array.isArray(posts) ? posts : [];
    renderPostsList();
    updateBlogStats();
  }

  function selectPost(p) {
    currentPostId = p.id;
    $("#postTitle").value = p.title || "";
    $("#postSlug").value = p.slug || "";
    $("#postExcerpt").value = p.excerpt || "";
    $("#postTags").value = Array.isArray(p.tags) ? p.tags.join(", ") : "";
    $("#postCover").value = p.cover_image || "";
    $("#postPublished").checked = !!p.published;
    setEditorHtml(p.content_html || "");
    updatePostCoverPreview(p.cover_image || "");
    updatePostEditorMeta(p);
    setDirty("blog", false);
    renderPostsList();
    updateBlogStats();
  }

  function newPost() {
    currentPostId = null;
    $("#postTitle").value = "";
    $("#postSlug").value = "";
    $("#postExcerpt").value = "";
    $("#postTags").value = "";
    $("#postCover").value = "";
    $("#postPublished").checked = false;
    setEditorHtml("");
    updatePostCoverPreview("");
    updatePostEditorMeta(null);
    setDirty("blog", false);
    renderPostsList();
    updateBlogStats();
  }

  bindDirtyInputs('[data-page="home"]', 'home');
  bindDirtyInputs('[data-page="blog"]', 'blog');
  bindDirtyInputs('[data-page="products"]', 'products');
  bindDirtyInputs('#settingsForm', 'settings');

  $("#newPostBtn")?.addEventListener("click", newPost);
  $("#refreshPostsBtn")?.addEventListener("click", () => loadPosts().catch(console.error));
  $("#clearPostBtn")?.addEventListener("click", newPost);
  $("#insertEditorImageBtn")?.addEventListener("click", selectLocalImage);
  $("#postsFilter")?.addEventListener("input", renderPostsList);
  $("#postCover")?.addEventListener("input", (e) => updatePostCoverPreview(e.target.value));
  $("#postCoverClearBtn")?.addEventListener("click", () => {
    $("#postCover").value = "";
    updatePostCoverPreview("");
    setDirty("blog", true);
  });
  $("#postCoverUploadBtn")?.addEventListener("click", async () => {
    const status = $("#postCoverStatus");
    const fileInput = $("#postCoverFile");
    const file = fileInput?.files?.[0];
    if (!file) {
      if (status) status.textContent = "اختر صورة أولاً";
      return;
    }
    if (status) status.textContent = "جارٍ رفع الصورة...";
    try {
      const url = await uploadImage(file);
      $("#postCover").value = url;
      if (fileInput) fileInput.value = "";
      updatePostCoverPreview(url);
      setDirty("blog", true);
      if (status) status.textContent = "تم رفع صورة الغلاف";
      showToast("تم رفع صورة الغلاف");
      setTimeout(() => {
        if (status) status.textContent = "";
      }, 1500);
    } catch {
      if (status) status.textContent = "فشل رفع الصورة";
      showToast("فشل رفع صورة الغلاف", "error");
    }
  });
  $("#openPostBtn")?.addEventListener("click", () => {
    const slug = String($("#postSlug")?.value || "").trim();
    if (!slug) return;
    window.open(`/blog/${encodeURIComponent(slug)}`, "_blank", "noopener");
  });

  $("#postTitle")?.addEventListener("input", (e) => {
    const slugInput = $("#postSlug");
    if (!slugInput.value) slugInput.value = slugifyArabic(e.target.value);
  });

  async function savePost() {
    const status = $("#postStatus");
    status.textContent = "جارٍ الحفظ...";

    const payload = {
      slug: $("#postSlug").value.trim(),
      title: $("#postTitle").value.trim(),
      excerpt: $("#postExcerpt").value.trim(),
      cover_image: $("#postCover").value.trim(),
      content_html: getEditorHtml(),
      tags: normalizeTagsInput($("#postTags").value),
      published: $("#postPublished").checked,
    };

    if (!payload.slug || !payload.title) throw new Error("Missing title/slug");

    if (currentPostId) {
      await api(`/api/posts/${currentPostId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      const res = await api("/api/posts", { method: "POST", body: JSON.stringify(payload) });
      currentPostId = res.id;
    }
    await loadPosts();
    const saved = postsCache.find((p) => Number(p.id) === Number(currentPostId));
    if (saved) selectPost(saved);
    status.textContent = "تم الحفظ";
    setDirty("blog", false);
    showToast("تم حفظ المقال");
    setTimeout(() => (status.textContent = ""), 1500);
  }

  async function deletePost() {
    if (!currentPostId) return;
    if (!confirm("هل تريد حذف المقال؟")) return;
    await api(`/api/posts/${currentPostId}`, { method: "DELETE" });
    newPost();
    await loadPosts();
    showToast("تم حذف المقال");
  }

  $("#savePostBtn")?.addEventListener("click", () => savePost().catch((e) => alert(e.message)));
  $("#deletePostBtn")?.addEventListener("click", () => deletePost().catch(console.error));

  // Initial load
  loadHome().catch(console.error);
  loadPosts().catch(() => {});

  // --- Analytics settings page ---
  function buildAnalyticsSnippet(enabled, gaId, gtmId) {
    if (!enabled) return "// Analytics disabled\n// لا يتم حقن أي سكربت حتى يتم التفعيل + موافقة الزائر.";
    const parts = [];
    if (gaId) {
      parts.push(
        "<script async src=\"https://www.googletagmanager.com/gtag/js?id=" + gaId + "\"></script>",
        "<script>",
        "  window.dataLayer = window.dataLayer || [];",
        "  function gtag(){dataLayer.push(arguments);}",
        "  gtag('js', new Date());",
        "  gtag('config', '" + gaId + "');",
        "</script>"
      );
    }
    if (gtmId) {
      parts.push("<!-- GTM: " + gtmId + " -->");
    }
    parts.push("// ملاحظة: هذا المقتطف يُحقن فقط بعد موافقة analytics consent.");
    return parts.join("\n");
  }

  function updateAnalyticsMeta(meta = {}) {
    const enabled = !!$("#analyticsEnabled")?.checked;
    const gaId = String($("#gaMeasurementId")?.value || "").trim();
    const gtmId = String($("#gtmContainerId")?.value || "").trim();
    const source = meta.source || "db";
    const hasId = !!(gaId || gtmId);

    const statusEl = $("#analyticsConnectionStatus");
    if (statusEl) {
      statusEl.textContent = enabled
        ? hasId
          ? "حالة الاتصال: جاهز"
          : "حالة الاتصال: معرّفات التتبع غير مكتملة"
        : "حالة الاتصال: معطّل";
    }

    const effective = $("#analyticsEffective");
    if (effective) {
      effective.textContent = `الحالة الفعّالة: ${source === "env" ? "تجاوز عبر البيئة" : "قاعدة البيانات"} • التفعيل: ${enabled ? "نعم" : "لا"}`;
    }

    const snippetEl = $("#analyticsSnippet");
    if (snippetEl) snippetEl.value = buildAnalyticsSnippet(enabled, gaId, gtmId);

    const updatedEl = $("#analyticsUpdatedAt");
    if (updatedEl) {
      updatedEl.textContent = `آخر تحديث: ${formatDateTime(meta.updated_at || new Date().toISOString())}`;
    }
  }

  async function loadAnalyticsForm() {
    const form = $("#analyticsForm");
    if (!form) return;
    const status = $("#analyticsStatus");
    const effective = $("#analyticsEffective");
    status.textContent = "جارٍ التحميل...";
    try {
      const { settings } = await api("/api/settings/analytics");
      $("#analyticsEnabled").checked = !!settings.enabled;
      $("#gaMeasurementId").value = settings.gaMeasurementId || "";
      $("#gtmContainerId").value = settings.gtmContainerId || "";
      updateAnalyticsMeta(settings);
      setDirty("analytics", false);
      status.textContent = "";
    } catch (e) {
      status.textContent = "فشل تحميل الإعدادات";
    }
  }

  ["#analyticsEnabled", "#gaMeasurementId", "#gtmContainerId"].forEach((sel) => {
    $(sel)?.addEventListener("input", () => updateAnalyticsMeta());
    $(sel)?.addEventListener("change", () => updateAnalyticsMeta());
  });
  bindDirtyInputs('#analyticsForm', 'analytics');

  $("#analyticsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#analyticsStatus");
    status.textContent = "جارٍ الحفظ...";
    try {
      const payload = {
        enabled: $("#analyticsEnabled").checked,
        gaMeasurementId: $("#gaMeasurementId").value.trim(),
        gtmContainerId: $("#gtmContainerId").value.trim(),
      };
      if (payload.gaMeasurementId && !/^G-[A-Z0-9]+$/i.test(payload.gaMeasurementId)) {
        throw new Error("INVALID_GA_ID");
      }
      if (payload.gtmContainerId && !/^GTM-[A-Z0-9]+$/i.test(payload.gtmContainerId)) {
        throw new Error("INVALID_GTM_ID");
      }
      const res = await api("/api/settings/analytics", { method: "PUT", body: JSON.stringify(payload) });
      status.textContent = "تم الحفظ";
      updateAnalyticsMeta(res.effective || payload);
      setDirty("analytics", false);
      showToast("تم حفظ إعدادات التحليلات");
      setTimeout(() => (status.textContent = ""), 1500);
    } catch (err) {
      status.textContent =
        err?.message === "INVALID_GA_ID"
          ? "صيغة GA غير صحيحة (مثال: G-XXXXXXXXXX)"
          : err?.message === "INVALID_GTM_ID"
          ? "صيغة GTM غير صحيحة (مثال: GTM-XXXXXXX)"
          : "فشل الحفظ";
      showToast(status.textContent, "error");
    }
  });

  $("#sendTestEventBtn")?.addEventListener("click", async () => {
    const status = $("#analyticsStatus");
    status.textContent = "إرسال...";
    try {
      await api("/api/track/event", { method: "POST", body: JSON.stringify({ name: "admin_test" }) });
      status.textContent = "تم إرسال الحدث";
      showToast("تم إرسال حدث الاختبار");
      setTimeout(() => (status.textContent = ""), 1500);
    } catch {
      status.textContent = "فشل إرسال الحدث";
      showToast("فشل إرسال حدث الاختبار", "error");
    }
  });

  // --- Website stats page ---
  async function loadStats() {
    const rangeEl = $("#statsRange");
    if (!rangeEl) return;
    const range = Math.max(1, Number(rangeEl.value || 30));
    const [summary, top, daily, dailyDouble] = await Promise.all([
      api(`/api/track/stats/summary?range=${encodeURIComponent(range)}`),
      api(`/api/track/stats/top?range=${encodeURIComponent(range)}`),
      api(`/api/track/stats/daily?range=${encodeURIComponent(range)}`),
      api(`/api/track/stats/daily?range=${encodeURIComponent(Math.min(365, range * 2))}`),
    ]);

    $("#statTotal").textContent = String(summary.total || 0);
    $("#statUniques").textContent = String(summary.uniques || 0);
    $("#statEssential").textContent = String(summary.totals?.essential || 0);
    $("#statAnalytics").textContent = String(summary.totals?.analytics || 0);

    const topBody = $("#topUrlsBody");
    if (topBody) {
      topBody.innerHTML = (top.top || [])
        .map((r) => `<tr><td dir="ltr">${r.path}</td><td>${r.visits}</td></tr>`)
        .join("") || `<tr><td colspan="2" class="muted">لا توجد بيانات بعد</td></tr>`;
    }

    const trend = $("#dailyTrend");
    if (trend) {
      const series = daily.series || [];
      const max = Math.max(1, ...series.map((x) => x.visits || 0));
      trend.innerHTML = series
        .map((x) => {
          const h = Math.max(6, Math.round(((x.visits || 0) / max) * 100));
          return `<div class="trend__bar" title="${x.day}: ${x.visits}" style="height:${h}%"></div>`;
        })
        .join("");
    }

    const compareEl = $("#statsCompareHint");
    if (compareEl) {
      const ds = dailyDouble.series || [];
      if (ds.length >= range * 2) {
        const prev = ds.slice(0, range).reduce((s, x) => s + Number(x.visits || 0), 0);
        const curr = ds.slice(range).reduce((s, x) => s + Number(x.visits || 0), 0);
        const delta = curr - prev;
        const pct = prev ? ((delta / prev) * 100).toFixed(1) : "—";
        compareEl.textContent = `مقارنة بالفترة السابقة: ${delta >= 0 ? "+" : ""}${delta} زيارة (${pct}%)`;
      } else {
        compareEl.textContent = "مقارنة بالفترة السابقة: بيانات غير كافية";
      }
    }
  }

  $("#refreshStatsBtn")?.addEventListener("click", () => loadStats().catch(console.error));
  $("#statsRange")?.addEventListener("change", () => loadStats().catch(console.error));
  $$('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = btn.getAttribute('data-range');
      const sel = $("#statsRange");
      if (sel && range) sel.value = range;
      loadStats().catch(console.error);
    });
  });

  // --- Custom Pages module ---
  let customPages = [];
  let customPagesPage = 1;
  const customPagesPageSize = 8;
  let customPagesSort = { key: 'updated_at', dir: 'desc' };
  let currentCustomPage = null;
  let currentCustomTab = 'html';

  function filteredCustomPages() {
    const q = String($("#customPagesFilter")?.value || "").trim().toLowerCase();
    let rows = customPages.slice();
    if (q) rows = rows.filter((p) => String(p.title || "").toLowerCase().includes(q) || String(p.slug || "").toLowerCase().includes(q));
    rows.sort((a, b) => {
      const av = String(a[customPagesSort.key] || "");
      const bv = String(b[customPagesSort.key] || "");
      return customPagesSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return rows;
  }

  function renderCustomPagesTable() {
    const body = $("#customPagesTableBody");
    if (!body) return;
    const rows = filteredCustomPages();
    const pagesCount = Math.max(1, Math.ceil(rows.length / customPagesPageSize));
    customPagesPage = Math.min(customPagesPage, pagesCount);
    const start = (customPagesPage - 1) * customPagesPageSize;
    const slice = rows.slice(start, start + customPagesPageSize);

    body.innerHTML = slice
      .map((p) => {
        const status = p.published ? `<span class="pill pill--pub">منشورة</span>` : `<span class="pill pill--draft">مسودة</span>`;
        const updated = (p.updated_at || '').replace('T', ' ').slice(0, 16);
        return `
          <tr data-id="${p.id}" class="customRow">
            <td><input type="checkbox" class="rowCheck" data-id="${p.id}" /></td>
            <td>${p.title}</td>
            <td dir="ltr">${p.slug}</td>
            <td>${status}</td>
            <td dir="ltr">${updated}</td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="5" class="muted">لا توجد صفحات بعد</td></tr>`;

    $("#customPagesPagerText").textContent = `صفحة ${customPagesPage} من ${pagesCount} • ${rows.length} عنصر`;

    $$("tr.customRow", body).forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target && e.target.closest('input')) return;
        const id = Number(tr.getAttribute('data-id'));
        selectCustomPage(id);
      });
    });
  }

  function selectedCustomPageIds() {
    return $$(".rowCheck").filter((c) => c.checked).map((c) => Number(c.getAttribute('data-id'))).filter(Boolean);
  }

  async function loadCustomPages() {
    const body = $("#customPagesTableBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="5" class="muted">جارٍ التحميل...</td></tr>`;
    const { pages } = await api('/api/custom-pages');
    customPages = pages || [];
    renderCustomPagesTable();
  }

  function showCustomPageEditor(page) {
    currentCustomPage = page || null;
    $("#customPageEmptyEditor").hidden = true;
    $("#customPageEditor").hidden = false;
    $("#customPageId").value = String(page?.id || "");
    $("#customPageTitle").value = page?.title || "";
    $("#customPageSlug").value = page?.slug || "";
    $("#customPagePublished").checked = !!page?.published;
    $("#customPageUnsafeJs").checked = !!page?.unsafe_js;
    $("#customPageHtml").value = page?.html_code || "";
    $("#customPageCss").value = page?.css_code || "";
    $("#customPageJs").value = page?.js_code || "";

    const open = $("#openCustomPageBtn");
    if (open) open.href = `/rec/${encodeURIComponent(page?.slug || '')}`;

    renderCustomPageMeta();
    updateCustomSlugHint();
    activateCustomTab('html');
    setDirty('custom-pages', false);
  }

  function clearCustomPageEditor() {
    currentCustomPage = null;
    $("#customPageEditor").hidden = true;
    $("#customPageEmptyEditor").hidden = false;
    setDirty('custom-pages', false);
  }

  function renderCustomPageMeta() {
    const elMeta = $("#customPagePublishMeta");
    if (!elMeta) return;
    if (!currentCustomPage?.id) {
      elMeta.textContent = "";
      return;
    }
    const state = currentCustomPage.published ? 'منشورة' : 'مسودة';
      elMeta.textContent = `الحالة: ${state} • أُنشئت: ${formatDateTime(currentCustomPage.created_at)} • آخر تحديث: ${formatDateTime(
      currentCustomPage.updated_at
    )}`;
  }

  function updateCustomSlugHint() {
    const hint = $("#customPageSlugHint");
    const slug = String($("#customPageSlug")?.value || "").trim();
    if (!hint) return;
    if (!slug) {
      hint.textContent = "";
      return;
    }
    const id = Number($("#customPageId")?.value || 0);
    const conflict = (customPages || []).some((p) => p.slug === slug && Number(p.id) !== id);
    hint.textContent = conflict
      ? `هذا الرابط مستخدم بالفعل: /rec/${slug}`
      : `الرابط النهائي: /rec/${slug}`;
  }

  function renderCustomPreview() {
    const frame = $("#customPagePreview");
    if (!frame) return;
    const html = $("#customPageHtml")?.value || "";
    const css = $("#customPageCss")?.value || "";
    const js = $("#customPageJs")?.value || "";
    const unsafe = !!$("#customPageUnsafeJs")?.checked;
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8" /><style>${css}</style></head><body>${html}${
      unsafe ? `<script>${js}<\/script>` : ''
    }</body></html>`;
  }

  function activateCustomTab(tab) {
    currentCustomTab = tab;
    $$('[data-tab]', $("#customEditorTabs") || document).forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tab);
    });
    const frame = $("#customPagePreview");
    if (frame) frame.hidden = tab !== 'preview';
    if (tab === 'preview') {
      renderCustomPreview();
      return;
    }
    const target = tab === 'html' ? $("#customPageHtml") : tab === 'css' ? $("#customPageCss") : $("#customPageJs");
    target?.focus();
  }

  async function selectCustomPage(id) {
    const { page } = await api(`/api/custom-pages/${id}`);
    showCustomPageEditor(page);
  }

  $("#refreshCustomPagesBtn")?.addEventListener('click', () => loadCustomPages().catch(console.error));
  bindDirtyInputs('#customPageEditor', 'custom-pages');
  $("#customPageTitle")?.addEventListener('input', (e) => {
    const slugInput = $("#customPageSlug");
    if (slugInput && !slugInput.value.trim()) slugInput.value = slugifyArabic(e.target.value);
    updateCustomSlugHint();
  });
  $("#customPageSlug")?.addEventListener('input', () => {
    const slug = slugifyArabic($("#customPageSlug")?.value || '');
    $("#customPageSlug").value = slug;
    const open = $("#openCustomPageBtn");
    if (open) open.href = `/rec/${encodeURIComponent(slug)}`;
    updateCustomSlugHint();
  });
  $("#customPageUnsafeJs")?.addEventListener('change', () => {
    if (currentCustomTab === 'preview') renderCustomPreview();
  });
  ["#customPageHtml", "#customPageCss", "#customPageJs"].forEach((sel) => {
    $(sel)?.addEventListener('input', () => {
      if (currentCustomTab === 'preview') renderCustomPreview();
    });
  });
  $$('[data-tab]', $("#customEditorTabs") || document).forEach((btn) => {
    btn.addEventListener('click', () => activateCustomTab(btn.getAttribute('data-tab') || 'html'));
  });
  $("#customPagesFilter")?.addEventListener('input', () => {
    customPagesPage = 1;
    renderCustomPagesTable();
  });
  $("#customPagesPrev")?.addEventListener('click', () => {
    customPagesPage = Math.max(1, customPagesPage - 1);
    renderCustomPagesTable();
  });
  $("#customPagesNext")?.addEventListener('click', () => {
    const rows = filteredCustomPages();
    const pagesCount = Math.max(1, Math.ceil(rows.length / customPagesPageSize));
    customPagesPage = Math.min(pagesCount, customPagesPage + 1);
    renderCustomPagesTable();
  });
  $("#customPagesSelectAll")?.addEventListener('change', (e) => {
    $$(".rowCheck").forEach((c) => (c.checked = e.target.checked));
  });

  $("#createCustomPageBtn")?.addEventListener('click', async () => {
    const now = Date.now();
    const payload = {
      title: `صفحة جديدة ${now}`,
      slug: `page-${now}`,
      html_code: '<p>محتوى الصفحة</p>',
      css_code: '',
      js_code: '',
      published: 0,
      unsafe_js: 0,
    };
    const res = await api('/api/custom-pages', { method: 'POST', body: JSON.stringify(payload) });
    await loadCustomPages();
    await selectCustomPage(res.id);
    location.hash = '#/custom-pages';
    showToast('تم إنشاء صفحة جديدة');
  });

  $("#customPageEditor")?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $("#customPageStatus");
    status.textContent = 'جارٍ الحفظ...';
    try {
      const id = Number($("#customPageId").value);
      const payload = {
        title: $("#customPageTitle").value.trim(),
        slug: $("#customPageSlug").value.trim(),
        published: $("#customPagePublished").checked,
        unsafe_js: $("#customPageUnsafeJs").checked,
        html_code: $("#customPageHtml").value,
        css_code: $("#customPageCss").value,
        js_code: $("#customPageJs").value,
      };
      await api(`/api/custom-pages/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await loadCustomPages();
      await selectCustomPage(id).catch(() => {});
      status.textContent = 'تم الحفظ';
      setDirty('custom-pages', false);
      showToast('تم حفظ الصفحة المخصصة');
      setTimeout(() => (status.textContent = ''), 1500);
    } catch (e) {
      status.textContent = 'فشل الحفظ (تأكد من slug فريد)';
      showToast(status.textContent, 'error');
    }
  });

  $("#deleteCustomPageBtn")?.addEventListener('click', async () => {
    const id = Number($("#customPageId").value);
    if (!id) return;
    if (!confirm('حذف الصفحة؟')) return;
    await api(`/api/custom-pages/${id}`, { method: 'DELETE' });
    clearCustomPageEditor();
    await loadCustomPages();
    showToast('تم حذف الصفحة');
  });

  async function bulkUpdatePublished(published) {
    const ids = selectedCustomPageIds();
    if (!ids.length) return;
    await Promise.all(
      ids.map((id) =>
        api(`/api/custom-pages/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...customPages.find((p) => p.id === id),
            published,
          }),
        }).catch(() => null)
      )
    );
    await loadCustomPages();
    showToast(published ? 'تم نشر الصفحات المحددة' : 'تم إخفاء الصفحات المحددة');
  }

  $("#bulkPublishBtn")?.addEventListener('click', () => bulkUpdatePublished(true));
  $("#bulkUnpublishBtn")?.addEventListener('click', () => bulkUpdatePublished(false));
  $("#bulkDeleteBtn")?.addEventListener('click', async () => {
    const ids = selectedCustomPageIds();
    if (!ids.length) return;
    if (!confirm(`حذف ${ids.length} صفحات؟`)) return;
    await Promise.all(ids.map((id) => api(`/api/custom-pages/${id}`, { method: 'DELETE' }).catch(() => null)));
    clearCustomPageEditor();
    await loadCustomPages();
    showToast('تم حذف الصفحات المحددة');
  });

  // --- Products module ---
  let products = [];
  let productsPage = 1;
  const productsPageSize = 8;
  let currentProduct = null;
  let currentCategoryName = null;

  function filteredProducts() {
    const q = String($("#productsFilter")?.value || "").trim().toLowerCase();
    let rows = products.slice().sort((a, b) => {
      const ao = Number(a.sort_order || 0);
      const bo = Number(b.sort_order || 0);
      if (ao !== bo) return ao - bo;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    if (!q) return rows;
    return rows.filter((p) => {
      const hay = [p.title, p.slug, p.category].map((x) => String(x || "").toLowerCase()).join(" | ");
      return hay.includes(q);
    });
  }

  function renderProductsTable() {
    const body = $("#productsTableBody");
    const pager = $("#productsPagerText");
    if (!body) return;

    const rows = filteredProducts();
    const pagesCount = Math.max(1, Math.ceil(rows.length / productsPageSize));
    productsPage = Math.min(productsPage, pagesCount);
    const start = (productsPage - 1) * productsPageSize;
    const slice = rows.slice(start, start + productsPageSize);

    body.innerHTML =
      slice
        .map((p) => {
          const status = p.published ? `<span class="pill pill--pub">منشور</span>` : `<span class="pill pill--draft">مسودة</span>`;
          return `<tr class="productRow" data-id="${p.id}"><td>${Number(p.sort_order || 0)}</td><td>${p.title}</td><td>${p.category || "—"}</td><td dir="ltr">${p.slug}</td><td>${status}</td></tr>`;
        })
        .join("") || `<tr><td colspan="5" class="muted">لا توجد منتجات</td></tr>`;

    if (pager) pager.textContent = `صفحة ${productsPage} من ${pagesCount} • ${rows.length} عنصر`;

    $$(".productRow", body).forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = Number(tr.getAttribute("data-id"));
        const row = products.find((x) => Number(x.id) === id);
        if (!row) return;
        showProductEditor(row);
      });
    });
  }

  function clearProductEditor() {
    currentProduct = null;
    $("#productEditor").hidden = true;
    $("#productEmptyEditor").hidden = false;
    setDirty("products", false);
  }

  function showProductEditor(p) {
    currentProduct = p || null;
    $("#productEmptyEditor").hidden = true;
    $("#productEditor").hidden = false;

    $("#productId").value = String(p?.id || "");
    $("#productTitle").value = p?.title || "";
    $("#productSlug").value = p?.slug || "";
    $("#productCategory").value = p?.category || "";
    $("#productSortOrder").value = String(Number(p?.sort_order || 0));
    $("#productDescription").value = p?.description || "";
    $("#productImage").value = p?.image || "";
    $("#productBrochure").value = p?.brochure_url || "";
    $("#productPublished").checked = !!p?.published;
    $("#productStatus").textContent = "";
    setDirty("products", false);
  }

  function getCategoriesSummary() {
    const map = new Map();
    (products || []).forEach((p) => {
      const name = String(p.category || "").trim();
      if (!name) return;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }

  function renderCategoriesTable() {
    const body = $("#categoriesTableBody");
    if (!body) return;
    const q = String($("#categoriesFilter")?.value || "").trim().toLowerCase();
    const rows = getCategoriesSummary().filter((row) => !q || row.name.toLowerCase().includes(q));
    body.innerHTML = rows.length
      ? rows
          .map(
            (row) => `
              <tr class="categoryRow" data-name="${encodeURIComponent(row.name)}">
                <td>${row.name}</td>
                <td>${row.count}</td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="2" class="muted">لا توجد تصنيفات بعد</td></tr>`;

    $$(".categoryRow", body).forEach((tr) => {
      tr.addEventListener("click", () => {
        const encoded = tr.getAttribute("data-name") || "";
        showCategoryEditor(decodeURIComponent(encoded));
      });
    });
  }

  function showCategoryEditor(name = "") {
    currentCategoryName = String(name || "").trim();
    const form = $("#categoryEditor");
    const empty = $("#categoryEmptyEditor");
    if (form) form.hidden = false;
    if (empty) empty.hidden = true;
    if ($("#categoryOriginalName")) $("#categoryOriginalName").value = currentCategoryName;
    if ($("#categoryName")) $("#categoryName").value = currentCategoryName;

    const count = (products || []).filter((p) => String(p.category || "").trim() === currentCategoryName).length;
    const summary = $("#categoryProductsSummary");
    if (summary) {
      summary.textContent = currentCategoryName
        ? `عدد المنتجات المرتبطة بهذا التصنيف: ${count}`
        : "تصنيف جديد غير مرتبط بأي منتج بعد.";
    }
    if ($("#categoryStatus")) $("#categoryStatus").textContent = "";
  }

  function clearCategoryEditor() {
    currentCategoryName = null;
    if ($("#categoryEditor")) $("#categoryEditor").hidden = true;
    if ($("#categoryEmptyEditor")) $("#categoryEmptyEditor").hidden = false;
    if ($("#categoryOriginalName")) $("#categoryOriginalName").value = "";
    if ($("#categoryName")) $("#categoryName").value = "";
  }

  async function saveCategory(e) {
    e?.preventDefault?.();
    const status = $("#categoryStatus");
    const oldName = String($("#categoryOriginalName")?.value || "").trim();
    const newName = String($("#categoryName")?.value || "").trim();
    if (!newName) {
      if (status) status.textContent = "اسم التصنيف مطلوب";
      return;
    }
    if (status) status.textContent = "جارٍ الحفظ...";

    if (!oldName) {
      showCategoryEditor(newName);
      renderCategoriesTable();
      if (status) status.textContent = "تم إنشاء التصنيف، ويمكنك الآن ربط المنتجات به";
      showToast("تم إنشاء التصنيف");
      return;
    }

    const rows = (products || []).filter((p) => String(p.category || "").trim() === oldName);
    try {
      await Promise.all(
        rows.map((p) =>
          api(`/api/products/${p.id}`, {
            method: "PUT",
            body: JSON.stringify({
              title: p.title,
              slug: p.slug,
              category: newName,
              description: p.description,
              image: p.image,
              brochure_url: p.brochure_url,
              published: !!p.published,
              sort_order: Number(p.sort_order || 0),
            }),
          })
        )
      );
      await loadProducts();
      showCategoryEditor(newName);
      if (status) status.textContent = "تم حفظ التصنيف";
      showToast("تم تحديث التصنيف");
    } catch {
      if (status) status.textContent = "فشل حفظ التصنيف";
      showToast("فشل حفظ التصنيف", "error");
    }
  }

  async function deleteCategory() {
    const name = String($("#categoryOriginalName")?.value || "").trim();
    const status = $("#categoryStatus");
    if (!name) {
      clearCategoryEditor();
      renderCategoriesTable();
      return;
    }
    if (!confirm(`حذف التصنيف "${name}" من جميع المنتجات؟`)) return;
    const rows = (products || []).filter((p) => String(p.category || "").trim() === name);
    if (status) status.textContent = "جارٍ الحذف...";
    try {
      await Promise.all(
        rows.map((p) =>
          api(`/api/products/${p.id}`, {
            method: "PUT",
            body: JSON.stringify({
              title: p.title,
              slug: p.slug,
              category: "",
              description: p.description,
              image: p.image,
              brochure_url: p.brochure_url,
              published: !!p.published,
              sort_order: Number(p.sort_order || 0),
            }),
          })
        )
      );
      await loadProducts();
      clearCategoryEditor();
      renderCategoriesTable();
      showToast("تم حذف التصنيف");
    } catch {
      if (status) status.textContent = "فشل حذف التصنيف";
      showToast("فشل حذف التصنيف", "error");
    }
  }

  async function loadProducts() {
    const body = $("#productsTableBody");
    if (body) body.innerHTML = `<tr><td colspan="5" class="muted">جارٍ التحميل...</td></tr>`;
    try {
      const res = await api("/api/products");
      products = Array.isArray(res?.products) ? res.products : [];
      renderProductsTable();
      renderCategoriesTable();
      if (currentProduct?.id) {
        const fresh = products.find((x) => Number(x.id) === Number(currentProduct.id));
        if (fresh) showProductEditor(fresh);
      }
      if (currentCategoryName) showCategoryEditor(currentCategoryName);
    } catch {
      if (body) body.innerHTML = `<tr><td colspan="5" class="muted">فشل تحميل المنتجات</td></tr>`;
    }
  }

  $("#refreshProductsBtn")?.addEventListener("click", () => loadProducts());
  $("#productsFilter")?.addEventListener("input", () => {
    productsPage = 1;
    renderProductsTable();
  });
  $("#productsPrev")?.addEventListener("click", () => {
    productsPage = Math.max(1, productsPage - 1);
    renderProductsTable();
  });
  $("#productsNext")?.addEventListener("click", () => {
    const pagesCount = Math.max(1, Math.ceil(filteredProducts().length / productsPageSize));
    productsPage = Math.min(pagesCount, productsPage + 1);
    renderProductsTable();
  });

  $("#createProductBtn")?.addEventListener("click", async () => {
    const now = Date.now();
    try {
      const created = await api("/api/products", {
        method: "POST",
        body: JSON.stringify({
          title: `منتج جديد ${now}`,
          slug: `product-${now}`,
          category: "",
          description: "",
          image: "",
          brochure_url: "",
          published: true,
          sort_order: products.length,
        }),
      });
      await loadProducts();
      const row = products.find((x) => Number(x.id) === Number(created.id));
      if (row) showProductEditor(row);
      showToast("تم إنشاء منتج جديد");
    } catch {
      showToast("فشل إنشاء المنتج", "error");
    }
  });

  $("#productTitle")?.addEventListener("input", (e) => {
    const slugInput = $("#productSlug");
    if (!slugInput.value.trim()) slugInput.value = slugifyArabic(e.target.value);
  });

  $("#productImageUploadBtn")?.addEventListener("click", async () => {
    const status = $("#productImageUploadStatus");
    const fileInput = $("#productImageFile");
    const file = fileInput?.files?.[0];
    if (!file) {
      if (status) status.textContent = "اختر صورة أولاً";
      return;
    }

    if (status) status.textContent = "جارٍ رفع الصورة...";
    try {
      const url = await uploadImage(file);
      const imageInput = $("#productImage");
      if (imageInput) imageInput.value = url;
      if (fileInput) fileInput.value = "";
      if (status) status.textContent = "تم رفع الصورة";
      setDirty("products", true);
      showToast("تم رفع صورة المنتج");
      setTimeout(() => {
        if (status) status.textContent = "";
      }, 1800);
    } catch {
      if (status) status.textContent = "فشل رفع الصورة";
      showToast("فشل رفع صورة المنتج", "error");
    }
  });

  $("#productsCsvImportBtn")?.addEventListener("click", async () => {
    const status = $("#productsCsvStatus");
    const fileInput = $("#productsCsvFile");
    const file = fileInput?.files?.[0];
    if (!file) {
      if (status) status.textContent = "اختر ملف CSV أولاً";
      return;
    }

    if (status) status.textContent = "جارٍ استيراد CSV...";
    try {
      const result = await importProductsCsv(file);
      if (fileInput) fileInput.value = "";
      await loadProducts();
      setDirty("products", false);
      const msg = `تم الاستيراد: ${result.created || 0} جديد، ${result.updated || 0} تحديث، ${result.skipped || 0} تخطي`;
      if (status) status.textContent = msg;
      showToast(msg);
    } catch (err) {
      const code = err?.json?.error || err?.message || "IMPORT_FAILED";
      const msg =
        code === "MISSING_TITLE_COLUMN"
          ? "فشل الاستيراد: عمود title مطلوب"
          : code === "EMPTY_CSV"
          ? "فشل الاستيراد: الملف فارغ"
          : "فشل استيراد CSV";
      if (status) status.textContent = msg;
      showToast(msg, "error");
    }
  });

  $("#productEditor")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number($("#productId").value || 0);
    const status = $("#productStatus");
    status.textContent = "جارٍ الحفظ...";

    const payload = {
      title: $("#productTitle").value.trim(),
      slug: slugifyArabic($("#productSlug").value.trim()),
      category: $("#productCategory").value.trim(),
      sort_order: Number($("#productSortOrder").value || 0),
      description: $("#productDescription").value.trim(),
      image: $("#productImage").value.trim(),
      brochure_url: $("#productBrochure").value.trim(),
      published: $("#productPublished").checked,
    };

    if (!payload.title || !payload.slug) {
      status.textContent = "العنوان و slug مطلوبان";
      return;
    }

    try {
      await api(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await loadProducts();
      const row = products.find((x) => Number(x.id) === id);
      if (row) showProductEditor(row);
      status.textContent = "تم الحفظ";
      setDirty("products", false);
      showToast("تم حفظ المنتج");
      setTimeout(() => (status.textContent = ""), 1500);
    } catch (err) {
      status.textContent = err?.status === 409 ? "Slug مستخدم بالفعل" : "فشل الحفظ";
      showToast(status.textContent, "error");
    }
  });

  $("#deleteProductBtn")?.addEventListener("click", async () => {
    const id = Number($("#productId").value || 0);
    if (!id) return;
    if (!confirm("حذف المنتج؟")) return;
    try {
      await api(`/api/products/${id}`, { method: "DELETE" });
      clearProductEditor();
      await loadProducts();
      showToast("تم حذف المنتج");
    } catch {
      showToast("فشل حذف المنتج", "error");
    }
  });

  $("#refreshCategoriesBtn")?.addEventListener("click", () => loadProducts());
  $("#categoriesFilter")?.addEventListener("input", renderCategoriesTable);
  $("#createCategoryBtn")?.addEventListener("click", () => showCategoryEditor(""));
  $("#categoryEditor")?.addEventListener("submit", saveCategory);
  $("#deleteCategoryBtn")?.addEventListener("click", () => deleteCategory());

  // --- General settings module ---
  function activateSettingsTab(tab) {
    $$(".settingsTab").forEach((btn) => btn.classList.toggle("is-active", btn.getAttribute("data-settings-tab") === tab));
    $$("[data-settings-pane]").forEach((pane) => {
      pane.hidden = pane.getAttribute("data-settings-pane") !== tab;
    });
  }

  $$(".settingsTab").forEach((btn) => {
    btn.addEventListener("click", () => activateSettingsTab(btn.getAttribute("data-settings-tab") || "general"));
  });

  async function loadGeneralSettingsForm() {
    const status = $("#settingsStatus");
    if (!$("#settingsForm")) return;
    status.textContent = "جارٍ التحميل...";
    try {
      const res = await api("/api/settings/general");
      const s = res?.settings || {};
      $("#settingsCompanyName").value = s.companyName || "ATEX";
      $("#settingsAdminEmail").value = s.adminEmail || "";
      $("#settingsWhatsapp").value = s.whatsapp || "";
      $("#settingsMaintenanceMode").checked = !!s.maintenanceMode;
      $("#settingsHomepageTitle").value = s.homepageTitle || "";
      $("#settingsHomepageDescription").value = s.homepageDescription || "";
      status.textContent = "";
      setDirty("settings", false);
    } catch {
      status.textContent = "فشل تحميل الإعدادات";
    }
  }

  $("#settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#settingsStatus");
    status.textContent = "جارٍ الحفظ...";
    const payload = {
      companyName: $("#settingsCompanyName").value.trim(),
      adminEmail: $("#settingsAdminEmail").value.trim(),
      whatsapp: $("#settingsWhatsapp").value.trim(),
      maintenanceMode: $("#settingsMaintenanceMode").checked,
      homepageTitle: $("#settingsHomepageTitle").value.trim(),
      homepageDescription: $("#settingsHomepageDescription").value.trim(),
    };
    try {
      await api("/api/settings/general", { method: "PUT", body: JSON.stringify(payload) });
      status.textContent = "تم حفظ الإعدادات";
      setDirty("settings", false);
      showToast("تم حفظ الإعدادات العامة");
      setTimeout(() => (status.textContent = ""), 1500);
    } catch {
      status.textContent = "فشل حفظ الإعدادات";
      showToast(status.textContent, "error");
    }
  });

  // --- Global search ---
  async function runSearch(q) {
    const box = $("#searchResults");
    if (!box) return;
    const query = String(q || '').trim();
    if (!query) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const ql = query.toLowerCase();
    // Search in-memory custom pages + posts list (loaded by loadPosts)
    const items = [];
    (customPages || []).forEach((p) => {
      if (String(p.title || '').toLowerCase().includes(ql) || String(p.slug || '').toLowerCase().includes(ql)) {
        items.push({ label: `صفحة مخصصة: ${p.title}`, route: '#/custom-pages', action: () => selectCustomPage(p.id) });
      }
    });
    (products || []).forEach((p) => {
      if (
        String(p.title || "").toLowerCase().includes(ql) ||
        String(p.slug || "").toLowerCase().includes(ql) ||
        String(p.category || "").toLowerCase().includes(ql)
      ) {
        items.push({ label: `منتج: ${p.title}`, route: "#/products", action: () => showProductEditor(p) });
      }
    });
    const postsEls = $$(".postItem");
    postsEls.forEach((el) => {
      const title = $(".postItem__title", el)?.textContent || '';
      if (title.toLowerCase().includes(ql)) {
        items.push({ label: `مقال: ${title}`, route: '#/blog', action: () => el.click() });
      }
    });

    box.innerHTML = items
      .slice(0, 10)
      .map((it, idx) => `<div class="search__item" data-idx="${idx}">${it.label}</div>`)
      .join('') || `<div class="search__item muted">لا توجد نتائج</div>`;
    box.hidden = false;

    $$(".search__item", box).forEach((row) => {
      row.addEventListener('click', async () => {
        const idx = Number(row.getAttribute('data-idx'));
        const it = items[idx];
        if (!it) return;
        location.hash = it.route;
        setTimeout(() => it.action && it.action(), 50);
        box.hidden = true;
      });
    });
  }

  let searchT;
  $("#globalSearch")?.addEventListener('input', (e) => {
    clearTimeout(searchT);
    searchT = setTimeout(() => runSearch(e.target.value), 120);
  });
  document.addEventListener('click', (e) => {
    const box = $("#searchResults");
    const input = $("#globalSearch");
    if (!box || !input) return;
    const inside = box.contains(e.target) || input.contains(e.target);
    if (!inside) box.hidden = true;
  });

  // Load module data
  loadAnalyticsForm().catch(() => {});
  loadCustomPages().catch(() => {});
  loadStats().catch(() => {});
  loadProducts().catch(() => {});
  loadGeneralSettingsForm().catch(() => {});
})();
