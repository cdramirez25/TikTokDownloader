from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import yt_dlp
import os
import subprocess
import base64
import urllib.request
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
        for file in TEMP_DIR.iterdir():
            if file.is_file():
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


def fetch_thumbnail_as_base64(thumbnail_url: str, platform: str) -> str:
    """Descarga la miniatura y la retorna como data URL base64 para evitar CORS."""
    if not thumbnail_url:
        return ''
    try:
        req = urllib.request.Request(thumbnail_url, headers=build_http_headers(platform))
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            if len(data) > 3 * 1024 * 1024:
                return thumbnail_url  # Demasiado grande, usar URL directa
            content_type = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0]
            b64 = base64.b64encode(data).decode('utf-8')
            return f"data:{content_type};base64,{b64}"
    except Exception as e:
        logger.warning(f"⚠️ No se pudo descargar thumbnail, usando URL: {e}")
        return thumbnail_url


def find_downloaded_file(video_id: str) -> Path | None:
    """Busca el archivo descargado por video_id, ignorando la extensión."""
    files = list(TEMP_DIR.glob(f"{video_id}.*"))
    # Preferir .mp4 si ya existe
    for f in files:
        if f.suffix.lower() == '.mp4':
            return f
    return files[0] if files else None


def ensure_mp4(source_path: Path, video_id: str) -> Path:
    """Convierte el archivo a .mp4 si no lo es ya, usando FFmpeg."""
    if source_path.suffix.lower() == '.mp4':
        return source_path

    mp4_path = TEMP_DIR / f"{video_id}.mp4"
    logger.info(f"🔄 Convirtiendo {source_path.name} → mp4")

    try:
        # Intentar primero con stream copy (sin re-encodear, más rápido)
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', str(source_path), '-c', 'copy', str(mp4_path)],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0 and mp4_path.exists():
            source_path.unlink()
            logger.info(f"✅ Convertido a mp4 (stream copy)")
            return mp4_path

        # Si el copy falló, re-encodear
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', str(source_path),
             '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart',
             str(mp4_path)],
            capture_output=True, text=True, timeout=180
        )
        if result.returncode == 0 and mp4_path.exists():
            source_path.unlink()
            logger.info(f"✅ Convertido a mp4 (re-encode)")
            return mp4_path

        logger.error(f"❌ FFmpeg falló: {result.stderr}")
    except Exception as e:
        logger.error(f"❌ Error en conversión: {e}")

    return source_path  # Devolver original si falló la conversión


app = FastAPI(
    title="TikTok & Instagram Downloader API",
    description="API para descargar videos de TikTok e Instagram sin marca de agua",
    version="2.0.0",
    lifespan=lifespan
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
origins = ["*"] if ALLOWED_ORIGINS == "*" else [o.strip() for o in ALLOWED_ORIGINS.split(",")]

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
    return {"message": "TikTok & Instagram Downloader API", "status": "running", "version": "2.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "social-downloader-api"}


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

                # Descargar thumbnail en el backend para evitar CORS
                raw_thumbnail = info.get('thumbnail', '')
                thumbnail = fetch_thumbnail_as_base64(raw_thumbnail, platform)

                logger.info(f"✅ Información obtenida: {title} por {author}")

                return VideoResponse(
                    title=title,
                    author=author,
                    thumbnail=thumbnail,
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
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")


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

        # Usar %(ext)s para que yt-dlp asigne la extensión real del formato descargado
        ydl_opts = {
            'format': (
                'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
            ),
            'outtmpl': str(TEMP_DIR / video_id) + '.%(ext)s',
            'merge_output_format': 'mp4',
            'postprocessors': [{
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'mp4',
            }],
            'keepvideo': False,
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

            except yt_dlp.utils.DownloadError as e:
                logger.error(f"❌ Error al descargar: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail="No se pudo descargar el video. Verifica que la URL sea válida."
                )

        # Buscar el archivo real descargado (la extensión puede diferir)
        output_path = find_downloaded_file(video_id)
        if not output_path:
            raise HTTPException(
                status_code=500,
                detail="Error: el video se descargó pero no se encontró el archivo"
            )

        # Garantizar que la salida sea .mp4 compatible
        output_path = ensure_mp4(output_path, video_id)

        file_size = output_path.stat().st_size / (1024 * 1024)
        logger.info(f"✅ [{platform.upper()}] Listo: {width}x{height} ({file_size:.2f} MB) → {output_path.name}")

        background_tasks.add_task(remove_file, output_path)

        return FileResponse(
            path=str(output_path),
            media_type='video/mp4',
            filename=f"{safe_title}_HD.mp4"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error interno en descarga: {str(e)}")
        if output_path and output_path.exists():
            output_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
