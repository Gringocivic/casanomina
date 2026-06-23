import { SignIn } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";

export function SignInPage() {
  const [params] = useSearchParams();
  const redirectUrl = params.get("redirect_url") ?? "/";

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-terracotta-500 flex items-center justify-center text-white font-bold">
          CN
        </div>
        <span className="text-xl font-bold text-gray-900">CasaNomina</span>
      </div>
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl={redirectUrl} forceRedirectUrl={redirectUrl !== "/" ? redirectUrl : undefined} />
    </div>
  );
}
