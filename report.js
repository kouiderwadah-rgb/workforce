const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function rateLimited(id) {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(id, list);
    return true;
  }
  list.push(now);
  hits.set(id, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function env() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key };
}

async function rest(url, key, path, init = {}) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: r.ok, status: r.status, body };
}

async function userFromToken(url, key, token) {
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const day = (d) => d.toISOString().slice(0, 10);
const sum = (rows, field) => rows.reduce((s, r) => s + num(r[field]), 0);

function addDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthKeys(start, end) {
  const out = [];
  const d = new Date(start + "T00:00:00Z");
  const stop = new Date(end + "T00:00:00Z");
  d.setUTCDate(1);
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function previousRange(start, end) {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const days = Math.round((e - s) / 86400000) + 1;
  const prevEnd = new Date(s.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10) };
}

function delta(current, previous) {
  return {
    previous: round2(previous),
    absolute: round2(current - previous),
    percent: previous ? round2(((current - previous) / previous) * 100) : null,
  };
}

function parsePeriod(body) {
  const today = new Date();
  const end = body?.end ? new Date(body.end) : today;
  const start = body?.start ? new Date(body.start) : new Date(end.getTime() - 29 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "invalid_period" };
  }
  if (start > end) return { error: "invalid_period" };
  if (end.getTime() - start.getTime() > 366 * 86400000) return { error: "period_too_long" };
  return { start: day(start), end: day(end) };
}

async function computeMetrics(url, key, start, end) {
  const prev = previousRange(start, end);
  const today = day(new Date());
  const plus30 = addDays(today, 30);
  const common = `deleted_at=is.null&issue_date=gte.${start}&issue_date=lte.${end}`;
  const expFilter = `deleted_at=is.null&expense_date=gte.${start}&expense_date=lte.${end}`;
  const prevInvFilter = `deleted_at=is.null&issue_date=gte.${prev.start}&issue_date=lte.${prev.end}`;
  const prevExpFilter = `deleted_at=is.null&expense_date=gte.${prev.start}&expense_date=lte.${prev.end}`;

  const [inv, exp, staff, pendingStaff, leads, pendingDocs, allInv, expDocs, prevInv, prevExp] =
    await Promise.all([
      rest(url, key, `invoices?select=total,tax_amount,status,currency,issue_date&${common}`),
      rest(url, key, `expenses?select=amount,status,currency,category,expense_date,project_id&${expFilter}`),
      rest(url, key, `profiles?select=id&role=eq.staff&status=eq.approved`),
      rest(url, key, `profiles?select=id&status=eq.pending`),
      rest(url, key, `leads?select=id,status,created_at&created_at=gte.${start}T00:00:00&created_at=lte.${end}T23:59:59`),
      rest(url, key, `staff_documents?select=id&status=eq.pending`),
      rest(url, key, `invoices?select=total,status,due_date&deleted_at=is.null`),
      rest(url, key, `staff_documents?select=id,expires_on&expires_on=not.is.null&expires_on=lte.${plus30}`),
      rest(url, key, `invoices?select=total&${prevInvFilter}`),
      rest(url, key, `expenses?select=amount&${prevExpFilter}`),
    ]);

  const failed = [inv, exp, staff, pendingStaff, leads, pendingDocs, allInv, expDocs, prevInv, prevExp]
    .find((r) => !r.ok);
  if (failed) return { error: "metrics_query_failed", status: failed.status };

  const invoices = inv.body || [];
  const expenses = exp.body || [];
  const leadsRows = leads.body || [];
  const prevInvoices = prevInv.body || [];
  const prevExpenses = prevExp.body || [];

  const invoiceTotal = round2(sum(invoices, "total"));
  const taxTotal = round2(sum(invoices, "tax_amount"));
  const expenseTotal = round2(sum(expenses, "amount"));
  const net = round2(invoiceTotal - expenseTotal);

  const byStatus = (rows) =>
    rows.reduce((acc, r) => {
      const k = r.status || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

  const byCategory = {};
  expenses.forEach((r) => {
    const k = r.category || "other";
    byCategory[k] = round2((byCategory[k] || 0) + num(r.amount));
  });
  const transportTotal = byCategory.transport || 0;
  const transportShare = expenseTotal > 0 ? round2((transportTotal / expenseTotal) * 100) : 0;

  const monthly = monthKeys(start, end).map((month) => {
    const revenue = round2(
      invoices.filter((r) => String(r.issue_date || "").slice(0, 7) === month)
        .reduce((s, r) => s + num(r.total), 0)
    );
    const spent = round2(
      expenses.filter((r) => String(r.expense_date || "").slice(0, 7) === month)
        .reduce((s, r) => s + num(r.amount), 0)
    );
    return { month, revenue, expenses: spent, net: round2(revenue - spent) };
  });

  const previousRevenue = round2(sum(prevInvoices, "total"));
  const previousExpenses = round2(sum(prevExpenses, "amount"));
  const previousNet = round2(previousRevenue - previousExpenses);

  const openInvoices = (allInv.body || []).filter((r) => r.status !== "paid");
  const overdueInvoices = openInvoices.filter((r) => r.due_date && r.due_date < today);

  const expiryRows = expDocs.body || [];
  const expiringSoon = expiryRows.filter(
    (r) => r.expires_on && r.expires_on >= today && r.expires_on <= plus30
  );
  const expired = expiryRows.filter((r) => r.expires_on && r.expires_on < today);

  const pendingProfiles = (pendingStaff.body || []).length;
  const pendingDocCount = (pendingDocs.body || []).length;

  const closed = leadsRows.filter((r) => r.status === "closed").length;
  const contacted = leadsRows.filter((r) => r.status === "contacted").length;
  const converted = closed;

  return {
    metrics: {
      period_start: start,
      period_end: end,
      invoices: {
        count: invoices.length,
        total: invoiceTotal,
        tax: taxTotal,
        by_status: byStatus(invoices),
      },
      expenses: {
        count: expenses.length,
        total: expenseTotal,
        by_status: byStatus(expenses),
        by_category: byCategory,
      },
      net,
      transport: {
        total: transportTotal,
        share_percent: transportShare,
      },
      monthly,
      comparison: {
        period_start: prev.start,
        period_end: prev.end,
        revenue: delta(invoiceTotal, previousRevenue),
        expenses: delta(expenseTotal, previousExpenses),
        net: delta(net, previousNet),
      },
      receivables: {
        unpaid_count: openInvoices.length,
        unpaid_total: round2(sum(openInvoices, "total")),
        overdue_count: overdueInvoices.length,
        overdue_total: round2(sum(overdueInvoices, "total")),
      },
      documents: {
        expiring_30d: expiringSoon.length,
        expired: expired.length,
      },
      pending_approvals: {
        profiles: pendingProfiles,
        documents: pendingDocCount,
        total: pendingProfiles + pendingDocCount,
      },
      staff: {
        approved: (staff.body || []).length,
        pending: pendingProfiles,
      },
      documents_pending_review: pendingDocCount,
      leads: {
        count: leadsRows.length,
        by_status: byStatus(leadsRows),
        converted,
        closed,
        contacted,
        conversion_percent: leadsRows.length ? round2((converted / leadsRows.length) * 100) : 0,
      },
    },
  };
}

async function writeReport(url, key, metrics, content, ownerId) {
  return rest(url, key, "reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      period_start: metrics.period_start,
      period_end: metrics.period_end,
      metrics,
      content,
      model: MODEL,
      created_by: ownerId,
    }),
  });
}

