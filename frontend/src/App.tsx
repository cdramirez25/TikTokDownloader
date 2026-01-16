import { useState, useEffect, useRef } from 'react'
import type {
  VideoData,
  ServerStatus,
  FetchFunction,
  HealthCheckFunction,
  WakeServerFunction
} from './types'

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [videoData, setVideoData] = useState<VideoData | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    isAwake: false,
    isWaking: false,
    lastCheck: 0
  })
  const [retryCount, setRetryCount] = useState(0)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const abortControllerRef = useRef<AbortController | null>(null)

  // Health check inicial al cargar la página
  useEffect(() => {
    checkServerHealth()
  }, [])

  // Timer para el cooldown
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => {
        setCooldown(cooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  /**
   * Verifica si el servidor está despierto
   */
  const checkServerHealth: HealthCheckFunction = async (showUI = false) => {
    try {
      if (showUI) {
        setServerStatus(prev => ({ ...prev, isWaking: true }))
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90000) // 90 segundos para cold start

      const response = await fetch(`${API_URL}/health`, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        setServerStatus({
          isAwake: true,
          isWaking: false,
          lastCheck: Date.now()
        })
        return true
      }
      return false
    } catch (err) {
      console.warn('Health check failed:', err)
      return false
    } finally {
      if (showUI) {
        setServerStatus(prev => ({ ...prev, isWaking: false }))
      }
    }
  }

  /**
   * Verifica si un error es por servidor dormido
   */
  const isServerSleepError = (error: unknown): boolean => {
    // Convertir error a string de forma segura
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : ''
    const errorString = String(error).toLowerCase()
    
    // Lista de indicadores de cold start
    const indicators = [
      'failed to fetch',
      'network error',
      'timeout',
      'aborted',
      'networkerror',
      'connection refused',
      'econnrefused'
    ]
    
    // Verificar si algún indicador está presente
    return indicators.some(indicator => 
      errorMessage.includes(indicator) || errorString.includes(indicator)
    )
  }

  /**
   * Intenta despertar el servidor y reintentar la operación
   */
  const wakeServerAndRetry: WakeServerFunction = async (operation, maxRetries = 2) => {
    setServerStatus(prev => ({ ...prev, isWaking: true }))
    setError('⏳ El servidor está iniciando... Esto puede tomar 30-60 segundos.')

    try {
      // Intentar despertar el servidor
      const isAwake = await checkServerHealth(true)
      
      if (!isAwake && retryCount < maxRetries) {
        setRetryCount(prev => prev + 1)
        setError(`⏳ Intento ${retryCount + 1}/${maxRetries + 1}: Esperando que el servidor despierte...`)
        
        // Esperar un poco más antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        // Reintentar health check
        await checkServerHealth(true)
      }

      // Reintentar la operación original
      await operation()
      setRetryCount(0) // Reset contador de reintentos
    } catch (err) {
      console.error('Error al despertar servidor:', err)
      setError('❌ No se pudo conectar con el servidor. Por favor, intenta nuevamente en unos segundos.')
    } finally {
      setServerStatus(prev => ({ ...prev, isWaking: false }))
    }
  }

  /**
   * Realiza una petición con timeout y reintentos automáticos
   */
  const fetchWithTimeout: FetchFunction = async (
    url,
    options = {},
    timeout = 90000 // 90 segundos para primera petición (cold start)
  ) => {
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

    const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), timeout)

    try {
      const response = await fetch(url, { ...options, signal })
      clearTimeout(timeoutId)
      return response
    } catch (err) {
      clearTimeout(timeoutId)
      throw err
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await performVideoSearch()
  }

  const performVideoSearch = async () => {
    setError('')
    setVideoData(null)

    if (!url.trim()) {
      setError('Por favor ingresa una URL de TikTok')
      return
    }

    if (!url.includes('tiktok.com')) {
      setError('La URL debe ser de TikTok')
      return
    }

    setLoading(true)

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/download`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: url.trim() }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Error al procesar el video')
      }

      const data = await response.json()
      setVideoData(data)
      setRetryCount(0) // Reset en caso de éxito
    } catch (err) {
      console.error('Error en búsqueda:', err)

      // Si es un error de servidor dormido, intentar despertar y reintentar
      if (isServerSleepError(err) && retryCount < 2) {
        await wakeServerAndRetry(performVideoSearch)
      } else {
        setError(
          err instanceof Error 
            ? err.message 
            : 'Error al obtener información del video'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const performVideoDownload = async () => {
    if (!videoData || !url) return

    setDownloading(true)
    setError('')

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/download-file`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: url.trim() }),
        },
        120000 // 120 segundos para descarga (puede ser grande)
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Error al descargar el video')
      }

      const blob = await response.blob()
      
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${videoData.title.slice(0, 50)}_HD.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)

      setCooldown(15)
      setRetryCount(0) // Reset en caso de éxito
    } catch (err) {
      console.error('Error de descarga:', err)

      // Si es un error de servidor dormido, intentar despertar y reintentar
      if (isServerSleepError(err) && retryCount < 2) {
        await wakeServerAndRetry(performVideoDownload)
      } else {
        setError(
          err instanceof Error 
            ? err.message 
            : 'Error al descargar el archivo'
        )
      }
    } finally {
      setDownloading(false)
    }
  }

  const handleDownload = async () => {
    await performVideoDownload()
  }

  const isDisabled = loading || downloading || cooldown > 0 || serverStatus.isWaking

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex flex-col justify-between p-4">
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
            TikTok Downloader
          </h1>
          <p className="text-white/90 text-lg">
            Descarga videos sin marca de agua en máxima calidad HD
          </p>
          
          {/* Indicador de estado del servidor */}
          <div className="mt-3 flex justify-center">
            {serverStatus.isAwake && !serverStatus.isWaking && (
              <div className="flex items-center space-x-2 bg-green-500/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white text-sm font-medium">Servidor activo</span>
              </div>
            )}
            {serverStatus.isWaking && (
              <div className="flex items-center space-x-2 bg-yellow-500/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-white text-sm font-medium">Despertando servidor...</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                URL del video de TikTok
              </label>
              <input
                type="text"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@username/video/..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition-all"
                disabled={isDisabled}
              />
            </div>

            <button
              type="submit"
              disabled={isDisabled}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {serverStatus.isWaking ? 'Despertando servidor...' : 'Procesando...'}
                </span>
              ) : serverStatus.isWaking ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Iniciando servidor...
                </span>
              ) : cooldown > 0 ? (
                <span className="flex items-center justify-center">
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Espera {cooldown}s para la siguiente búsqueda
                </span>
              ) : (
                'Obtener Video'
              )}
            </button>
          </form>

          {/* Server Waking Message */}
          {serverStatus.isWaking && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="flex items-start">
                <svg className="animate-spin h-6 w-6 mr-3 text-yellow-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <div>
                  <p className="text-yellow-800 font-semibold">⚡ Despertando el servidor</p>
                  <p className="text-yellow-700 text-sm mt-1">
                    El servidor estaba inactivo. Primera conexión puede tomar 30-60 segundos.
                  </p>
                  <p className="text-yellow-600 text-xs mt-2">
                    💡 Tip: Esto es normal en servidores gratuitos. Después de esto funcionará rápido.
                  </p>
                  {retryCount > 0 && (
                    <p className="text-yellow-700 text-sm mt-2 font-medium">
                      🔄 Reintento {retryCount}/3...
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cooldown Message */}
          {cooldown > 0 && !serverStatus.isWaking && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center">
                <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <p className="text-blue-700 text-sm font-medium">
                  ⏱️ Cooldown activo: {cooldown} segundo{cooldown !== 1 ? 's' : ''} restante{cooldown !== 1 ? 's' : ''}
                </p>
              </div>
              <p className="text-blue-600 text-xs mt-2">
                Esto ayuda a evitar bloqueos de TikTok y garantiza descargas estables
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && !serverStatus.isWaking && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start">
                <svg className="h-5 w-5 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Video Preview */}
          {videoData && !serverStatus.isWaking && (
            <div className="mt-6 space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden flex justify-center">
                <img
                  src={videoData.thumbnail}
                  alt={videoData.title}
                  className="max-w-2xl w-full max-h-125 h-auto object-contain"
                  style={{ display: 'block' }}
                />
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-gray-800 text-lg">
                  {videoData.title}
                </h3>
                <p className="text-gray-600 text-sm">
                  Por: <span className="font-medium">{videoData.author}</span>
                </p>
                {videoData.duration > 0 && (
                  <p className="text-gray-500 text-sm">
                    Duración: {Math.floor(videoData.duration / 60)}:{(videoData.duration % 60).toString().padStart(2, '0')}
                  </p>
                )}
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                  <div className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                    </svg>
                    MÁXIMA CALIDAD HD
                  </div>
                  <div className="flex items-center px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                    </svg>
                    SIN MARCA DE AGUA
                  </div>
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={isDisabled}
                className="w-full bg-green-500 text-white font-semibold py-3 px-6 rounded-xl hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center"
              >
                {downloading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    {serverStatus.isWaking ? 'Despertando servidor...' : 'Descargando en máxima calidad...'}
                  </span>
                ) : serverStatus.isWaking ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Iniciando servidor...
                  </span>
                ) : cooldown > 0 ? (
                  <span className="flex items-center justify-center">
                    <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Espera {cooldown}s para descargar
                  </span>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Descargar Video en Máxima Calidad HD
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/80 text-sm mt-6">
          Pega el enlace del video de TikTok y descárgalo sin marca de agua en HD
        </p>
        
        {/* Info adicional sobre el servidor */}
        <div className="mt-4 text-center">
          <p className="text-white/70 text-xs">
            ℹ️ Si el servidor está inactivo, la primera descarga puede tomar 30-60 segundos
          </p>
        </div>
      </div>
      </div>
      <div className="mb-2 flex flex-col items-center text-center select-none">
        <span className="text-xs text-white/70 font-light">
          Desarrollado por <span className="font-semibold text-white/90">Cristian Ramírez</span> ·
          <a
            href="https://github.com/CristianRC7/TikTokDownloader"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 underline text-blue-200 hover:text-blue-400 transition-colors"
          >
            Dale una estrella ⭐ al repositorio
          </a>
        </span>
      </div>
    </div>
  )
}

export default App