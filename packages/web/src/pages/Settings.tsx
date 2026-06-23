/**
 * pages/Settings.tsx — Employer profile / onboarding
 *
 * Lets the employer fill in their business details.
 * Shows a completion bar so they know what's still missing.
 */
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useLanguage } from "../hooks/useLanguage";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Settings as SettingsIcon, CheckCircle2, Circle, Building2 } from "lucide-react";

type Profile = {
  id: string;
  business_name: string | null;
  rfc: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
};

function completionFields(p: Profile | null) {
  if (!p) return [];
  return [
    { key: "business_name", label: { en: "Business / household name", es: "Nombre del hogar o negocio" }, done: !!p.business_name },
    { key: "email",         label: { en: "Contact email",              es: "Correo de contacto"         }, done: !!p.email         },
    { key: "phone",         label: { en: "Phone",                      es: "Teléfono"                   }, done: !!p.phone         },
    { key: "rfc",           label: { en: "RFC",                        es: "RFC"                        }, done: !!p.rfc           },
    { key: "address",       label: { en: "Address",                    es: "Domicilio"                  }, done: !!p.address       },
  ];
}

export function Settings() {
  const { lang } = useLanguage();
  const { data: profile, loading } = useApi(() => api.employers.me(), []);

  const [form, setForm] = useState({
    business_name: "",
    rfc:           "",
    phone:         "",
    address:       "",
    email:         "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        business_name: profile.business_name ?? "",
        rfc:           profile.rfc           ?? "",
        phone:         profile.phone         ?? "",
        address:       profile.address       ?? "",
        email:         profile.email         ?? "",
      });
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.employers.update({
        business_name: form.business_name || undefined,
        rfc:           form.rfc     || null,
        phone:         form.phone   || null,
        address:       form.address || null,
        email:         form.email   || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const fields = completionFields(profile ?? null);
  const doneCount = fields.filter(f => f.done).length;
  const pct = fields.length ? Math.round((doneCount / fields.length) * 100) : 0;

  const T = (en: string, es: string) => lang === "en" ? en : es;
  const fieldClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500/40 focus:border-terracotta-500";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8 flex items-center gap-3">
        <SettingsIcon size={20} className="text-terracotta-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {T("Settings", "Configuración")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {T("Employer profile & account details", "Perfil del empleador y datos de la cuenta")}
          </p>
        </div>
      </div>

      {/* Completion card */}
      {!loading && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-terracotta-400" />
              <span className="text-sm font-semibold text-gray-800">
                {T("Profile completion", "Completitud del perfil")}
              </span>
            </div>
            <span className={`text-sm font-bold ${pct === 100 ? "text-sage-600" : "text-terracotta-600"}`}>
              {pct}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div
              className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-sage-500" : "bg-terracotta-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="space-y-1.5">
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-2 text-sm">
                {f.done
                  ? <CheckCircle2 size={14} className="text-sage-500 shrink-0" />
                  : <Circle       size={14} className="text-gray-300 shrink-0" />}
                <span className={f.done ? "text-gray-500 line-through" : "text-gray-700"}>
                  {f.label[lang]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Profile form */}
      <Card>
        <h2 className="font-semibold text-gray-800 mb-5">
          {T("Employer details", "Datos del empleador")}
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {T("Business / household name", "Nombre del hogar o negocio")}
                <span className="text-terracotta-500 ml-1">*</span>
              </label>
              <input
                className={fieldClass}
                value={form.business_name}
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                placeholder={T("e.g. Casa García", "ej. Casa García")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {T("Contact email", "Correo de contacto")}
                </label>
                <input
                  type="email"
                  className={fieldClass}
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="empleador@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {T("Phone", "Teléfono")}
                </label>
                <input
                  className={fieldClass}
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+52 55 1234 5678"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                RFC
                <span className="text-gray-400 text-xs ml-2">
                  {T("(optional, 13 chars)", "(opcional, 13 caracteres)")}
                </span>
              </label>
              <input
                className={fieldClass}
                value={form.rfc}
                onChange={e => setForm(f => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                maxLength={13}
                placeholder="XAXX010101000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {T("Home / work address", "Domicilio donde trabaja la trabajadora")}
              </label>
              <textarea
                className={`${fieldClass} resize-none`}
                rows={3}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder={T("Street, neighborhood, city, state, ZIP", "Calle, colonia, ciudad, estado, CP")}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" loading={saving}>
                {T("Save changes", "Guardar cambios")}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-sage-600 font-medium">
                  <CheckCircle2 size={14} />
                  {T("Saved!", "¡Guardado!")}
                </span>
              )}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
