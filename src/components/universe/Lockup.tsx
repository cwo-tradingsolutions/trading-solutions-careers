/**
 * Lockup ink RECO A. El mismo PNG del hub y de la encuesta.
 * Se muestra a 176×22. No es el mark Universe ni el chip lima.
 */
export default function Lockup({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/wxm-trading-solutions-lockup-ink-RECO-A.png"
      alt="Trading Solutions."
      width={176}
      height={22}
      className={`block h-[22px] w-[176px] object-contain object-left ${className}`}
    />
  );
}
