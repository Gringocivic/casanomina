/**
 * lib/api.ts — Typed API client.
 *
 * All calls to the Fastify backend go through this module.
 * Base URL is set by the Vite proxy in development, and by
 * VITE_API_URL in production builds.
 *
 * Clerk token injection: call setTokenProvider(getToken) from a component
 * inside <ClerkProvider> — every subsequent fetch will include the Bearer token.
 */
export const BASE = import.meta.env.VITE_API_URL ?? "";

type TokenGetter = () => Promise<string | null>;
let _tokenGetter: TokenGetter | null = null;

/** Called once inside <ClerkProvider> to wire up the session token. */
export function setTokenProvider(fn: TokenGetter | null) {
  _tokenGetter = fn;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = _tokenGetter ? await _tokenGetter() : null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ── Config ──────────────────────────────────────────────────────────────
  config: {
    current: () => req("/api/config/current"),
    history: () => req("/api/config/history"),
  },

  // ── Workers ─────────────────────────────────────────────────────────────
  workers: {
    list: () => req<any[]>("/api/workers"),
    cards: () => req<any[]>("/api/workers/cards"),
    get: (id: string) => req<any>(`/api/workers/${id}`),
    create: (data: any) => req<any>("/api/workers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      req<any>(`/api/workers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => req<any>(`/api/workers/${id}`, { method: "DELETE" }),
    invite: (id: string, contact: string) =>
      req<{ invite_token: string; invite_contact: string; invite_status: string; claim_url: string }>(
        `/api/workers/${id}/invite`,
        { method: "POST", body: JSON.stringify({ contact }) }
      ),
  },

  // ── Payroll ─────────────────────────────────────────────────────────────
  payroll: {
    list: (workerId: string) => req<any[]>(`/api/payroll/${workerId}`),
    preview: (data: any) => req<any>("/api/payroll/preview", { method: "POST", body: JSON.stringify(data) }),
    create: (data: any) => req<any>("/api/payroll", { method: "POST", body: JSON.stringify(data) }),
    approve: (id: string) => req<any>(`/api/payroll/${id}/approve`, { method: "POST" }),
    markPaid: (id: string) => req<any>(`/api/payroll/${id}/mark-paid`, { method: "POST" }),
  },

  // ── Calculators ─────────────────────────────────────────────────────────
  calculate: {
    sbc: (data: any) => req<any>("/api/calculate/sbc", { method: "POST", body: JSON.stringify(data) }),
    imss: (data: any) => req<any>("/api/calculate/imss", { method: "POST", body: JSON.stringify(data) }),
    finiquito: (data: any) => req<any>("/api/calculate/finiquito", { method: "POST", body: JSON.stringify(data) }),
    liquidacion: (data: any) => req<any>("/api/calculate/liquidacion", { method: "POST", body: JSON.stringify(data) }),
  },

  // ── CMS / Laws & Rights ─────────────────────────────────────────────────
  content: {
    all: (lang: "en" | "es") => req<any[]>(`/api/content/${lang}`),
    get: (lang: "en" | "es", key: string) => req<any>(`/api/content/${lang}/${key}`),
  },

  // ── Holidays ────────────────────────────────────────────────────────────
  holidays: {
    forYear: (year: number) => req<any>(`/api/holidays/${year}`),
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  auth: {
    registerRole: (data: { role: "employer" | "worker"; business_name?: string; full_name?: string }) =>
      req<{ role: string; id: string }>("/api/auth/register-role", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    me: () => req<{ role: string | null; id: string | null }>("/api/auth/me"),
  },

  // ── Documents ───────────────────────────────────────────────────────────
  documents: {
    generatePayslip: (payrollRunId: string) =>
      req<any>(`/api/documents/payslip/${payrollRunId}`, { method: "POST" }),
    payslipDownloadUrl: (payrollRunId: string) =>
      `${BASE}/api/documents/payslip/${payrollRunId}`,
    generateContract: (workerId: string, contractDate?: string) =>
      req<any>(`/api/documents/contract/${workerId}`, {
        method: "POST",
        ...(contractDate ? { body: JSON.stringify({ contract_date: contractDate }) } : {}),
      }),
    contractDownloadUrl: (workerId: string) =>
      `${BASE}/api/documents/contract/${workerId}`,
  },

  // ── Employer Profile ────────────────────────────────────────────────────
  employers: {
    me: () => req<{
      id: string; business_name: string | null; rfc: string | null;
      phone: string | null; address: string | null; email: string | null;
    }>("/api/employers/me"),
    update: (data: {
      business_name?: string; rfc?: string | null;
      phone?: string | null; address?: string | null; email?: string | null;
    }) => req<any>("/api/employers/me", { method: "PATCH", body: JSON.stringify(data) }),
  },

  // ── Payroll History (all workers) ───────────────────────────────────────
  payrollHistory: {
    all: () => req<Array<{
      id: string; worker_id: string; worker_name: string;
      period_start: string; period_end: string; days_worked: number;
      status: string; gross_wages: string; net_pay: string;
      employer_total_cost: string; paid_at: string | null;
    }>>("/api/payroll/all"),
  },

  // ── Worker Portal ───────────────────────────────────────────────────────
  workerPortal: {
    me: () => req<{
      worker_id: string; full_name: string; start_date: string;
      daily_salary: string; wage_zone: string; pay_frequency: string;
      days_per_week: number; role: string | null; employment_status: string;
      is_imss_registered: boolean; imss_nss: string | null; employer_name: string | null;
    }>("/api/worker-portal/me"),
    payslips: () => req<any[]>("/api/worker-portal/payslips"),
    payslipUrl: (runId: string) => `${BASE}/api/worker-portal/payslip/${runId}`,
    contractUrl: () => `${BASE}/api/worker-portal/contract`,
  },

  // ── Employments ─────────────────────────────────────────────────────────
  employments: {
    invite: (token: string) =>
      req<{ worker_id: string; worker_name: string; invite_status: string; employer_name: string | null }>(
        `/api/employments/invite/${token}`
      ),
    claim: (token: string) =>
      req<{ worker_id: string; worker_name: string; employment_status: string; invite_status: string }>(
        "/api/employments/claim",
        { method: "POST", body: JSON.stringify({ token }) }
      ),
  },
};
