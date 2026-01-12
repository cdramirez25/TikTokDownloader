from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import yt_dlp
import os
from dotenv import load_dotenv
import uuid
from pathlib import Path
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Crear directorio temporal para videos
TEMP_DIR = Path("temp_videos")
TEMP_DIR.mkdir(exist_ok=True)

# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Limpiar archivos antiguos al iniciar
    logger.info("🚀 Iniciando servidor...")
    logger.info("🧹 Limpiando archivos temporales antiguos...")
    cleanup_temp_files()
    yield
    # Shutdown: Limpiar todos los archivos temporales
    logger.info("🛑 Cerrando servidor...")
    logger.info("🧹 Limpiando archivos temporales...")
    cleanup_temp_files()

def cleanup_temp_files():
    """Limpia todos los archivos MP4 en el directorio temporal"""
    try:
        for file in TEMP_DIR.glob("*.mp4"):
            try:
                file.unlink()
                logger.info(f"✅ Eliminado: {file.name}")
            except Exception as e:
                logger.error(f"❌ No se pudo eliminar {file.name}: {e}")
    except Exception as e:
        logger.error(f"❌ Error al limpiar archivos: {e}")

def remove_file(path: Path):
    """Elimina un archivo específico después de enviarlo al cliente"""
    try:
        if path.exists():
            path.unlink()
            logger.info(f"🗑️ Archivo eliminado: {path.name}")
    except Exception as e:
        logger.error(f"❌ Error al eliminar {path.name}: {e}")

# Crear aplicación FastAPI
app = FastAPI(
    title="TikTok Downloader API",
    description="API para descargar videos de TikTok sin marca de agua",
    version="1.0.0",
    lifespan=lifespan
)

# Configurar CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")

if ALLOWED_ORIGINS == "*":
    origins = ["*"]
else:
    origins = [origin.strip() for origin in ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(f"🔒 CORS configurado con orígenes: {origins}")

# Modelos Pydantic
class URLRequest(BaseModel):
    url: str

class VideoResponse(BaseModel):
    title: str
    author: str
    thumbnail: str
    video_id: str
    duration: int

# Rutas de la API
@app.get("/")
def read_root():
    """Endpoint raíz - Health check básico"""
    return {
        "message": "TikTok Downloader API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    """Health check endpoint para Render"""
    return {
        "status": "healthy",
        "service": "tiktok-downloader-api"
    }

@app.post("/api/download", response_model=VideoResponse)
async def get_video_info(request: URLRequest):
    """
    Obtiene información del video de TikTok sin descargarlo
    """
    try:
        logger.info(f"📥 Solicitando información del video: {request.url}")
        
        # Configuración de yt-dlp para extraer información
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'nocheckcertificate': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.tiktok.com/',
            },
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Extraer información del video
                info = ydl.extract_info(request.url, download=False)
                
                # Generar ID único para el video
                video_id = str(uuid.uuid4())
                
                title = info.get('title', 'Video de TikTok')
                author = info.get('uploader', 'Desconocido')
                
                logger.info(f"✅ Información obtenida: {title} por {author}")

                return VideoResponse(
                    title=title,
                    author=author,
                    thumbnail=info.get('thumbnail', ''),
                    video_id=video_id,
                    duration=int(info.get('duration', 0))
                )
            
            except yt_dlp.utils.DownloadError as e:
                logger.error(f"❌ Error de yt-dlp: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail=f"No se pudo procesar el video. Verifica que la URL sea válida y el video esté disponible."
                )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error interno: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )

@app.post("/api/download-file")
async def download_video_file(request: URLRequest, background_tasks: BackgroundTasks):
    """
    Descarga el video en la MEJOR CALIDAD DISPONIBLE
    TikTok generalmente solo ofrece una calidad por video
    
    El archivo se elimina automáticamente después de enviarlo al cliente
    """
    output_path = None
    
    try:
        logger.info(f"📥 Iniciando descarga de video: {request.url}")
        
        # Generar nombre único para el archivo temporal
        video_id = str(uuid.uuid4())
        output_path = TEMP_DIR / f"{video_id}.mp4"
        
        # Configuración optimizada de yt-dlp
        ydl_opts = {
            'format': (
                'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/'
                'bestvideo+bestaudio/best'
            ),
            'outtmpl': str(output_path),
            'merge_output_format': 'mp4',
            'postprocessors': [{
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'mp4',
            }],
            'keepvideo': True,
            'audio_quality': 0,
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.tiktok.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
            },
            'concurrent_fragment_downloads': 5,
            'retries': 3,
            'fragment_retries': 3,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Descargar video
                info = ydl.extract_info(request.url, download=True)
                
                # Obtener información del video
                title = info.get('title', 'video')
                safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title[:50]
                
                width = info.get('width', 0)
                height = info.get('height', 0)
                
                # Verificar que el archivo existe
                if not output_path.exists():
                    raise HTTPException(
                        status_code=500,
                        detail="Error: el video se descargó pero no se encuentra el archivo"
                    )
                
                file_size = output_path.stat().st_size / (1024 * 1024)
                logger.info(f"✅ Video descargado: {width}x{height} ({file_size:.2f} MB)")
                
                # Programar eliminación del archivo después de enviarlo
                background_tasks.add_task(remove_file, output_path)
                
                return FileResponse(
                    path=str(output_path),
                    media_type='video/mp4',
                    filename=f"{safe_title}_HD.mp4"
                )
            
            except yt_dlp.utils.DownloadError as e:
                logger.error(f"❌ Error al descargar: {str(e)}")
                if output_path and output_path.exists():
                    output_path.unlink()
                raise HTTPException(
                    status_code=400,
                    detail=f"No se pudo descargar el video. Verifica que la URL sea válida."
                )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error interno en descarga: {str(e)}")
        if output_path and output_path.exists():
            output_path.unlink()
        raise HTTPException(
            status_code=500,
            detail=f"Error interno: {str(e)}"
        )

# Para desarrollo local
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )