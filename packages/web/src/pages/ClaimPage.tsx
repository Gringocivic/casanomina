/**
 * pages/ClaimPage.tsx
 *
 * The landing page for an invite link: /claim/:token
 *
 * Flow:
 *   1. Fetches public invite info (worker name, employer, status).
 *   2. Signed-out  → stores token in sessionStorage, links to sign-in/sign-up
 *      so Clerk bounces back here after auth (sign-in) or to onboarding (sign-up).
 *   3. Signed-in as worker, pending invite → auto-claims, redirects to /.
 *   4. Signed-in as employer → shows a "wrong account" error.
 *   5. Already claimed → shows confirmation.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { api } from "../lib/api";
import { useLanguage } from "../hooks/useLanguage";
import { CheckCircle2, HardHat, Loader2, AlertCircle } from "lucide-react";

export const PENDING_CLAIM_KEY = "casanomina_pending_claim";

export function ClaimPage() {
  const { token } = useParams<{ token: string }>();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [invite, setInvite] = useState<{
    worker_name: string;
    employer_name: string | null;
    invite_status: string;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Fetch public invite info
  useEffect(() => {
    if (!token) return;
    api.employments.invite(token)
      .then(setInvite)
      .catch((e) => setInviteError(e.message));
  }, [token]);

  // Once signed in with a pending invite → register as worker (if needed) then claim
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || !invite) return;
    const role = user?.publicMetadata?.role as string | undefined;
    // Employers can't claim worker invites
    if (role === "employer") return;
    if (invite.invite_status === "claimed" || claimed) return;

    setClaiming(true);
    (async () => {
      try {
        // If no role yet, register as worker first
        if (!role) {
          await api.auth.registerRole({ role: "worker", full_name: invite.worker_name });
          await user?.reload();
        }
        await api.employments.claim(token);
        sessionStorage.removeItem(PENDING_CLAIM_KEY);
        await user?.reload();
        setClaimed(true);
        setTimeout(() => navigate("/", { replace: true }), 2000);
      } catch (e: any) {
        setClaimError(e.message);
        setClaiming(false);
      }
    })();
  }, [isLoaded, isSignedIn, invite, token]);

  const role = user?.publicMetadata?.role as string | undefined;

  // ── Loading invite ──────────────────────────────────────────────────
  if (!invite && !inviteError) {
    return (
      <Shell lang={lang}>
        <Loader2 size={32} className="animate-spin text-terracotta-400 mx-auto mb-4" />
        <p className="text-gray-400 text-sm text-center">
          {lang === "en" ? "Loading invite…" : "Cargando invitación…"}
        </p>
      </Shell>
    );
  }

  // ── Invite not found ────────────────────────────────────────────────
  if (inviteError) {
    return (
      <Shell lang={lang}>
        <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">
          {lang === "en" ? "Invite not found" : "Invitación no encontrada"}
        </h2>
        <p className="text-gray-500 text-sm text-center">
          {lang === "en"
            ? "This link may have expired or already been used."
            : "Este enlace puede haber expirado o ya fue usado."}
        </p>
      </Shell>
    );
  }

  // ── Already claimed ─────────────────────────────────────────────────
  if (invite!.invite_status === "claimed" || claimed) {
    return (
      <Shell lang={lang}>
        <CheckCircle2 size={48} className="text-sage-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          {lang === "en" ? "Already joined!" : "¡Ya estás dentro!"}
        </h2>
        <p className="text-gray-500 text-sm text-center mb-6">
          {lang === "en"
            ? `${invite!.worker_name} is linked to this employer.`
            : `${invite!.worker_name} ya está vinculada con este empleador.`}
        </p>
        <Link to="/" className="block text-center text-sm text-terracotta-600 font-medium hover:underline">
          {lang === "en" ? "Go to worker portal →" : "Ir al portal de trabajadora →"}
        </Link>
      </Shell>
    );
  }

  // ── Signed-in as employer (wrong account) ───────────────────────────
  if (isLoaded && isSignedIn && role === "employer") {
    return (
      <Shell lang={lang}>
        <AlertCircle size={40} className="text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">
          {lang === "en" ? "Wrong account type" : "Tipo de cuenta incorrecto"}
        </h2>
        <p className="text-gray-500 text-sm text-center">
          {lang === "en"
            ? "This invite is for workers. Please sign in with a worker account."
            : "Esta invitación es para trabajadoras. Por favor inicia sesión con una cuenta de trabajadora."}
        </p>
      </Shell>
    );
  }

  // ── Claiming in progress ────────────────────────────────────────────
  if (claiming) {
    return (
      <Shell lang={lang}>
        <Loader2 size={32} className="animate-spin text-terracotta-400 mx-auto mb-4" />
        <p className="text-gray-500 text-sm text-center">
          {lang === "en" ? "Linking your account…" : "Vinculando tu cuenta…"}
        </p>
      </Shell>
    );
  }

  // ── Signed-out — show invite info + auth links ──────────────────────
  const claimUrl = `/claim/${token}`;
  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(claimUrl)}`;
  const signUpUrl = `/sign-up?redirect_url=${encodeURIComponent(claimUrl)}`;

  function handleSignUp() {
    sessionStorage.setItem(PENDING_CLAIM_KEY, token!);
    navigate(signUpUrl);
  }

  return (
    <Shell lang={lang}>
      <div className="w-16 h-16 rounded-2xl bg-sage-100 flex items-center justify-center mx-auto mb-6">
        <HardHat size={32} className="text-sage-600" />
      </div>

      <h2 className="text-xl font-bold text-gray-900 text-center mb-1">
        {lang === "en" ? "You've been invited!" : "¡Te han invitado!"}
      </h2>

      <p className="text-gray-500 text-sm text-center mb-1">
        {lang === "en" ? "Joining as:" : "Ingresando como:"}
      </p>
      <p className="text-lg font-semibold text-gray-900 text-center mb-1">
        {invite!.worker_name}
      </p>
      {invite!.employer_name && (
        <p className="text-sm text-gray-400 text-center mb-8">
          {lang === "en" ? `Employer: ${invite!.employer_name}` : `Empleador: ${invite!.employer_name}`}
        </p>
      )}

      {claimError && (
        <p className="text-red-500 text-sm text-center mb-4">{claimError}</p>
      )}

      <div className="space-y-3 w-full">
        <Link
          to={signInUrl}
          className="block w-full text-center bg-terracotta-500 hover:bg-terracotta-600 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {lang === "en" ? "Sign in to accept" : "Iniciar sesión para aceptar"}
        </Link>
        <button
          onClick={handleSignUp}
          className="block w-full text-center border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-xl transition-colors"
        >
          {lang === "en" ? "Create an account" : "Crear una cuenta"}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center mt-6">
        {lang === "en"
          ? "After signing in you'll be able to view your payslips, download your contract, and check your rights."
          : "Al iniciar sesión podrás ver tus recibos, descargar tu contrato y consultar tus derechos."}
      </p>
    </Shell>
  );
}

function Shell({ children, lang }: { children: React.ReactNode; lang: "en" | "es" }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-terracotta-500 flex items-center justify-center text-white font-bold text-sm">
            CN
          </div>
          <span className="text-lg font-bold text-gray-900">CasaNomina</span>
        </div>
        {children}
      </div>
    </div>
  );
}
