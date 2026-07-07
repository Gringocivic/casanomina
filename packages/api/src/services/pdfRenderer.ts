/**
 * services/pdfRenderer.ts
 *
 * Server-side PDF generation using @react-pdf/renderer.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WorkerRecord {
  id: string;
  full_name: string;
  start_date: string;
  daily_salary: string;
  wage_zone: "general" | "northern_border";
  pay_frequency: "daily" | "weekly" | "biweekly" | "semi-monthly" | "monthly";
  days_per_week: number;
  role?: string | null;
  curp?: string | null;
  imss_nss?: string | null;
  is_imss_registered: boolean;
}

interface IMSSBranches {
  enfermedad_maternidad: { employer: number; worker: number };
  invalidez_vida:        { employer: number; worker: number };
  retiro:                { employer: number; worker: number };
  cesantia_vejez:        { employer: number; worker: number };
  guarderias_prestaciones_sociales: { employer: number; worker: number };
  riesgos_trabajo:       { employer: number; worker: number };
}

interface PayrollRun {
  id: string;
  worker_id: string;
  period_start: string;
  period_end: string;
  gross_pay: string;
  net_pay: string;
  employer_cost: string;
  status: string;
  breakdown_json: Record<string, unknown>;
  paid_at?: string | null;
}

interface RateConfig {
  config_key: string;
  year: number;
  config_data: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mxn(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "$0.00";
  return `$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function yearsOfService(startDate: string, asOf: string): number {
  const ms = new Date(asOf).getTime() - new Date(startDate).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 365.25));
}

function vacationDaysEarned(completedYears: number): number {
  // LFT Art. 76 (Vacaciones Dignas, 2022)
  if (completedYears < 1) return 0;
  const table = [12, 14, 16, 18, 20];
  const idx = Math.min(Math.floor(completedYears) - 1, table.length - 1);
  if (Math.floor(completedYears) <= 5) return table[idx];
  // +2 days every 5 years after year 5
  return 20 + 2 * Math.floor((Math.floor(completedYears) - 5) / 5);
}

function daysInYear(periodEnd: string): number {
  const end = new Date(periodEnd);
  const yearStart = new Date(end.getFullYear(), 0, 1);
  return Math.floor((end.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  terracotta: "#C4572A",
  sage:       "#5A7A5F",
  dark:       "#1a1a1a",
  mid:        "#374151",
  light:      "#6b7280",
  muted:      "#9ca3af",
  border:     "#e5e7eb",
  stripe:     "#f9fafb",
  greenBg:    "#f0fdf4",
  greenText:  "#166534",
  amberBg:    "#fffbeb",
  amberText:  "#92400e",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:         { fontFamily: "Helvetica", fontSize: 9, padding: 36, color: C.dark, backgroundColor: "#ffffff" },
  // Header band
  headerBand:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
                  backgroundColor: C.terracotta, padding: "14 18", marginBottom: 14, borderRadius: 6 },
  brandName:    { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  brandSub:     { fontSize: 8, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  docTitleWrap: { alignItems: "flex-end" },
  docTitle:     { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  docSub:       { fontSize: 8, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  statusBadge:  { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2,
                  backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20 },
  statusText:   { fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  // Two-col info strip
  infoStrip:    { flexDirection: "row", gap: 8, marginBottom: 12 },
  infoBox:      { flex: 1, backgroundColor: C.stripe, borderRadius: 6, padding: "8 10" },
  infoLabel:    { fontSize: 7.5, color: C.light, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  infoRow:      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  infoKey:      { fontSize: 8.5, color: C.mid, flex: 2 },
  infoVal:      { fontSize: 8.5, color: C.dark, fontFamily: "Helvetica-Bold", flex: 1.5, textAlign: "right" },
  // Sections
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.sage, textTransform: "uppercase",
                  letterSpacing: 0.6, marginTop: 10, marginBottom: 3,
                  paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.border },
  row:          { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 2 },
  rowAlt:       { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 2,
                  backgroundColor: C.stripe },
  rowLabel:     { color: C.mid, flex: 3 },
  rowAmt:       { color: C.dark, textAlign: "right", flex: 1 },
  rowAmtDed:    { color: "#b91c1c", textAlign: "right", flex: 1 },
  // Sub-total bars
  subTotalRow:  { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4,
                  borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 2 },
  subLabel:     { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.dark, flex: 3 },
  subAmt:       { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.dark, textAlign: "right", flex: 1 },
  subAmtDed:    { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#b91c1c", textAlign: "right", flex: 1 },
  // Net pay box
  netBox:       { backgroundColor: C.terracotta, borderRadius: 8, padding: "12 16",
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  marginTop: 12, marginBottom: 4 },
  netLabel:     { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  netLabelEs:   { fontSize: 8, color: "rgba(255,255,255,0.75)", marginTop: 1 },
  netAmt:       { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  // Employer cost strip
  empBox:       { backgroundColor: C.greenBg, borderRadius: 6, padding: "8 12", marginTop: 4 },
  empTitle:     { fontSize: 7.5, color: C.greenText, fontFamily: "Helvetica-Bold",
                  textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  empRow:       { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  empKey:       { fontSize: 8, color: C.greenText, flex: 3 },
  empVal:       { fontSize: 8, color: C.greenText, fontFamily: "Helvetica-Bold", textAlign: "right", flex: 1 },
  // Accruals strip
  accrualBox:   { backgroundColor: C.amberBg, borderRadius: 6, padding: "8 12", marginTop: 6 },
  accrualTitle: { fontSize: 7.5, color: C.amberText, fontFamily: "Helvetica-Bold",
                  textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  accrualRow:   { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  accrualKey:   { fontSize: 8, color: C.amberText, flex: 3 },
  accrualVal:   { fontSize: 8, color: C.amberText, fontFamily: "Helvetica-Bold", textAlign: "right", flex: 1 },
  // Legal + footer
  legalBox:     { marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  legalText:    { fontSize: 7, color: C.muted, lineHeight: 1.4 },
  footer:       { position: "absolute", bottom: 20, left: 36, right: 36,
                  flexDirection: "row", justifyContent: "space-between" },
  footerText:   { fontSize: 7, color: C.muted },
});

// ─── Payslip Document ─────────────────────────────────────────────────────────
function PayslipDoc({ run, worker, config }: {
  run: PayrollRun; worker: WorkerRecord; config: RateConfig;
}) {
  const bd = run.breakdown_json as any;
  const imss = bd?.imss as { sbc?: number; branches?: IMSSBranches; total_employer?: number; total_worker?: number } | undefined;
  const branches = imss?.branches;
  const sbc = imss?.sbc ?? 0;

  const grossPay  = parseFloat(run.gross_pay);
  const netPay    = parseFloat(run.net_pay);
  const empCost   = parseFloat(run.employer_cost);
  const infonavit = bd?.infonavit_employer_contribution ?? 0;
  const empImss   = imss?.total_employer ?? (empCost - grossPay - infonavit);

  // Worker IMSS deductions breakdown
  const wrkEM  = branches?.enfermedad_maternidad?.worker ?? 0;
  const wrkIV  = branches?.invalidez_vida?.worker ?? 0;
  const wrkCV  = (branches?.cesantia_vejez?.worker ?? 0) + (branches?.retiro?.worker ?? 0);
  const imssWorkerTotal = (imss?.total_worker ?? 0);

  // ISR (income tax) withheld this period
  const isrData = bd?.isr as { period_isr_withholding?: number; monthly_isr_gross?: number; monthly_employment_subsidy?: number } | undefined;
  const isrWithholding = isrData?.period_isr_withholding ?? 0;

  const totalDed = imssWorkerTotal + isrWithholding;

  // Vacation pay (from breakdown_json — 0 when no vacation days in this run)
  const vacationDaysPaid = bd?.vacation_days ?? 0;
  const vacationPay      = bd?.vacation_pay ?? 0;
  const primaVacacional  = bd?.prima_vacacional ?? 0;
  const holidayBonus     = bd?.holiday_bonus ?? 0;
  const restDayBonus     = bd?.rest_day_bonus ?? 0;

  // Employer IMSS breakdown
  const empEM  = branches?.enfermedad_maternidad?.employer ?? 0;
  const empIV  = branches?.invalidez_vida?.employer ?? 0;
  const empRet = branches?.retiro?.employer ?? 0;
  const empCV  = branches?.cesantia_vejez?.employer ?? 0;
  const empGPS = branches?.guarderias_prestaciones_sociales?.employer ?? 0;
  const empRT  = branches?.riesgos_trabajo?.employer ?? 0;

  // Accruals (informational estimates)
  const dailySalary    = parseFloat(worker.daily_salary);
  const yearsFloat     = yearsOfService(worker.start_date, run.period_end);
  // Use ceil so workers see their upcoming entitlement even before the anniversary
  const accrualYear    = Math.max(1, Math.ceil(yearsFloat));
  const vacDaysRaw     = vacationDaysEarned(accrualYear);
  // Prorate for part-time workers (same as UI)
  const vacDays        = Math.round(vacDaysRaw * (worker.days_per_week ?? 6) / 6);
  const primaVac       = vacDays * dailySalary * 0.25;
  const completedYears = Math.floor(yearsFloat);
  const daysThisYear   = daysInYear(run.period_end);
  const aguinaldoAccum = (daysThisYear / 365) * 15 * dailySalary;

  const statusLabel: Record<string, string> = {
    paid: "PAGADO", approved: "APROBADO", draft: "BORRADOR", cancelled: "CANCELADO",
  };

  const el = (type: any, props: any, ...children: any[]) =>
    React.createElement(type, props, ...children);

  // Helper to create a row
  function Row(label: string, amount: string, alt: boolean, deduction = false) {
    return el(View, { style: alt ? S.rowAlt : S.row },
      el(Text, { style: S.rowLabel }, label),
      el(Text, { style: deduction ? S.rowAmtDed : S.rowAmt }, amount),
    );
  }

  function SubTotal(label: string, amount: string, deduction = false) {
    return el(View, { style: S.subTotalRow },
      el(Text, { style: S.subLabel }, label),
      el(Text, { style: deduction ? S.subAmtDed : S.subAmt }, amount),
    );
  }

  function EmpRow(label: string, val: number) {
    return el(View, { style: S.empRow },
      el(Text, { style: S.empKey }, label),
      el(Text, { style: S.empVal }, mxn(val)),
    );
  }

  function AccrualRow(label: string, val: string) {
    return el(View, { style: S.accrualRow },
      el(Text, { style: S.accrualKey }, label),
      el(Text, { style: S.accrualVal }, val),
    );
  }

  return el(Document, null,
    el(Page, { size: "LETTER", style: S.page },

      // ── Header band ────────────────────────────────────────────────────────
      el(View, { style: S.headerBand },
        el(View, null,
          el(Text, { style: S.brandName }, "CasaNomina"),
          el(Text, { style: S.brandSub }, "Nómina doméstica • Household Payroll"),
        ),
        el(View, { style: S.docTitleWrap },
          el(Text, { style: S.docTitle }, "RECIBO DE NÓMINA"),
          el(Text, { style: S.docSub }, `Período: ${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}`),
          el(View, { style: S.statusBadge },
            el(Text, { style: S.statusText }, statusLabel[run.status] ?? run.status.toUpperCase()),
          ),
        ),
      ),

      // ── Info strip: worker | period ────────────────────────────────────────
      el(View, { style: S.infoStrip },
        // Worker box
        el(View, { style: S.infoBox },
          el(Text, { style: S.infoLabel }, "Trabajador(a) / Worker"),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Nombre"), el(Text, { style: S.infoVal }, worker.full_name)),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Puesto"), el(Text, { style: S.infoVal }, worker.role ?? "Trabajo doméstico")),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Ingreso"), el(Text, { style: S.infoVal }, fmtDate(worker.start_date))),
          worker.curp    ? el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "CURP"),     el(Text, { style: S.infoVal }, worker.curp))    : null,
          worker.imss_nss? el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "NSS"),      el(Text, { style: S.infoVal }, worker.imss_nss)) : null,
        ),
        // Period / pay box
        el(View, { style: S.infoBox },
          el(Text, { style: S.infoLabel }, "Período / Period"),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Salario diario"), el(Text, { style: S.infoVal }, mxn(worker.daily_salary))),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "SBC"), el(Text, { style: S.infoVal }, mxn(sbc))),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Zona salarial"), el(Text, { style: S.infoVal }, worker.wage_zone === "northern_border" ? "Frontera Norte" : "General")),
          el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Frecuencia"), el(Text, { style: S.infoVal }, worker.pay_frequency)),
          run.paid_at ? el(View, { style: S.infoRow }, el(Text, { style: S.infoKey }, "Fecha de pago"), el(Text, { style: S.infoVal }, fmtDate(run.paid_at!))) : null,
        ),
      ),

      // ── PERCEPCIONES ──────────────────────────────────────────────────────
      el(Text, { style: S.sectionTitle }, "PERCEPCIONES / EARNINGS"),
      Row(`Sueldo del período (${(bd?.period?.days_worked ?? 0) - vacationDaysPaid} días regulares)`, mxn(grossPay - vacationPay - primaVacacional - holidayBonus - restDayBonus), false),
      holidayBonus > 0 ? Row("Bono días festivos trabajados (LFT Art. 75)", mxn(holidayBonus), true) : null,
      restDayBonus > 0 ? Row("Bono descanso trabajado (LFT Art. 73)", mxn(restDayBonus), false) : null,
      vacationDaysPaid > 0 ? Row(`Pago vacaciones (${vacationDaysPaid} días, LFT Art. 76)`, mxn(vacationPay), true) : null,
      vacationDaysPaid > 0 ? Row("Prima vacacional (25%, LFT Art. 80)", mxn(primaVacacional), false) : null,
      SubTotal("Total Percepciones", mxn(grossPay)),

      // ── DEDUCCIONES ────────────────────────────────────────────────────────
      totalDed > 0 ? el(View, null,
        el(Text, { style: S.sectionTitle }, "DEDUCCIONES / DEDUCTIONS"),
        // IMSS worker share (only shown when IMSS registered)
        worker.is_imss_registered && wrkEM  > 0 ? Row("IMSS – Enfermedad y Maternidad (obrero)", `(${mxn(wrkEM)})`, false, true) : null,
        worker.is_imss_registered && wrkIV  > 0 ? Row("IMSS – Invalidez y Vida (obrero)", `(${mxn(wrkIV)})`, true,  true) : null,
        worker.is_imss_registered && wrkCV  > 0 ? Row("IMSS – Cesantía, Vejez y Retiro (obrero)", `(${mxn(wrkCV)})`, false, true) : null,
        // ISR always shown when non-zero
        isrWithholding > 0 ? Row("ISR retenido (Art. 96 LISR) / Income Tax", `(${mxn(isrWithholding)})`, worker.is_imss_registered ? true : false, true) : null,
        SubTotal("Total Deducciones", `(${mxn(totalDed)})`, true),
      ) : null,

      // ── NET PAY box ───────────────────────────────────────────────────────
      el(View, { style: S.netBox },
        el(View, null,
          el(Text, { style: S.netLabel }, "NETO A PAGAR"),
          el(Text, { style: S.netLabelEs }, "Net Pay"),
        ),
        el(Text, { style: S.netAmt }, mxn(netPay)),
      ),

      // ── INSTRUCCIONES DE PAGO / PAYMENT INSTRUCTIONS ──────────────────────
      el(View, { style: { ...S.empBox, backgroundColor: "#eff6ff", marginBottom: 4 } },
        el(Text, { style: { ...S.empTitle, color: "#1e40af" } }, "Instrucciones de Pago / Payment Instructions"),
        // 1. Worker
        el(View, { style: S.empRow },
          el(Text, { style: { ...S.empKey, color: "#1e40af" } }, "① Pagar a la trabajadora / Pay worker"),
          el(Text, { style: { ...S.empVal, color: "#1e40af" } }, mxn(netPay)),
        ),
        // 2. IMSS (only if registered)
        worker.is_imss_registered ? el(View, { style: S.empRow },
          el(Text, { style: { ...S.empKey, color: "#1e40af" } }, "② Pagar a IMSS (patronal + obrero) / Pay IMSS"),
          el(Text, { style: { ...S.empVal, color: "#1e40af" } }, mxn((imss?.total_employer ?? 0) + imssWorkerTotal)),
        ) : null,
        // 3. SAT / ISR
        isrWithholding > 0 ? el(View, { style: S.empRow },
          el(Text, { style: { ...S.empKey, color: "#1e40af" } }, "③ Enterar a SAT (ISR retenido) / Remit to SAT"),
          el(Text, { style: { ...S.empVal, color: "#1e40af" } }, mxn(isrWithholding)),
        ) : null,
        // Divider
        el(View, { style: { borderTopWidth: 0.5, borderTopColor: "#93c5fd", marginVertical: 3 } }, null),
        el(View, { style: S.empRow },
          el(Text, { style: { ...S.empKey, color: "#1e40af", fontFamily: "Helvetica-Bold" } }, "Total desembolso patronal / Total employer outlay"),
          el(Text, { style: { ...S.empVal, color: "#1e40af", fontFamily: "Helvetica-Bold" } },
            mxn(netPay + (worker.is_imss_registered ? (imss?.total_employer ?? 0) + imssWorkerTotal : 0) + isrWithholding)
          ),
        ),
        el(View, null,
          el(Text, { style: { fontSize: 6.5, color: "#3b82f6", fontStyle: "italic", marginTop: 3 } },
            "IMSS se liquida bimestralmente ante el IDSE. ISR se entera mensualmente en SIPARE/SAT. Consúltese a su contador."
          ),
        ),
      ),

      // ── COSTO PATRONAL IMSS DETALLE (informational) ───────────────────────
      worker.is_imss_registered ? el(View, { style: S.empBox },
        el(Text, { style: S.empTitle }, "Desglose Costo Patronal IMSS / Employer IMSS Cost Breakdown"),
        empEM  > 0 ? EmpRow("IMSS – Enfermedad y Maternidad (patrón)", empEM)   : null,
        empIV  > 0 ? EmpRow("IMSS – Invalidez y Vida (patrón)", empIV)          : null,
        empRet > 0 ? EmpRow("IMSS – Retiro (patrón)", empRet)                   : null,
        empCV  > 0 ? EmpRow("IMSS – Cesantía y Vejez (patrón)", empCV)          : null,
        empGPS > 0 ? EmpRow("IMSS – Guarderías y Prest. Sociales (patrón)", empGPS) : null,
        empRT  > 0 ? EmpRow("IMSS – Riesgos de Trabajo (patrón)", empRT)        : null,
        EmpRow("INFONAVIT (patrón)", infonavit),
        el(View, { style: { ...S.empRow, borderTopWidth: 0.5, borderTopColor: "#bbf7d0", paddingTop: 3, marginTop: 2 } },
          el(Text, { style: { ...S.empKey, fontFamily: "Helvetica-Bold" } }, "Total Costo Patronal IMSS+INFONAVIT"),
          el(Text, { style: { ...S.empVal, fontFamily: "Helvetica-Bold" } }, mxn(empCost - grossPay)),
        ),
      ) : null,

      // ── PRESTACIONES ACUMULADAS (informational) ───────────────────────────
      el(View, { style: S.accrualBox },
        el(Text, { style: S.accrualTitle }, "Prestaciones Acumuladas al Corte (estimadas) / Accrued Benefits (estimates)"),
        AccrualRow(`Aguinaldo acumulado (${daysThisYear} días del año × 15 días/año)`, mxn(aguinaldoAccum)),
        AccrualRow(`Vacaciones (año ${accrualYear} servicio, ${worker.days_per_week ?? 6} días/sem)`, `${vacDays} días`),
        AccrualRow("Prima vacacional estimada (25% sobre vacaciones)", mxn(primaVac)),
        el(View, { style: S.accrualRow },
          el(Text, { style: { ...S.accrualKey, fontSize: 7, fontStyle: "italic" } },
            "* Estimaciones; la liquidación exacta requiere cálculo al momento del pago / unjustified dismissal adds 3-month indemnity + 20 days/year."),
          el(Text, { style: S.accrualVal }, ""),
        ),
      ),

      // ── Legal note ────────────────────────────────────────────────────────
      el(View, { style: S.legalBox },
        el(Text, { style: S.legalText },
          `Calculado conforme a la Ley Federal del Trabajo (LFT) y la Ley del Seguro Social (LSS). ` +
          `Salarios mínimos CONASAMI ${config.year}. SBC = salario diario × factor de integración. ` +
          `Config: ${config.config_key}. ` +
          "Este recibo es informativo; los montos definitivos de IMSS se liquidan en el ciclo bimestral correspondiente."
        ),
      ),

      // ── Footer ────────────────────────────────────────────────────────────
      el(View, { style: S.footer },
        el(Text, { style: S.footerText }, "CasaNomina — Software libre para nómina doméstica en México • MIT License"),
        el(Text, { style: S.footerText }, `Folio: ${run.id.slice(0, 8).toUpperCase()} • Emitido: ${new Date().toLocaleDateString("es-MX")}`),
      ),
    )
  );
}

// ─── Contract Document ────────────────────────────────────────────────────────
const cS = StyleSheet.create({
  page:      { fontFamily: "Helvetica", fontSize: 9.5, padding: 48, color: "#1a1a1a" },
  title:     { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4, color: "#C4572A" },
  subtitle:  { fontSize: 9.5, textAlign: "center", color: "#5A7A5F", marginBottom: 20 },
  clauseTit: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  body:      { fontSize: 9, lineHeight: 1.6, color: "#1f2937", marginBottom: 4 },
  sigBlock:  { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  sigLine:   { width: "40%", borderTopWidth: 1, borderTopColor: "#374151", paddingTop: 4 },
  sigLabel:  { fontSize: 8.5, color: "#6b7280" },
  footer:    { position: "absolute", bottom: 24, left: 48, right: 48,
               borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 6 },
  footerTxt: { fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

function ContractDoc({ worker, contractDate }: { worker: WorkerRecord; contractDate: string }) {
  const dateFormatted  = fmtDate(contractDate);
  const startFormatted = fmtDate(worker.start_date);

  const clauses = [
    {
      title: "PRIMERA / FIRST — Partes / Parties",
      body:  `El/La presente contrato se celebra entre el/la empleador(a) ("Employer") y ${worker.full_name} (CURP: ${worker.curp ?? "pendiente"}) en su carácter de trabajador(a) doméstico(a) ("Worker"), conforme a las disposiciones de la Ley Federal del Trabajo (LFT).\n\nThis agreement is entered into between the Employer and ${worker.full_name} as a domestic worker, pursuant to the Ley Federal del Trabajo (LFT, Mexico's Federal Labor Law).`,
    },
    {
      title: "SEGUNDA / SECOND — Objeto y Puesto / Job Description",
      body:  `El/La Trabajador(a) prestará servicios domésticos en el domicilio del/la Empleador(a) en la categoría de: ${worker.role ?? "Trabajador(a) Doméstico(a)"}.\n\nThe Worker will provide domestic services at the Employer's residence in the role of: ${worker.role ?? "Domestic Worker"}.`,
    },
    {
      title: "TERCERA / THIRD — Fecha de Inicio / Start Date",
      body:  `La relación laboral inicia el ${startFormatted}.\nThe employment relationship begins on ${startFormatted}.`,
    },
    {
      title: "CUARTA / FOURTH — Jornada / Work Schedule",
      body:  `El/La Trabajador(a) laborará ${worker.days_per_week} días por semana, con los descansos establecidos por la LFT (Art. 68–69).\n\nThe Worker shall work ${worker.days_per_week} days per week, with rest days as required by LFT (Art. 68–69).`,
    },
    {
      title: "QUINTA / FIFTH — Salario / Salary",
      body:  `El salario diario es de $${worker.daily_salary} MXN, pagadero de manera ${worker.pay_frequency}, no menor al salario mínimo vigente en la zona ${worker.wage_zone === "northern_border" ? "frontera norte" : "general"} (LFT Art. 90; CONASAMI 2026).\n\nDaily salary: $${worker.daily_salary} MXN, paid ${worker.pay_frequency}, not less than the applicable minimum wage.`,
    },
    {
      title: "SEXTA / SIXTH — Vacaciones / Vacation (LFT Art. 76 — Vacaciones Dignas 2022)",
      body:  "El/La Trabajador(a) tendrá derecho a: Año 1: 12 días; Año 2: 14 días; Año 3: 16 días; Año 4: 18 días; Año 5: 20 días; +2 días cada 5 años. Prima vacacional: 25% (LFT Art. 80).\n\nVacation entitlement: Year 1: 12 days, Year 2: 14, Year 3: 16, Year 4: 18, Year 5: 20, +2 days every 5 subsequent years. Vacation premium: 25% of salary (LFT Art. 80).",
    },
    {
      title: "SÉPTIMA / SEVENTH — Aguinaldo (LFT Art. 87)",
      body:  "El/La Trabajador(a) tendrá derecho a un aguinaldo anual equivalente a mínimo 15 días de salario, pagadero antes del 20 de diciembre.\n\nWorker is entitled to an annual Christmas bonus of at least 15 days' salary, payable before December 20th.",
    },
    {
      title: "OCTAVA / EIGHTH — IMSS / Social Security",
      body:  worker.is_imss_registered
        ? `El/La Trabajador(a) está inscrito(a) al IMSS (NSS: ${worker.imss_nss ?? "pendiente"}). Las cuotas serán retenidas y enteradas conforme a la LSS.\nThe Worker is registered with IMSS (NSS: ${worker.imss_nss ?? "pending"}). Contributions will be withheld and remitted per the LSS.`
        : "El/La Empleador(a) se compromete a inscribir al/la Trabajador(a) al IMSS conforme a la Ley del Seguro Social dentro de los primeros 5 días hábiles del inicio de la relación laboral.\nThe Employer commits to registering the Worker with IMSS within the first 5 business days of employment.",
    },
    {
      title: "NOVENA / NINTH — Días Festivos / Holidays (LFT Art. 74)",
      body:  "El/La Trabajador(a) tendrá derecho a los días de descanso obligatorio con goce de salario. Trabajo en día festivo se pagará a triple salario.\n\nWorker is entitled to all mandatory holidays with full pay. Work on a mandatory holiday is paid at triple the daily salary rate.",
    },
    {
      title: "DÉCIMA / TENTH — Legislación Aplicable / Governing Law",
      body:  "Este contrato se rige por la Ley Federal del Trabajo vigente. Cualquier controversia se resolverá ante la Junta de Conciliación y Arbitraje competente.\n\nThis agreement is governed by Mexico's Ley Federal del Trabajo. Disputes shall be resolved before the competent Junta de Conciliación y Arbitraje.",
    },
  ];

  const el = (type: any, props: any, ...children: any[]) =>
    React.createElement(type, props, ...children);

  return el(Document, null,
    el(Page, { size: "LETTER", style: cS.page },
      el(Text, { style: cS.title },    "CONTRATO INDIVIDUAL DE TRABAJO DOMÉSTICO"),
      el(Text, { style: cS.subtitle }, "Individual Domestic Employment Agreement • Conforme a LFT Art. 25"),

      ...clauses.map((c) =>
        el(View, { key: c.title },
          el(Text, { style: cS.clauseTit }, c.title),
          el(Text, { style: cS.body },      c.body),
        )
      ),

      el(View, { style: cS.sigBlock },
        el(View, { style: cS.sigLine },
          el(Text, { style: cS.sigLabel }, "EMPLEADOR(A) / EMPLOYER"),
          el(Text, { style: cS.sigLabel }, `Fecha / Date: ${dateFormatted}`),
        ),
        el(View, { style: cS.sigLine },
          el(Text, { style: cS.sigLabel }, worker.full_name),
          el(Text, { style: cS.sigLabel }, "TRABAJADOR(A) / WORKER"),
        ),
      ),

      el(View, { style: cS.footer },
        el(Text, { style: cS.footerTxt },
          "Generado por CasaNomina (casanomina.org) — Open source, MIT License. " +
          "Este documento es una plantilla informativa; consulte a un abogado laboral para validez legal."
        ),
      ),
    )
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function renderPayslipToBuffer(
  run: PayrollRun, worker: WorkerRecord, config: RateConfig
): Promise<Buffer> {
  const element = React.createElement(PayslipDoc, { run, worker, config });
  return renderToBuffer(element as React.ReactElement<Record<string, unknown>>);
}

export async function renderContractToBuffer(
  worker: WorkerRecord, contractDate?: string
): Promise<Buffer> {
  const date = contractDate ?? new Date().toISOString().slice(0, 10);
  const element = React.createElement(ContractDoc, { worker, contractDate: date });
  return renderToBuffer(element as React.ReactElement<Record<string, unknown>>);
}
