import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (!PUBLISHABLE_KEY) {
  root.render(
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 480 }}>
      <h2>⚠️ Clerk not configured</h2>
      <p>
        Create a free Clerk app at{" "}
        <a href="https://clerk.com" target="_blank" rel="noreferrer">clerk.com</a>,
        then add your Publishable Key to{" "}
        <code>packages/web/.env.local</code>:
      </p>
      <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: 6 }}>
        VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
      </pre>
      <p>Restart the Vite dev server after saving.</p>
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        afterSignInUrl="/"
        afterSignUpUrl="/onboarding"
      >
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
}
