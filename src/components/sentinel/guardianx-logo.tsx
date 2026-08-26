import { cn } from "@/lib/utils";

/**
 * GuardianX Spinning Neon Logo.
 *
 * Renders the transparent GuardianX shield logo with:
 *  - Continuous rotation (8s linear infinite)
 *  - Pulsing emerald + cyan neon glow (drop-shadow, no frame)
 *  - Diagonal shine sweep every 3s
 *  - 4 twinkling sparkles orbiting the logo
 *
 * @param size   - pixel size (width = height). Default 48.
 * @param spin   - whether to spin. Default true (set false for favicon-like static use)
 * @param className - extra classes on the wrapper
 *
 * The image itself has its background removed (transparent PNG), so it
 * blends into any backdrop. No border or frame is added.
 */
export function GuardianXLogo({
  size = 48,
  spin = true,
  className,
}: {
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  const sizeBucket = size <= 24 ? "sm" : size >= 72 ? "lg" : "md";
  return (
    <span
      className={cn("gx-logo-wrap", className)}
      data-size={sizeBucket}
      style={{ width: size, height: size }}
      aria-label="GuardianX logo"
      role="img"
    >
      <img
        src="/guardianx-logo.png"
        alt="GuardianX"
        width={size}
        height={size}
        className={spin ? "gx-spin-logo" : undefined}
        style={{ width: size, height: size, objectFit: "contain" }}
        draggable={false}
      />
      {/* Shine sweep overlay */}
      {spin && <span className="gx-shine-overlay" aria-hidden />}
      {/* Sparkles */}
      {spin && (
        <>
          <span className="gx-sparkle gx-sparkle-1" aria-hidden />
          <span className="gx-sparkle gx-sparkle-2" aria-hidden />
          <span className="gx-sparkle gx-sparkle-3" aria-hidden />
          <span className="gx-sparkle gx-sparkle-4" aria-hidden />
        </>
      )}
    </span>
  );
}
