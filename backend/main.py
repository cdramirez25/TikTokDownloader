from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
import yt_dlp
import os
from dotenv import load_dotenv
import uuid
from pathlib import Path

load_dotenv()

# Crear directorio temporal para videos
TEMP_DIR = Path("temp_videos")
TEMP_DIR.mkdir(exist_ok=True)

# Lifespan event handler para reemplazar on_event
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Limpiar archivos antiguos al iniciar
    print("Limpiando archivos temporales antiguos...")
    cleanup_temp_files()
    yield
    # Shutdown: Limpiar todos los archivos temporales
    print("Limpiando archivos temporales al cerrar...")
    cleanup_temp_files()

def cleanup_temp_files():
    """Limpia todos los archivos MP4 en el directorio temporal"""
    try:
        for file in TEMP_DIR.glob("*.mp4"):
            try:
                file.unlink()
                print(f"Eliminado: {file.name}")
            except Exception as e:
                print(f"No se pudo eliminar {file.name}: {e}")
    except Exception as e:
        print(f"Error al limpiar archivos: {e}")

def remove_file(path: Path):
    """Elimina un archivo específico después de enviarlo al cliente"""
    try:
        if path.exists():
            path.unlink()
            print(f"Archivo eliminado: {path.name}")
    except Exception as e:
        print(f"Error al eliminar {path.name}: {e}")

app = FastAPI(lifespan=lifespan)

# Configurar CORS desde .env
from fastapi.middleware.cors import CORSMiddleware

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

print(f"CORS configurado con orígenes: {origins}")

class URLRequest(BaseModel):
    url: str

class VideoResponse(BaseModel):
    title: str
    author: str
    thumbnail: str
    video_id: str
    duration: int

@app.get("/")
def read_root():
    return {"message": "TikTok Downloader API", "status": "running"}

@app.post("/api/download", response_model=VideoResponse)
async def get_video_info(request: URLRequest):
    try:
        # Configuración de yt-dlp para extraer información
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Extraer información del video
                info = ydl.extract_info(request.url, download=False)
                
                # Generar ID único para el video
                video_id = str(uuid.uuid4())

                return VideoResponse(
                    title=info.get('title', 'Video de TikTok'),
                    author=info.get('uploader', 'Desconocido'),
                    thumbnail=info.get('thumbnail', ''),
                    video_id=video_id,
                    duration=int(info.get('duration', 0))
                )
            
            except yt_dlp.utils.DownloadError as e:
                raise HTTPException(status_code=400, detail=f"Error al procesar el video: {str(e)}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {str(e)}")

@app.post("/api/download-file")
async def download_video_file(request: URLRequest, background_tasks: BackgroundTasks):
    """
    Descarga el video en la MEJOR CALIDAD DISPONIBLE
    TikTok generalmente solo ofrece una calidad por video
    
    El archivo se elimina automáticamente después de enviarlo al cliente
    """
    try:
        # Generar nombre único para el archivo temporal
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
                print(f"📥 Descargando video en máxima calidad disponible...")
                info = ydl.extract_info(request.url, download=True)
                title = info.get('title', 'video')
                safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
                safe_title = safe_title[:50]
                width = info.get('width', 0)
                height = info.get('height', 0)
                file_size = output_path.stat().st_size / (1024 * 1024)
                print(f"✅ Video descargado: {width}x{height} ({file_size:.2f} MB)")
                if not output_path.exists():
                    raise HTTPException(status_code=500, detail="Error al descargar el video")
                background_tasks.add_task(remove_file, output_path)
                return FileResponse(
                    path=str(output_path),
                    media_type='video/mp4',
                    filename=f"{safe_title}_HD.mp4"
                )
            
            except yt_dlp.utils.DownloadError as e:
                if output_path.exists():
                    output_path.unlink()
                raise HTTPException(status_code=400, detail=f"Error al descargar el video: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        if 'output_path' in locals() and output_path.exists():
            output_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)