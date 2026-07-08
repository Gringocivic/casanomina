/**
 * Canonical worker role list used by WorkerOnboarding and WorkerProfile.
 * Add new roles here — both pages import from this single source.
 *
 * The "other" sentinel (__other__) is handled in UI logic only; it is never
 * stored in the database. Custom role text is stored directly in workers.role.
 */
export const ROLES = [
  { value: "housekeeper",        en: "Housekeeper",                  es: "Ama de llaves" },
  { value: "household_manager",  en: "Household Manager",            es: "Administradora del hogar" },
  { value: "nanny",              en: "Nanny / Caregiver",            es: "Niñera / Cuidadora" },
  { value: "night_nurse",        en: "Night Nurse",                  es: "Enfermera nocturna" },
  { value: "cook",               en: "Cook",                         es: "Cocinera" },
  { value: "gardener",           en: "Gardener",                     es: "Jardinero" },
  { value: "driver",             en: "Driver",                       es: "Chofer" },
  { value: "caregiver",          en: "Elder Caregiver",              es: "Cuidadora de adultos" },
  { value: "security",           en: "Security Guard",               es: "Guardia de seguridad" },
  { value: "pet_care",           en: "Pet Care / Dog Walker",        es: "Cuidador de mascotas" },
  { value: "pool_attendant",     en: "Pool Attendant",               es: "Albercero" },
  { value: "handyman",           en: "Home Maintenance",             es: "Mantenimiento del hogar" },
  { value: "personal_shopper",   en: "Household Errands",            es: "Mandados del hogar" },
  { value: "personal_assistant", en: "Household Assistant",          es: "Asistente del hogar" },
] as const;

export type RoleValue = typeof ROLES[number]["value"];

ex