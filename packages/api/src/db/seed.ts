/**
 * db/seed.ts
 *
 * Seeds the database with the 2025 and 2026 rate configurations and
 * the initial bilingual Laws & Rights content for the MVP.
 *
 * Run with:  npm run db:seed  (adds this to package.json scripts)
 *
 * This is idempotent — running it twice won't create duplicates.
 */
import { db } from "./client.js";
import { sql } from "drizzle-orm";
import { rateConfigs, cmsContent } from "./schema.js";
import rates2025 from "../../../calculator/src/config/rates.2025.json" assert { type: "json" };
import rates2026 from "../../../calculator/src/config/rates.2026.json" assert { type: "json" };

async function seed() {
  console.log("🌱 Seeding rate configurations...");

  // ── Rate configs ─────────────────────────────────────────────────────────
  await db
    .insert(rateConfigs)
    .values([
      {
        config_key:     "rates-2025-v1",
        year:           2025,
        effective_date: "2025-01-01",
        config_data:    rates2025 as any,
        is_active:      false,
      },
      {
        config_key:     "rates-2026-v1",
        year:           2026,
        effective_date: "2026-01-01",
        config_data:    rates2026 as any,
        is_active:      true,
      },
    ])
    .onConflictDoUpdate({
      target: rateConfigs.config_key,
      set: { config_data: sql`excluded.config_data`, is_active: sql`excluded.is_active` },
    });

  // ── Laws & Rights bilingual CMS content ──────────────────────────────────
  console.log("🌱 Seeding Laws & Rights content...");

  const contentBlocks = [
    // --- Aguinaldo ---
    {
      content_key: "rights.aguinaldo",
      language: "en",
      title: "Christmas Bonus (Aguinaldo)",
      body: `Every worker is entitled to an annual Christmas bonus of **at least 15 days of salary**, regardless of how long they have worked.

If the worker has not completed a full year, the bonus is calculated proportionally based on the days actually worked during the year.

The aguinaldo must be paid **no later than December 20th** each year.

**Example:** A worker earning $350/day who worked the full year receives at least $350 × 15 = **$5,250 MXN**.`,
      legal_citation: "LFT Art. 87",
    },
    {
      content_key: "rights.aguinaldo",
      language: "es",
      title: "Aguinaldo",
      body: `Todo trabajador tiene derecho a un aguinaldo anual de **al menos 15 días de salario**, independientemente del tiempo de servicio.

Si el trabajador no ha completado un año, el aguinaldo se calcula de forma proporcional a los días trabajados.

El aguinaldo debe pagarse **a más tardar el 20 de diciembre** de cada año.

**Ejemplo:** Un trabajador que gana $350/día y laboró el año completo recibe al menos $350 × 15 = **$5,250 MXN**.`,
      legal_citation: "LFT Art. 87",
    },

    // --- Vacaciones ---
    {
      content_key: "rights.vacaciones",
      language: "en",
      title: "Paid Vacation Days",
      body: `Workers who have completed at least one year of service are entitled to paid vacation. The **Vacaciones Dignas** reform (effective January 2023) doubled the minimum from 6 to 12 days.

| Years of Service | Vacation Days |
|-----------------|---------------|
| 1               | 12 days       |
| 2               | 14 days       |
| 3               | 16 days       |
| 4               | 18 days       |
| 5               | 20 days       |
| 6–10            | 22 days       |
| 11–15           | 24 days       |

Vacation days **cannot be exchanged for money** while the worker is still employed — they must actually be taken. They can only be paid out upon termination.`,
      legal_citation: "LFT Arts. 76, 79 (reformed DOF 27-Dec-2022)",
    },
    {
      content_key: "rights.vacaciones",
      language: "es",
      title: "Días de Vacaciones Pagadas",
      body: `Los trabajadores con más de un año de servicio tienen derecho a vacaciones pagadas. La reforma de **Vacaciones Dignas** (vigente enero 2023) duplicó el mínimo de 6 a 12 días.

| Años de servicio | Días de vacaciones |
|-----------------|-------------------|
| 1               | 12 días           |
| 2               | 14 días           |
| 3               | 16 días           |
| 4               | 18 días           |
| 5               | 20 días           |
| 6–10            | 22 días           |
| 11–15           | 24 días           |

Las vacaciones **no pueden compensarse con dinero** mientras el trabajador sigue empleado — deben disfrutarse. Solo se pagan en caso de terminación laboral.`,
      legal_citation: "LFT Arts. 76, 79 (reforma DOF 27-dic-2022)",
    },

    // --- Prima Vacacional ---
    {
      content_key: "rights.prima_vacacional",
      language: "en",
      title: "Vacation Premium (Prima Vacacional)",
      body: `In addition to regular pay during vacation, workers receive a **vacation premium of at least 25%** of the salary corresponding to their vacation days.

**Example:** A worker with 1 year of service earns 12 vacation days. At $350/day:
- Vacation pay: 12 × $350 = $4,200
- Prima vacacional: $4,200 × 25% = **$1,050 MXN**`,
      legal_citation: "LFT Art. 80",
    },
    {
      content_key: "rights.prima_vacacional",
      language: "es",
      title: "Prima Vacacional",
      body: `Además del salario normal durante el período vacacional, el trabajador tiene derecho a una **prima vacacional de al menos el 25%** sobre el salario correspondiente a los días de vacaciones.

**Ejemplo:** Un trabajador con 1 año de servicio tiene 12 días de vacaciones. Con $350/día:
- Pago de vacaciones: 12 × $350 = $4,200
- Prima vacacional: $4,200 × 25% = **$1,050 MXN**`,
      legal_citation: "LFT Art. 80",
    },

    // --- IMSS ---
    {
      content_key: "rights.imss",
      language: "en",
      title: "IMSS Social Security Registration",
      body: `As an employer of a domestic worker in Mexico, you are **legally required** to register them with IMSS (Instituto Mexicano del Seguro Social). IMSS provides the worker with:

- Medical care and hospitalization
- Maternity coverage
- Disability and life insurance
- Retirement fund contributions

Registration is done through IMSS's **domestic worker pilot program**. Failure to register exposes you to fines and back-payments of all unpaid contributions.

CasaNomina calculates your exact IMSS contribution each payroll period and maintains the audit trail.`,
      legal_citation: "Ley del Seguro Social Arts. 12, 27; IMSS Programa de Afiliación de Personas Trabajadoras del Hogar",
    },
    {
      content_key: "rights.imss",
      language: "es",
      title: "Registro al IMSS",
      body: `Como empleador de trabajadoras del hogar en México, estás **legalmente obligado** a inscribirlas ante el IMSS (Instituto Mexicano del Seguro Social). El IMSS les proporciona:

- Atención médica y hospitalización
- Cobertura de maternidad
- Seguro de invalidez y vida
- Aportaciones para el retiro

El registro se realiza a través del **programa de afiliación de trabajadoras del hogar** del IMSS. No cumplir con esta obligación puede generar multas y el pago retroactivo de todas las cuotas omitidas.`,
      legal_citation: "Ley del Seguro Social Arts. 12, 27; Programa IMSS de Afiliación de Personas Trabajadoras del Hogar",
    },

    // --- Dias festivos ---
    {
      content_key: "rights.dias_festivos",
      language: "en",
      title: "Mandatory Rest Days (Holidays)",
      body: `There are 7 mandatory paid rest days per year under Mexican law. If a worker works on one of these days, they must receive **triple pay** for that day: their normal daily wage plus double the daily wage as a penalty.

**2026 mandatory holidays:**
- January 1 – New Year's Day
- February 2 (1st Monday of Feb) – Constitution Day
- March 16 (3rd Monday of Mar) – Benito Juárez Birthday
- May 1 – Labor Day
- September 16 – Independence Day
- November 16 (3rd Monday of Nov) – Revolution Day
- December 25 – Christmas

Note: Viernes Santo (Good Friday), Día de Muertos, and Día de las Madres are NOT mandatory rest days under federal law, though you may choose to grant them.`,
      legal_citation: "LFT Arts. 74, 75",
    },
    {
      content_key: "rights.dias_festivos",
      language: "es",
      title: "Días de Descanso Obligatorio",
      body: `La ley mexicana establece 7 días de descanso obligatorio al año con goce de sueldo. Si el trabajador labora en uno de estos días, debe recibir **pago triple**: su salario normal más el doble como compensación adicional.

**Días de descanso obligatorio 2026:**
- 1 de enero – Año Nuevo
- 2 de febrero (1er lunes de feb) – Día de la Constitución
- 16 de marzo (3er lunes de mar) – Natalicio de Benito Juárez
- 1 de mayo – Día del Trabajo
- 16 de septiembre – Día de la Independencia
- 16 de noviembre (3er lunes de nov) – Revolución Mexicana
- 25 de diciembre – Navidad`,
      legal_citation: "LFT Arts. 74, 75",
    },
  ];

  await db
    .insert(cmsContent)
    .values(contentBlocks)
    .onConflictDoNothing();

  console.log("✅ Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
