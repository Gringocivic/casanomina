/** Displays a peso amount with consistent formatting. */
export function MoneyAmount({
  amount,
  size = "md",
  className = "",
}: {
  amount: number | string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const n = Number(amount);
  const formatted = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);

  const sizes = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl font-bold" };

  return (
    <span className={`font-semibold tabular-nums ${sizes[size]} ${className}`}>{formatted}</span>
  );
}
