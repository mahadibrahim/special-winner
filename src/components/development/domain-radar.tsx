"use client"

import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/ui/empty-state"
import { radarPoints, sanitizeAxisValue, type RadarAxis } from "@/lib/curriculum/radar-geometry"
import { Target } from "lucide-react"

export type { RadarAxis }

export interface DomainRadarProps {
  /** One per domain — label is the skill_domains display name. */
  axes: RadarAxis[]
  /** Scale ceiling (assessment levels run 1-5). */
  max?: number
  /** SVG viewBox size in user units; scales to its container via CSS. */
  size?: number
  className?: string
}

const MIN_AXES_WITH_DATA = 3;

function pointsToPath(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * Domain radar (spider) chart — visualizes a player's current level across
 * skill domains (technical/tactical/physical/psychological), with an
 * optional dashed "previous" polygon for at-a-glance trend.
 *
 * Pure SVG, no charting library. Geometry lives in
 * `src/lib/curriculum/radar-geometry.ts` (unit tested independently).
 */
export default function DomainRadar({ axes, max = 5, size = 240, className }: DomainRadarProps) {
  // Sanitize all axis values early: non-finite → 0, out-of-range → clamp
  const sanitizedAxes = axes.map((a) => ({
    ...a,
    current: sanitizeAxisValue(a.current, max),
    previous: a.previous !== undefined ? sanitizeAxisValue(a.previous, max) : undefined,
  }));

  const axesWithData = sanitizedAxes.filter((a) => a.current > 0).length;

  if (axes.length < MIN_AXES_WITH_DATA || axesWithData < MIN_AXES_WITH_DATA) {
    return (
      <EmptyState
        title="No assessments yet"
        description="Progress appears here after the first coach assessment."
        icon={<Target className="w-10 h-10" />}
        className={className}
      />
    );
  }

  const n = axes.length;
  const center = size / 2;
  // Reserve a rim around the drawn polygon for axis labels so they stay
  // inside the viewBox instead of overflowing past size/size. Everything
  // that's actually plotted (rings, spokes, polygons) is scaled to
  // `drawSize`, then re-centered onto the full `size` viewBox.
  const PADDING = Math.max(20, size * 0.09);
  const drawSize = size - PADDING * 2;
  const maxRadius = drawSize / 2;
  const labelRadius = maxRadius + PADDING * 0.7;

  const recenter = (points: [number, number][]): [number, number][] =>
    points.map(([x, y]) => [x + PADDING, y + PADDING]);

  const currentValues = sanitizedAxes.map((a) => a.current);
  const currentPolygon = pointsToPath(recenter(radarPoints(currentValues, max, drawSize)));

  const hasPrevious = sanitizedAxes.some((a) => a.previous !== undefined);
  const previousValues = sanitizedAxes.map((a) => a.previous ?? 0);
  const previousPolygon = hasPrevious
    ? pointsToPath(recenter(radarPoints(previousValues, max, drawSize)))
    : null;

  // Grid rings, one polygon per integer level 1..max.
  const rings = Array.from({ length: max }, (_, idx) => {
    const level = idx + 1;
    return recenter(
      radarPoints(
        Array.from({ length: n }, () => level),
        max,
        drawSize,
      ),
    );
  });

  // Axis spokes (center -> full-scale point) + label anchors, computed with
  // the same angle convention as radarPoints (axis 0 at 12 o'clock,
  // clockwise).
  const spokes = sanitizedAxes.map((axis, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const spokeEnd: [number, number] = [
      center + maxRadius * Math.cos(angle),
      center + maxRadius * Math.sin(angle),
    ];
    const labelPos: [number, number] = [
      center + labelRadius * Math.cos(angle),
      center + labelRadius * Math.sin(angle),
    ];
    const cos = Math.cos(angle);
    const textAnchor: "start" | "end" | "middle" = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
    return { axis, spokeEnd, labelPos, textAnchor };
  });

  return (
    <div className={cn("relative w-full flex flex-col items-center", className)}>
      <svg
        data-radar
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto max-w-[320px]"
        role="img"
        aria-label="Domain radar chart"
      >
        {/* Grid rings */}
        <g className="text-ink-faint" stroke="currentColor" fill="none" strokeWidth={1} opacity={0.35}>
          {rings.map((ring, idx) => (
            <polygon key={idx} points={pointsToPath(ring)} />
          ))}
        </g>

        {/* Axis spokes + labels */}
        <g className="text-ink-faint" stroke="currentColor" strokeWidth={1} opacity={0.5}>
          {spokes.map(({ spokeEnd }, i) => (
            <line key={i} x1={center} y1={center} x2={spokeEnd[0]} y2={spokeEnd[1]} />
          ))}
        </g>
        <g className="text-ink-muted" fill="currentColor" fontSize={11}>
          {spokes.map(({ axis, labelPos, textAnchor }, i) => (
            <text key={i} x={labelPos[0]} y={labelPos[1]} textAnchor={textAnchor} dominantBaseline="middle">
              {axis.label}
            </text>
          ))}
        </g>

        {/* Previous snapshot — dashed outline, muted, no fill */}
        {previousPolygon && (
          <polygon
            points={previousPolygon}
            className="text-ink-faint"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="none"
          />
        )}

        {/* Current snapshot — filled, ~25% opacity, solid outline */}
        <polygon
          points={currentPolygon}
          className="text-primary-orange"
          stroke="currentColor"
          strokeWidth={2}
          fill="currentColor"
          fillOpacity={0.25}
        />
      </svg>

      {/* Screen-reader summary — the chart itself conveys no information
          that isn't in this list. */}
      <ul className="sr-only">
        {sanitizedAxes.map((axis) => (
          <li key={axis.label}>
            {axis.label}: {axis.current} of {max}
          </li>
        ))}
      </ul>
    </div>
  )
}
