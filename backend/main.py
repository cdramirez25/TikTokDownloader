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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

TEMP_DIR = Path("temp_videos")
TEMP_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Iniciando servidor...")
    cleanup_temp_files()
    yield
    logger.info("🛑 Cerrando servidor...")
    cleanup_temp_files()


def cleanup_temp_files():
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
    try:
        if path.exists():
            path.unlink()
            logger.info(f"🗑️ Archivo eliminado: {path.name}")
    except Exception as e:
        logger.error(f"❌ Error al eliminar {path.name}: {e}")


def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if 'tiktok.com' in url_lower or 'vm.tiktok.com' in url_lower:
        return 'tiktok'
    if 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return 'instagram'
    return 'unknown'


def build_http_headers(platform: str) -> dict:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-us,en;q=0.5',
    }
    if platform == 'tiktok':
        headers['Referer'] = 'https://www.tiktok.com/'
    elif platform == 'instagram':
        headers['Referer'] = 'https://www.instagram.com/'
    return headers


app = FastAPI(
    title="TikTok & Instagram Downloader API",
    description="API para descargar videos de TikTok e Instagram sin marca de agua",
    version="2.0.0",
    lifespan=lifespan
)

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


class URLRequest(BaseModel):
    url: str


class VideoResponse(BaseModel):
    title: str
    author: str
    thumbnail: str
    video_id: str
    duration: int
    platform: str


@app.get("/")
def read_root():
    return {
        "message": "TikTok & Instagram Downloader API",
        "status": "running",
        "version": "2.0.0"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "social-downloader-api"
    }


@app.post("/api/download", response_model=VideoResponse)
async def get_video_info(request: URLRequest):
    platform = detect_platform(request.url)
    if platform == 'unknown':
        raise HTTPException(
            status_code=400,
            detail="URL no soportada. Solo se aceptan URLs de TikTok o Instagram."
        )

    try:
        logger.info(f"📥 [{platform.upper()}] Solicitando información: {request.url}")

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'nocheckcertificate': True,
            'http_headers': build_http_headers(platform),
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(request.url, download=False)

                video_id = str(uuid.uuid4())

                default_title = 'Video de TikTok' if platform == 'tiktok' else 'Video de Instagram'
                title = info.get('title') or info.get('description') or default_title
                author = info.get('uploader') or info.get('channel') or 'Desconocido'

                logger.info(f"✅ Información obtenida: {title} por {author}")

                return VideoResponse(
                    title=title,
                    author=author,
                    thumbnail=info.get('thumbnail', ''),
                    video_id=video_id,
                    duration=int(info.get('duration') or 0),
                    platform=platform
                )

            except yt_dlp.utils.DownloadError as e:
                logger.error(f"❌ Error de yt-dlp: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail="No se pudo procesar el video. Verifica que la URL sea válida y el video esté disponible."
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
    platform = detect_platform(request.url)
    if platform == 'unknown':
        raise HTTPException(
            status_code=400,
            detail="URL no soportada. Solo se aceptan URLs de TikTok o Instagram."
        )

    output_path = None

    try:
        logger.info(f"📥 [{platform.upper()}] Iniciando descarga: {request.url}")

        video_id = str(uuid.uuid4())
        output_path = TEMP_DIR / f"{video_id}.mp4"

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
            'http_headers': build_http_headers(platform),
            'concurrent_fragment_downloads': 5,
            'retries': 3,
            'fragment_retries': 3,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(request.url, download=True)

                title = info.get('title') or info.get('description') or 'video'
                safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title[:50]

                width = info.get('width', 0)
                height = info.get('height', 0)

                if not output_path.exists():
                    raise HTTPException(
                        status_code=500,
                        detail="Error: el video se descargó pero no se encuentra el archivo"
                    )

                file_size = output_path.stat().st_size / (1024 * 1024)
                logger.info(f"✅ [{platform.upper()}] Video descargado: {width}x{height} ({file_size:.2f} MB)")

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
                    detail="No se pudo descargar el video. Verifica que la URL sea válida."
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


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