function systemPrompt(lang) {
  const language =
    lang === "ar"
      ? "Write the entire report in Modern Standard Arabic, using Arabic section headings."
      : "Write the entire report in English, using English section headings.";
  return `You are a business analyst for a Qatari manpower-supply company.
You receive a JSON object of already-computed figures. ${language}
Use ONLY the provided figures. Never perform arithmetic: do not add, subtract,
multiply, divide, average or calculate percentages, shares, deltas or comparisons.
Every total, share, percentage, delta and comparison you may cite is already in
the JSON. Never invent, estimate, infer or extrapolate numbers that are not present.
Never mention people, names or personal data. Amounts are in QAR unless stated.
Cite the previous-period comparison values exactly as provided (absolute and percent).
Write a concise management report in Markdown with these sections:
1. Executive summary (2-3 sentences).
2. Financial overview (invoices, expenses, net, transport and its share, expenses by
   category, month-by-month revenue/expenses/net, comparison with the previous period).
3. Receivables (unpaid and overdue invoices).
4. Operations and compliance (staff, pending approvals, documents expiring within 30 days).
5. Commercial pipeline (leads and conversion).
6. Risks and recommended actions (max 4 bullets).
If a figure is zero or missing, say so plainly. Keep it under 420 words.`;
}

async function gemini(metrics, lang) {
  const r = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `Figures:\n${JSON.stringify(metrics)}` }],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1400 },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: j?.error?.message };
  const text =
    j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim() || "";
  return { ok: true, text };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, model: MODEL });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { url, key } = env();
  if (!url || !key) return res.status(500).json({ error: "missing_supabase_env" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "missing_GEMINI_API_KEY" });

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    const user = await userFromToken(url, key, token);
    if (!user?.id) return res.status(401).json({ error: "invalid_token" });

    const prof = await rest(url, key, `profiles?select=role,status&id=eq.${user.id}`);
    const row = Array.isArray(prof.body) ? prof.body[0] : null;
    if (!row || row.role !== "owner") return res.status(403).json({ error: "owner_only" });
    if (!["approved", "active"].includes(row.status)) {
      return res.status(403).json({ error: "account_not_approved" });
    }

    if (rateLimited(user.id)) {
      return res.status(429).json({ error: "rate_limited", retry_after_seconds: 600 });
    }

    const period = parsePeriod(req.body || {});
    if (period.error) return res.status(400).json({ error: period.error });
    const lang = req.body && req.body.lang === "en" ? "en" : "ar";

    const computed = await computeMetrics(url, key, period.start, period.end);
    if (computed.error) return res.status(502).json({ error: computed.error });

    const report = await gemini(computed.metrics, lang);
    if (!report.ok) {
      return res.status(502).json({ error: "provider_error", detail: report.error });
    }
    if (!report.text) return res.status(502).json({ error: "empty_report" });

    const saved = await writeReport(url, key, computed.metrics, report.text, user.id);

    return res.status(200).json({
      ok: true,
      model: MODEL,
      lang,
      metrics: computed.metrics,
      content: report.text,
      saved: saved.ok,
    });
  } catch (e) {
    return res.status(500).json({ error: "report_failed" });
  }
}
