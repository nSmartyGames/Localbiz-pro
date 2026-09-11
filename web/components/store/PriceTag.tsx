export function formatRon(value: number): string {
  return (
    value.toLocaleString("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " RON"
  );
}

export function formatPrice(value: number, currency: "RON" | "USD" = "RON"): string {
  return value.toLocaleString("ro-RO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PriceTag({
  priceNow,
  priceOld,
  pricePerMl,
  currency = "RON",
  light = false,
}: {
  priceNow: number | null;
  priceOld: number | null;
  pricePerMl?: number | null;
  currency?: "RON" | "USD";
  light?: boolean;
}) {
  if (priceNow === null) {
    return (
      <div className={`text-sm font-medium ${light ? "text-white/80" : "text-[#6b6b66]"}`}>
        Preț la cerere
      </div>
    );
  }

  const discountPct =
    priceOld && priceOld > priceNow
      ? Math.round(((priceOld - priceNow) / priceOld) * 100)
      : null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`text-lg font-bold ${light ? "text-white" : "text-[#0f1b1a]"}`}>
        {formatPrice(priceNow, currency)}
      </span>
      {priceOld !== null && priceOld > priceNow && (
        <span className={`text-sm ${light ? "text-white/70 line-through" : "text-[#6b6b66]"}`}>
          {formatPrice(priceOld, currency)}
        </span>
      )}
      {discountPct !== null && discountPct > 0 && (
        <span className="rounded bg-[#fbe9e9] px-2 py-0.5 text-xs font-semibold text-[#b23b3b]">
          -{discountPct}%
        </span>
      )}
      {pricePerMl != null && (
        <span className={`w-full text-xs ${light ? "text-white/70" : "text-[#6b6b66]"}`}>
          {pricePerMl.toLocaleString("ro-RO", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          RON / ml
        </span>
      )}
    </div>
  );
}
