"use client"

import { Eraser, PenLine } from "lucide-react"
import { useRef, useState, type PointerEvent } from "react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface SignaturePadProps {
  /** Accessible name of the drawing surface, e.g. "Patient signature". */
  readonly label: string
  /** Called with a PNG data URL after each stroke, or `null` when cleared. */
  readonly onChange: (dataUrl: string | null) => void
  readonly disabled?: boolean
  /** Surface height in px (default 160). */
  readonly height?: number
  readonly className?: string
  readonly "data-testid"?: string
}

const STROKE_WIDTH = 2.25

/** Matches the canvas backing store to its CSS size × device pixel ratio (only while empty). */
function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1
  const width = Math.round(canvas.clientWidth * ratio)
  const height = Math.round(canvas.clientHeight * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext("2d")
  if (!context) return null
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.lineCap = "round"
  context.lineJoin = "round"
  context.lineWidth = STROKE_WIDTH
  // Ink follows the text colour token (currentColor), so it stays legible in light and dark themes.
  context.strokeStyle = getComputedStyle(canvas).color
  return context
}

function pointFrom(event: PointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

/**
 * Presentational signature capture (mouse, pen, touch). Emits a PNG data URL — the caller decides
 * what to do with it (the demo keeps it in memory only). Pair it with a typed signer name as the
 * keyboard-accessible attestation.
 */
export function SignaturePad({ label, onChange, disabled = false, height = 160, className, "data-testid": testId = "signature-pad" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokeRef = useRef<{ context: CanvasRenderingContext2D; last: { x: number; y: number } } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const canvas = event.currentTarget
    const context = hasInk ? canvas.getContext("2d") : prepareCanvas(canvas)
    if (!context) return
    canvas.setPointerCapture(event.pointerId)
    const point = pointFrom(event)
    context.beginPath()
    context.arc(point.x, point.y, STROKE_WIDTH / 2, 0, Math.PI * 2)
    context.fillStyle = context.strokeStyle
    context.fill()
    strokeRef.current = { context, last: point }
  }

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current
    if (!stroke) return
    const point = pointFrom(event)
    stroke.context.beginPath()
    stroke.context.moveTo(stroke.last.x, stroke.last.y)
    stroke.context.lineTo(point.x, point.y)
    stroke.context.stroke()
    stroke.last = point
  }

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!strokeRef.current) return
    strokeRef.current = null
    setHasInk(true)
    onChange(event.currentTarget.toDataURL("image/png"))
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className={cn("space-y-2", className)} data-testid={testId}>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-dashed border-input bg-background",
          disabled && "opacity-50",
          hasInk && "border-solid"
        )}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={hasInk ? `${label}: signed` : `${label}: empty — draw with finger, pen or mouse`}
          className="block w-full cursor-crosshair touch-none text-foreground"
          style={{ height }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          data-testid={`${testId}-canvas`}
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-8 flex items-end gap-2 border-b border-border text-muted-foreground">
          <span className="pb-1 text-sm">✕</span>
        </div>
        {!hasInk && (
          <p aria-hidden className="pointer-events-none absolute inset-x-0 top-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <PenLine className="size-3.5" /> Sign here
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {hasInk ? "Signature captured" : "No signature yet"}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || !hasInk} className="min-h-11" data-testid={`${testId}-clear`}>
          <Eraser aria-hidden /> Clear
        </Button>
      </div>
    </div>
  )
}
