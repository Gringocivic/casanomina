import { useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn, useAuth, useUser } from "@clerk/clerk-react";
import { LanguageProvider } from "./hooks/useLanguage";
import { setTokenProvider } from "./lib/api";
import { Layout } from "./components/ui/Layout";
import { PublicLayout } from "./components/ui/PublicLayout";
import { Dashboard } from "./pages/Dashboard";
import { Workers } from "./pages/Workers";
import { WorkerProfile } from "./pages/WorkerProfile";
import { Payroll } from "./pages/Payroll";
import { Calendar } from "./pages/Calendar";
import { LawsAndRights } from "./pages/LawsAndRights";
import { Calculators } from "./pages/Calculators";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { Onboarding } from "./pages/Onboarding";
import { ClaimPage } from "./pages/ClaimPage";
import { WorkerHome } from "./pages/WorkerHome";
import { Settings } from "./pages/Settings";
import { PayrollHistory } from "./pages/PayrollHistory";
import { Termination } from "./pages/Termination";
import { WorkerOnboarding } from "./pages/WorkerOnboarding";

function AuthTokenSync() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenProvider(getToken);
    return () => setTokenProvider(null);
  }, [getToken]);
  return null;
}

/**
 * Wraps a public-accessible page.
 * - Signed-in employer   → render inside the full sidebar Layout
 * - Everyone else        → render inside the minimal PublicLayout
 *
 * This lets /calculators and /laws live as top-level routes that are
 * reachable without auth while still feeling native inside the employer app.
 */
function PublicOrEmployerPage({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) return null;

  const role = user?.publicMetadata?.role as string | undefined;

  if (isSignedIn && role === "employer") {
    return <Layout>{children}</Layout>;
  }

  return <PublicLayout>{children}</PublicLayout>;
}

/**
 * Routes the signed-in user to the right portal based on their role.
 * - employer → full employer dashboard
 * - worker   → worker home (placeholder until Phase 6)
 * - no role  → onboarding
 */
function PortalRouter() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return null;

  const role = user?.publicMetadata?.role as string | undefined;

  if (!role) return <Navigate to="/onboarding" replace />;

  if (role === "worker") {
    return <WorkerHome />;
  }

  // employer (default)
  return (
    <Layout>
      <Routes>
        <Route path="/"            element={<Dashboard />} />
        <Route path="/workers"     element={<Workers />} />
        <Route path="/workers/new" element={<WorkerOnboarding />} />
        <Route path="/workers/:id/terminate" element={<Termination />} />
        <Route path="/workers/:id" element={<WorkerProfile />} />
        <Route path="/payroll"     element={<Payroll />} />
        <Route path="/history"     element={<PayrollHistory />} />
        <Route path="/settings"    element={<Settings />} />
        <Route path="/calendar"    element={<Calendar />} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <AuthTokenSync />

        <Routes>
          <Route path="/sign-in/*"  element={<SignInPage />} />
          <Route path="/sign-up/*"  element={<SignUpPage />} />
          <Route path="/onboarding" element={<SignedIn><Onboarding /></SignedIn>} />

          {/* Claim page — fully public, handles its own auth state */}
          <Route path="/claim/:token" element={<ClaimPage />} />

          {/* Public pages — accessible without auth; employers see sidebar layout */}
          <Route path="/calculators" element={<PublicOrEmployerPage><Calculators /></PublicOrEmployerPage>} />
          <Route path="/laws"        element={<PublicOrEmployerPage><LawsAndRights /></PublicOrEmployerPage>} />

          {/* Protected routes — everything else requires sign-in */}
          <Route
            path="/*"
            element={
              <>
                <SignedIn><PortalRouter /></SignedIn>
                <SignedOut><RedirectToSignIn /></SignedOut>
              </>
            }
          />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
