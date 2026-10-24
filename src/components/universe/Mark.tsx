/**
 * Universe brand mark: a small dark tile with a Summer Sun square.
 * The lime sits on a dark fill only — never as a page background.
 */
export default function UniverseMark({
  tone = "ink",
  className = "",
}: {
  tone?: "ink" | "on-dark";
  className?: string;
}) {
  const tile =
    tone === "on-dark"
      ? "bg-white/10 border border-white/10"
      : "bg-ts-ink";
  return (
    <span
      className={`inline-grid place-items-center w-7 h-7 rounded-ts-sm shrink-0 ${tile} ${className}`}
      aria-hidden
    >
      <span className="block w-2.5 h-2.5 rounded-[2px] bg-ts-highlight" />
    </span>
  );
}
