import { useState, useEffect } from 'react'

interface VideoData {
  title: string
  author: string
  thumbnail: string
  video_id: string
  duration: number
}

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [videoData, setVideoData] = useState<VideoData | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  // Timer para el cooldown
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => {
        setCooldown(cooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setVideoData(null)

    if (!url.trim()) {
      setError('Por favor ingresa una URL de TikTok')
      return
    }

    // Validar que sea una URL de TikTok
    if (!url.includes('tiktok.com')) {
      setError('La URL debe ser de TikTok')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Error al procesar el video')
      }

      const data = await response.json()
      setVideoData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener información del video')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!videoData || !url) return

    setDownloading(true)
    setError('')

    try {
      // Descargar el video en la mejor calidad disponible
      const response = await fetch(`${API_URL}/api/download-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Error al descargar el video')
      }

      // Obtener el blob del video
      const blob = await response.blob()
      
      // Crear URL temporal y descargar
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${videoData.title.slice(0, 50)}_HD.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)

      // ⏱️ INICIAR COOLDOWN DE 15 SEGUNDOS
      setCooldown(15)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar el archivo')
      console.error('Error de descarga:', err)
    } finally {
      setDownloading(false)
    }
  }

  // Verificar si los botones deben estar deshabilitados
  const isDisabled = loading || downloading || cooldown > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
            TikTok Downloader
          </h1>
          <p className="text-white/90 text-lg">
            Descarga videos sin marca de agua en máxima calidad HD
          </p>
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
                  Procesando...
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

          {/* Cooldown Message */}
          {cooldown > 0 && (
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Video Preview */}
          {videoData && (
            <div className="mt-6 space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <img
                  src={videoData.thumbnail}
                  alt={videoData.title}
                  className="w-full h-auto"
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
                    Descargando en máxima calidad...
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
      </div>
    </div>
  )
}

export default App