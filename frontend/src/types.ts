/**
 * ═══════════════════════════════════════════════════════════════
 * TYPES.TS - Definiciones de Tipos para TikTok Downloader
 * ═══════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────
// TIPOS DE VIDEO
// ─────────────────────────────────────────────────────────────

export interface VideoData {
  title: string
  author: string
  thumbnail: string
  video_id: string
  duration: number
}

// ─────────────────────────────────────────────────────────────
// TIPOS DE ESTADO DEL SERVIDOR
// ─────────────────────────────────────────────────────────────

export interface ServerStatus {
  isAwake: boolean
  isWaking: boolean
  lastCheck: number
}

// ─────────────────────────────────────────────────────────────
// TIPOS DE ERRORES
// ─────────────────────────────────────────────────────────────

export interface APIError {
  detail: string
  status?: number
  code?: string
}

export interface NetworkError extends Error {
  code?: string
  status?: number
  response?: {
    status: number
    statusText: string
    data?: unknown
  }
}

// Type guard para verificar si es un NetworkError
export const isNetworkError = (error: unknown): error is NetworkError => {
  return error instanceof Error && 'code' in error
}

// Type guard para verificar si es un APIError
export const isAPIError = (error: unknown): error is APIError => {
  return typeof error === 'object' && error !== null && 'detail' in error
}

// ─────────────────────────────────────────────────────────────
// TIPOS DE FETCH
// ─────────────────────────────────────────────────────────────

export interface FetchOptions extends RequestInit {
  timeout?: number
}

export type FetchFunction = (
  url: string,
  options?: FetchOptions,
  timeout?: number
) => Promise<Response>

// ─────────────────────────────────────────────────────────────
// TIPOS DE FUNCIONES PRINCIPALES
// ─────────────────────────────────────────────────────────────

export type OperationFunction = () => Promise<void>

export type HealthCheckFunction = (showUI?: boolean) => Promise<boolean>

export type WakeServerFunction = (
  operation: OperationFunction,
  maxRetries?: number
) => Promise<void>

// ─────────────────────────────────────────────────────────────
// CONSTANTES DE ERROR (Para detección de cold start)
// ─────────────────────────────────────────────────────────────

export const COLD_START_ERROR_INDICATORS = [
  'failed to fetch',
  'network error',
  'timeout',
  'aborted',
  'networkerror',
  'connection refused',
  'econnrefused'
] as const

export type ColdStartErrorIndicator = typeof COLD_START_ERROR_INDICATORS[number]

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE TIMEOUTS
// ─────────────────────────────────────────────────────────────

export interface TimeoutConfig {
  healthCheck: number
  initialRequest: number
  download: number
  retryDelay: number
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  healthCheck: 90000,      // 90 segundos
  initialRequest: 90000,   // 90 segundos
  download: 120000,        // 120 segundos
  retryDelay: 5000         // 5 segundos
}

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE REINTENTOS
// ─────────────────────────────────────────────────────────────

export interface RetryConfig {
  maxRetries: number
  currentRetry: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,    // 3 intentos en total (0, 1, 2)
  currentRetry: 0
}