"use client"

import { cn } from "@/lib/utils"
import { useEffect, useId, useMemo, useRef, useState } from "react"

type LinkedVisualShaderProps = {
  className?: string
  intensity?: number
  speed?: number
  colors?: [string, string, string]
}

type RGB = [number, number, number]

const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentShaderSource = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_seed;
uniform vec3 u_color_a;
uniform vec3 u_color_b;
uniform vec3 u_color_c;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(18.3, 7.1);
    amplitude *= 0.55;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv - 0.5;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);

  float t = u_time * 0.001 * (0.65 + u_intensity * 0.45);
  vec2 flow = vec2(
    fbm(p * (2.8 + u_intensity) + vec2(t * 0.7 + u_seed, -t * 0.2)),
    fbm(p * (3.4 + u_intensity * 0.7) + vec2(-t * 0.3, t * 0.55 + u_seed * 0.5))
  );
  float wave = fbm(p * 4.0 + flow * 2.3 + vec2(t * 1.1, -t * 0.8));
  float ring = smoothstep(1.12, 0.18, length(p * vec2(1.0, 1.15)));
  float edge = pow(1.0 - smoothstep(0.0, 0.72, ring), 1.7);
  float veil = smoothstep(0.15, 0.95, wave) * ring;
  float pulse = 0.55 + 0.45 * sin(t * 1.8 + (p.x + p.y) * 7.0 + u_seed * 6.2831);

  vec3 color = mix(u_color_a, u_color_b, clamp(wave * 1.2, 0.0, 1.0));
  color = mix(color, u_color_c, smoothstep(0.48, 0.95, wave + pulse * 0.2));

  float alpha = clamp((veil * 0.34 + edge * 0.58 + ring * 0.08) * (0.45 + u_intensity * 0.75), 0.0, 0.72);
  gl_FragColor = vec4(color, alpha);
}
`

function hexToRgb(value: string): RGB {
  const normalized = value.replace("#", "").trim()
  const sixDigit =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized

  if (!/^[0-9a-f]{6}$/i.test(sixDigit)) {
    return [1, 1, 1]
  }

  const int = Number.parseInt(sixDigit, 16)
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ]
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  return program
}

export function LinkedVisualShader({
  className,
  intensity = 0.8,
  speed = 1,
  colors = ["#7dd3fc", "#c084fc", "#f472b6"],
}: LinkedVisualShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [supported, setSupported] = useState(true)
  const seedId = useId()

  const palette = useMemo(() => colors.map(hexToRgb) as [RGB, RGB, RGB], [colors])
  const seed = useMemo(() => {
    let hash = 0
    for (let index = 0; index < seedId.length; index += 1) {
      hash = (hash * 31 + seedId.charCodeAt(index)) % 997
    }
    return hash / 997
  }, [seedId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const mediaQuery =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null
    const shouldReduceMotion = mediaQuery?.matches ?? false

    const gl =
      canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true }) ||
      canvas.getContext("experimental-webgl", {
        alpha: true,
        premultipliedAlpha: true,
      })

    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      setSupported(false)
      return
    }

    const program = createProgram(gl)
    if (!program) {
      setSupported(false)
      return
    }

    setSupported(true)
    gl.useProgram(program)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW
    )

    const positionLocation = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const resolutionLocation = gl.getUniformLocation(program, "u_resolution")
    const timeLocation = gl.getUniformLocation(program, "u_time")
    const intensityLocation = gl.getUniformLocation(program, "u_intensity")
    const seedLocation = gl.getUniformLocation(program, "u_seed")
    const colorALocation = gl.getUniformLocation(program, "u_color_a")
    const colorBLocation = gl.getUniformLocation(program, "u_color_b")
    const colorCLocation = gl.getUniformLocation(program, "u_color_c")

    const [colorA, colorB, colorC] = palette

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(bounds.width * pixelRatio))
      const height = Math.max(1, Math.floor(bounds.height * pixelRatio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const render = (timestamp: number) => {
      resize()
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.uniform1f(timeLocation, timestamp * speed)
      gl.uniform1f(intensityLocation, intensity)
      gl.uniform1f(seedLocation, seed)
      gl.uniform3f(colorALocation, colorA[0], colorA[1], colorA[2])
      gl.uniform3f(colorBLocation, colorB[0], colorB[1], colorB[2])
      gl.uniform3f(colorCLocation, colorC[0], colorC[1], colorC[2])
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      if (!shouldReduceMotion) {
        rafRef.current = window.requestAnimationFrame(render)
      }
    }

    resize()
    if (shouldReduceMotion) {
      render(4200)
    } else {
      rafRef.current = window.requestAnimationFrame(render)
    }

    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(resize)
      resizeObserverRef.current.observe(canvas)
    } else {
      window.addEventListener("resize", resize)
    }

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
      resizeObserverRef.current?.disconnect()
      window.removeEventListener("resize", resize)
      if (positionBuffer) gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
    }
  }, [intensity, palette, seed, speed])

  if (!supported) {
    return (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.22),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(192,132,252,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.18),transparent_38%)]",
          className
        )}
      />
    )
  }

  return <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none absolute inset-0", className)} />
}
