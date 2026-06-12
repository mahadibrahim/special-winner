"use client"

/**
 * Brand-graded image. Thin wrapper over the `.graded` CSS pattern
 * (globals.css) so React islands and Astro pages share one mechanism.
 * Drop the wrapper (or the class) to un-grade an image when real
 * photography replaces stock. See docs/design-system.md.
 */
interface GradedImageProps {
  src: string
  alt: string
  /** emerald = youth contexts; navy (default) = everything else */
  variant?: "navy" | "emerald"
  className?: string
  loading?: "eager" | "lazy"
}

export function GradedImage({ src, alt, variant = "navy", className = "", loading = "lazy" }: GradedImageProps) {
  return (
    <div className={`graded ${variant === "emerald" ? "graded--emerald" : ""} ${className}`}>
      <img src={src} alt={alt} loading={loading} />
    </div>
  )
}
