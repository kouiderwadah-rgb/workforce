/* New Space shared front-end core. Plain script, exposes window.NS. */
(function () {
  "use strict";

  const SB_URL = "https://ehhtcklnbwxjdlvjylqr.supabase.co";
  const SB_KEY = "sb_publishable_5hnwRyn13Q-2BOrllpDv0w_oQbgIXxU";

  if (!window.supabase) {
    document.documentElement.dataset.bootError = "supabase_missing";
  }

  const sb = window.supabase
    ? window.supabase.createClient(SB_URL, SB_KEY)
    : null;

  const APPROVED = ["approved", "active"];
  const ADMIN_ROLES = ["admin", "owner"];

  const COMMON = {
    ar: {
      brand: "New Space",
      staffPortal: "بوابة الموظف",
      adminPortal: "لوحة الإدارة",
      ownerPortal: "لوحة المالك",
      signOut: "خروج",
      lang: "English",
      themeDark: "داكن",
      themeLight: "فاتح",
      loading: "جارٍ التحميل…",
      error: "حدث خطأ",
      retry: "إعادة المحاولة",
      empty: "لا توجد بيانات",
      save: "حفظ",
      cancel: "إلغاء",
      close: "إغلاق",
      confirm: "تأكيد",
      delete: "حذف",
      edit: "تعديل",
      approve: "موافقة",
      reject: "رفض",
      search: "بحث",
      all: "الكل",
      exportCsv: "تصدير CSV",
      saved: "تم الحفظ.",
      deleted: "تم الحذف.",
      copy: "نسخ",
      yes: "نعم",
      no: "لا",
      role: "الدور",
      status: "الحالة",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "الجوال",
      date: "التاريخ",
      amount: "المبلغ",
      position: "الوظيفة",
      fillAll: "أكمل جميع الحقول المطلوبة.",
      dt: {
        passport: "جواز السفر",
        residence: "الإقامة (QID)",
        photo: "صورة شخصية",
        contract: "عقد العمل",
        other: "أخرى",
      },
      rl: { staff: "موظف", admin: "مدير", owner: "مالك" },
      st: {
        pending: "بانتظار الموافقة",
        approved: "معتمد",
        active: "معتمد",
        rejected: "مرفوض",
        suspended: "موقوف",
        new: "جديد",
        contacted: "تم التواصل",
        closed: "مغلق",
        paid: "مدفوع",
        draft: "مسودة",
        published: "منشور",
        cancelled: "ملغي",
        pending_review: "بانتظار المراجعة",
        verified: "تم التأكيد",
      },
    },
    en: {
      brand: "New Space",
      staffPortal: "Staff",
      adminPortal: "Admin",
      ownerPortal: "Owner",
      signOut: "Sign out",
      lang: "العربية",
      themeDark: "Dark",
      themeLight: "Light",
      loading: "Loading…",
      error: "Something went wrong",
      retry: "Retry",
      empty: "Nothing here yet",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      confirm: "Confirm",
      delete: "Delete",
      edit: "Edit",
      approve: "Approve",
      reject: "Reject",
      search: "Search",
      all: "All",
      exportCsv: "Export CSV",
      saved: "Saved.",
      deleted: "Deleted.",
      copy: "Copy",
      yes: "Yes",
      no: "No",
      role: "Role",
      status: "Status",
      name: "Name",
      email: "Email",
      phone: "Mobile",
      date: "Date",
      amount: "Amount",
      position: "Position",
      fillAll: "Fill in all required fields.",
      dt: {
        passport: "Passport",
        residence: "Residence permit (QID)",
        photo: "Personal photo",
        contract: "Employment contract",
        other: "Other",
      },
      rl: { staff: "Staff", admin: "Admin", owner: "Owner" },
      st: {
        pending: "Pending",
        approved: "Approved",
        active: "Approved",
        rejected: "Rejected",
        suspended: "Suspended",
        new: "New",
        contacted: "Contacted",
        closed: "Closed",
        paid: "Paid",
        draft: "Draft",
        published: "Published",
        cancelled: "Cancelled",
        pending_review: "Pending review",
        verified: "Verified",
      },
    },
  };

  let L = localStorage.getItem("lang") || "ar";
  if (L !== "ar" && L !== "en") L = "ar";
  const langHooks = [];
  const pageDict = { ar: {}, en: {} };

  function t(key) {
    const d = pageDict[L] || {};
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    const c = COMMON[L] || {};
    return Object.prototype.hasOwnProperty.call(c, key) ? c[key] : key;
  }

  function statusLabel(key) {
    return (COMMON[L].st && COMMON[L].st[key]) || key || "";
  }

  function roleLabel(key) {
    return (COMMON[L].rl && COMMON[L].rl[key]) || key || "";
  }

  function applyLang() {
    document.documentElement.lang = L;
    document.documentElement.dir = L === "ar" ? "rtl" : "ltr";
    localStorage.setItem("lang", L);
  }

  function setLang(next) {
    L = next === "ar" ? "ar" : "en";
    applyLang();
    langHooks.forEach((fn) => {
      try {
        fn(L);
      } catch (_) {
        /* ignore */
      }
    });
  }

  function onLang(fn) {
    langHooks.push(fn);
  }

  function extendDict(dict) {
    ["ar", "en"].forEach((l) => {
      Object.assign(pageDict[l], (dict && dict[l]) || {});
    });
  }

  /* Theme ----------------------------------------------------------------- */
  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.dataset.theme = saved;
    }
  }

  function toggleTheme() {
    const current =
      document.documentElement.dataset.theme ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    return next;
  }

  function isDark() {
    return (
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  }

  /* DOM helpers ----------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => {
      switch (c) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return c;
      }
    });
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (first + last).toUpperCase();
  }

  function avatarHtml(name, url, cls) {
    const size = cls ? " " + cls : "";
    if (url) {
      return (
        '<span class="avatar' + size + '"><img src="' + esc(url) +
        '" alt="' + esc(name || "") + '" loading="lazy"></span>'
      );
    }
    return '<span class="avatar' + size + '" aria-hidden="true">' + esc(initials(name)) + "</span>";
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait || 250);
    };
  }

  /* Formatting ------------------------------------------------------------ */
  function fmtDate(value) {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleDateString(L === "ar" ? "ar-QA" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch (_) {
      return d.toISOString().slice(0, 10);
    }
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleString(L === "ar" ? "ar-QA" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return d.toISOString();
    }
  }

  function fmtMoney(value, currency) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat(L === "ar" ? "ar-QA" : "en-QA", {
        style: "currency",
        currency: currency || "QAR",
        maximumFractionDigits: 2,
      }).format(safe);
    } catch (_) {
      return safe.toFixed(2) + " " + (currency || "QAR");
    }
  }

  function fmtNum(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat(L === "ar" ? "ar-QA" : "en-GB").format(safe);
    } catch (_) {
      return String(safe);
    }
  }

  function today() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  }

  /* Toast ----------------------------------------------------------------- */
  function toastStack() {
    let stack = $(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type) {
    if (!message) return;
    const stack = toastStack();
    const node = document.createElement("div");
    node.className = "toast" + (type ? " " + type : "");
    node.textContent = String(message);
    stack.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transition = "opacity .2s";
      setTimeout(() => node.remove(), 220);
    }, type === "error" ? 6000 : 3600);
  }

  /* Modal ----------------------------------------------------------------- */
  function openModal(html, opts) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.id = "nsModal";
    overlay.innerHTML =
      '<div class="modal-box' + (opts && opts.wide ? " wide" : "") +
      '" role="dialog" aria-modal="true">' + html + "</div>";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", escClose);
    document.body.appendChild(overlay);
    const first = overlay.querySelector("input, select, textarea, button");
    if (first) first.focus();
    return overlay;
  }

  function escClose(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    const old = $("#nsModal");
    if (old) old.remove();
    document.removeEventListener("keydown", escClose);
  }

  /* Supabase helpers ------------------------------------------------------ */
  async function context() {
    if (!sb) return { session: null, profile: null, error: "no_client" };
    const res = await sb.auth.getSession();
    const session = res && res.data ? res.data.session : null;
    if (!session) return { session: null, profile: null };
    const pr = await sb.from("profiles").select("*").eq("id", session.user.id).single();
    return {
      session,
      profile: pr.data || null,
      error: pr.error ? pr.error.message : null,
    };
  }

  async function guard(roles) {
    const ctx = await context();
    if (!ctx.session) {
      location.replace("app.html");
      return null;
    }
    if (!ctx.profile) {
      location.replace("app.html");
      return null;
    }
    if (!APPROVED.includes(ctx.profile.status)) {
      location.replace("app.html");
      return null;
    }
    if (roles && roles.length && !roles.includes(ctx.profile.role)) {
      location.replace("app.html");
      return null;
    }
    return ctx;
  }

  async function signOut() {
    try {
      await sb.auth.signOut();
    } catch (_) {
      /* ignore */
    }
    location.replace("app.html");
  }

  /* Header ---------------------------------------------------------------- */
  function homeFor(profile) {
    if (!profile) return "app.html";
    if (profile.role === "owner") return "owner.html";
    if (profile.role === "admin") return "admin.html";
    return "staff.html";
  }

  function mountHeader(profile) {
    const head = $("#head") || $(".site-head");
    if (!head) return;
    const role = profile ? profile.role : null;
    const isAdmin = ADMIN_ROLES.includes(role);
    const isOwner = role === "owner";
    const current = location.pathname.split("/").pop();

    const links = [];
    if (profile) {
      links.push(["staff.html", t("staffPortal"), true]);
      if (isAdmin) links.push(["admin.html", t("adminPortal"), true]);
      if (isOwner) links.push(["owner.html", t("ownerPortal"), true]);
    }

    head.innerHTML =
      '<a class="brand" href="' + homeFor(profile) + '">New Space</a>' +
      '<nav class="head-nav" aria-label="Portals">' +
      links
        .map(
          ([href, label]) =>
            '<a href="' + href + '"' +
            (current === href ? ' aria-current="page"' : "") +
            ">" + esc(label) + "</a>"
        )
        .join("") +
      "</nav>" +
      (profile
        ? '<span class="who">' + esc(profile.full_name || "") + " · " +
          esc(roleLabel(role)) + "</span>"
        : "") +
      '<button class="head-btn" id="nsLang" type="button">' + esc(t("lang")) + "</button>" +
      '<button class="head-btn" id="nsTheme" type="button">' +
      esc(isDark() ? t("themeLight") : t("themeDark")) + "</button>" +
      (profile ? '<button class="head-btn" id="nsOut" type="button">' + esc(t("signOut")) + "</button>" : "");

    const langBtn = $("#nsLang");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        setLang(L === "ar" ? "en" : "ar");
        mountHeader(profile);
      });
    }
    const themeBtn = $("#nsTheme");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        toggleTheme();
        themeBtn.textContent = isDark() ? t("themeLight") : t("themeDark");
      });
    }
    const out = $("#nsOut");
    if (out) out.addEventListener("click", signOut);
  }

  /* Files ----------------------------------------------------------------- */
  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

  function checkFile(file) {
    if (!file) return "no_file";
    if (file.size > MAX_BYTES) return "too_large";
    if (!ALLOWED_MIME.includes(file.type)) return "bad_type";
    return null;
  }

  async function compressImage(file, maxDim, quality) {
    if (!file || !file.type.startsWith("image/")) return file;
    const limit = maxDim || 1600;
    const q = quality || 0.82;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
      if (scale >= 1 && file.size < 900 * 1024) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", q)
      );
      if (!blob) return file;
      return new File([blob], (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    } catch (_) {
      return file;
    }
  }

  async function upload(bucket, path, file) {
    return sb.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  }

  async function signedUrl(bucket, path, seconds) {
    if (!path) return null;
    const res = await sb.storage.from(bucket).createSignedUrl(path, seconds || 60);
    if (res.error) return null;
    return res.data ? res.data.signedUrl : null;
  }

  const avatarCache = new Map();

  function latestPhotoPath(profileId, docs) {
    let best = null;
    (docs || []).forEach((d) => {
      if (d.profile_id !== profileId || d.doc_type !== "photo" || !d.file_path) return;
      if (!best || String(d.created_at || "") > String(best.created_at || "")) best = d;
    });
    return best ? best.file_path : null;
  }

  async function avatarUrls(list, docs) {
    const people = (Array.isArray(list) ? list : [list]).filter((p) => p && p.id);
    const result = {};
    if (!people.length) return result;

    const now = Date.now();
    const pending = [];
    const missing = [];
    people.forEach((p) => {
      const hit = avatarCache.get(p.id);
      if (hit && hit.expires > now + 60000) {
        result[p.id] = hit.url;
        return;
      }
      pending.push(p);
      if (!p.avatar_path) missing.push(p.id);
    });
    if (!pending.length) return result;

    let docList = Array.isArray(docs) ? docs : null;
    if (!docList && missing.length) {
      const res = await sb
        .from("staff_documents")
        .select("profile_id,file_path,created_at,doc_type")
        .in("profile_id", missing)
        .eq("doc_type", "photo");
      docList = res.error ? [] : res.data || [];
    }

    const paths = [];
    const byId = {};
    pending.forEach((p) => {
      const path = p.avatar_path || latestPhotoPath(p.id, docList);
      byId[p.id] = path || null;
      if (path && paths.indexOf(path) === -1) paths.push(path);
    });

    const signed = {};
    if (paths.length) {
      const res = await sb.storage.from("documents").createSignedUrls(paths, 3600);
      if (!res.error && Array.isArray(res.data)) {
        res.data.forEach((item) => {
          if (item && item.path && item.signedUrl) signed[item.path] = item.signedUrl;
        });
      }
    }

    const expires = now + 3600 * 1000;
    pending.forEach((p) => {
      const path = byId[p.id];
      const url = path ? signed[path] || null : null;
      avatarCache.set(p.id, { url, expires: url ? expires : now + 120000 });
      result[p.id] = url;
    });
    return result;
  }

  function forgetAvatar(id) {
    if (id) avatarCache.delete(id);
  }

  function uuid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {
      /* ignore */
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function extOf(name) {
    const m = String(name || "").match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : "bin";
  }

  /* CSV ------------------------------------------------------------------- */
  function csvCell(value) {
    const s = value == null ? "" : String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, rows) {
    const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* Misc ------------------------------------------------------------------ */
  function safeText(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max || 2000);
  }

  function signedInHome() {
    return "app.html";
  }

  initTheme();
  applyLang();

  window.NS = {
    sb,
    SB_URL,
    SB_KEY,
    APPROVED,
    ADMIN_ROLES,
    get lang() {
      return L;
    },
    t,
    statusLabel,
    roleLabel,
    setLang,
    onLang,
    extendDict,
    initTheme,
    toggleTheme,
    isDark,
    $,
    $$,
    esc,
    initials,
    avatarHtml,
    debounce,
    fmtDate,
    fmtDateTime,
    fmtMoney,
    fmtNum,
    today,
    daysAgo,
    toast,
    openModal,
    closeModal,
    context,
    guard,
    signOut,
    homeFor,
    mountHeader,
    checkFile,
    compressImage,
    upload,
    signedUrl,
    avatarUrls,
    forgetAvatar,
    uuid,
    extOf,
    downloadCsv,
    safeText,
    MAX_BYTES,
    ALLOWED_MIME,
    signedInHome,
  };
})();
