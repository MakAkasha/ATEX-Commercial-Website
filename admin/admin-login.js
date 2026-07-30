/**
 * Login-page script for /admin-login.
 *
 * This file is deliberately tiny and self-contained: it is the ONLY script under
 * /admin that is reachable without an admin session, so it must not leak the
 * admin API surface. It talks to exactly one endpoint (/api/auth/login) and
 * knows nothing about the admin panel's routes, payloads, or field names.
 *
 * Moved verbatim out of admin/admin.js (the `if (loginForm)` branch) so that
 * admin/admin.js — 100 KB describing the whole admin surface — can stay behind
 * the session gate in server/app.js.
 */
(function () {
  const loginForm = document.querySelector("#loginForm");
  if (!loginForm) return;

  const errorBox = document.querySelector("#errorBox");
  const passwordInput = document.querySelector("#password");
  const togglePassword = document.querySelector("#togglePassword");
  const submitBtn = loginForm.querySelector('button[type="submit"]');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("change", () => {
      passwordInput.type = togglePassword.checked ? "text" : "password";
    });
  }

  async function login(payload) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = new Error("LOGIN_FAILED");
      err.status = res.status;
      throw err;
    }
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
      await login(payload);
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
})();
