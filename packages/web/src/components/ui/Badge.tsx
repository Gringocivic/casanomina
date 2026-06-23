import type { ReactNode } from "react";

type Variant = "success" | "warning" | "error" | "info" | "neutral";

const VARIANTS: Record<Variant, string> = {
  success: "bg-sage-100 text-sage-800 border-sage-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  error:   "bg-red-100 text-red-800 border-red-200",
  info:    "bg-blue-100 text-blue-800 border-blue-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: Variant }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}
