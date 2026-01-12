# 🎵 TikTok Downloader

![Version](https://img.shields.io/badge/version-1.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![React](https://img.shields.io/badge/react-19.2-blue.svg)

> 🚀 Descarga videos de TikTok sin marca de agua en la mejor calidad disponible. Simple, rápido y gratuito.

## ✨ Características

- 🎬 **Descarga sin marca de agua** - Videos limpios en máxima calidad
- 💎 **Mejor calidad disponible** - Generalmente 1080p Full HD
- ⚡ **Rápido y eficiente** - Descarga paralela de fragmentos
- 🎨 **Interfaz moderna** - Diseño responsive con Tailwind CSS
- ⏱️ **Cooldown inteligente** - 15 segundos entre descargas para evitar bloqueos
- 🧹 **Auto-limpieza** - Elimina archivos temporales automáticamente
- 🔒 **Seguro** - CORS configurable, sin APIs de terceros
- 💰 **100% Gratuito** - Sin límites, sin pagos, código abierto

## 📸 Screenshots

### Interfaz Principal

<img width="1897" height="990" alt="Image" src="https://github.com/user-attachments/assets/eed76b12-065d-4d20-80f9-f89f36ded1c9" />

- Diseño moderno con gradiente rosa/púrpura
- Campo de entrada para URL de TikTok
- Botón de descarga con estados visuales claros

### Preview del Video

<img width="654" height="941" alt="Image" src="https://github.com/user-attachments/assets/50f72a26-36b6-4010-b743-1a3b120d2c85" />

- Thumbnail del video
- Información del autor
- Badges de calidad y sin marca de agua
- Contador de cooldown

## 🛠️ Tecnologías

### Frontend
- ⚛️ **React** - Biblioteca de UI
- 📘 **TypeScript** - Tipado estático
- ⚡ **Vite** - Build tool ultrarrápido
- 🎨 **Tailwind** - Framework de CSS utility-first

### Backend
- 🐍 **Python** - Lenguaje de programación
- 🚀 **FastAPI** - Framework web moderno
- 📦 **yt-dlp** - Motor de descarga
- 🔄 **Uvicorn** - Servidor ASGI

## 📋 Requisitos Previos

- **Node.js** 16+ y npm
- **Python** 3.8+
- **pip** (gestor de paquetes de Python)

## 🚀 Instalación

### 1. Clonar el Repositorio

```bash
git clone https://github.com/CristianRC7/TikTokDownloader.git
cd TikTokDownloader
```

### 2. Configurar el Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo .env
cp .env.example .env
# Editar .env y configurar ALLOWED_ORIGINS si es necesario
```

### 3. Configurar el Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env
# Editar .env y configurar VITE_API_URL
```

## ▶️ Uso

### Desarrollo

#### Iniciar el Backend

```bash
cd backend
# Asegúrate de que el entorno virtual esté activado
python main.py
```

El servidor estará corriendo en `http://localhost:8000`

#### Iniciar el Frontend

En otra terminal:

```bash
cd frontend
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

### Producción

#### Build del Frontend

```bash
cd frontend
npm run build
```

Los archivos compilados estarán en `frontend/dist/`

#### Deploy del Backend

Puedes desplegar el backend en:
- **Render** (recomendado)
- **Railway**
- **Heroku**
- **DigitalOcean**
- **AWS EC2**

#### Deploy del Frontend

Puedes desplegar el frontend en:
- **Vercel** (recomendado)
- **Netlify**
- **GitHub Pages**
- **Cloudflare Pages**

**Importante:** Actualizar `VITE_API_URL` en `.env` con la URL de tu backend en producción.

## 🎯 Cómo Funciona

1. **Usuario pega URL** de TikTok en el campo de entrada
2. **Frontend valida** que sea una URL válida de TikTok
3. **Backend extrae información** del video usando yt-dlp
4. **Frontend muestra preview** con thumbnail, título y autor
5. **Usuario hace clic en descargar**
6. **Backend descarga el video** en máxima calidad sin marca de agua
7. **Archivo se envía al navegador** para descarga
8. **Limpieza automática** del archivo temporal en el servidor
9. **Cooldown de 15 segundos** se activa para prevenir bloqueos

## 📁 Estructura del Proyecto

```
TikTokDownloader/
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Componente principal
│   │   ├── main.tsx            # Entry point
│   │   └── ...
│   ├── .env.example            # Ejemplo de configuración
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── main.py                 # Servidor FastAPI
│   ├── requirements.txt        # Dependencias Python
│   ├── .env.example           # Ejemplo de configuración
│   └── temp_videos/           # Archivos temporales (auto-limpiado)
│
├── README.md
└── LICENSE
```

## ⚙️ Configuración

### Variables de Entorno - Backend

Crea un archivo `.env` en la carpeta `backend/`:

```env
# Puerto del servidor
PORT=8000

# CORS - Desarrollo (permite todos los orígenes)
ALLOWED_ORIGINS=*

# CORS - Producción (especifica tus dominios)
# ALLOWED_ORIGINS=https://miapp.com,https://www.miapp.com
```

### Variables de Entorno - Frontend

Crea un archivo `.env` en la carpeta `frontend/`:

```env
# URL del backend
VITE_API_URL=http://localhost:8000

# En producción:
# VITE_API_URL=https://tu-backend-api.com
```

## 🔧 API Endpoints

### `GET /`
Health check del servidor

**Response:**
```json
{
  "message": "TikTok Downloader API",
  "status": "running"
}
```

### `POST /api/download`
Obtiene información del video sin descargarlo

**Request:**
```json
{
  "url": "https://www.tiktok.com/@user/video/1234567890"
}
```

**Response:**
```json
{
  "title": "Video Title",
  "author": "Username",
  "thumbnail": "https://...",
  "video_id": "uuid",
  "duration": 30
}
```

### `POST /api/download-file`
Descarga el video en la mejor calidad

**Request:**
```json
{
  "url": "https://www.tiktok.com/@user/video/1234567890"
}
```

**Response:**
Video file (MP4)

### `GET /health`
Status del servidor

## 🎨 Personalización

### Cambiar el Tiempo de Cooldown

En `frontend/src/App.tsx`, línea ~107:

```typescript
setCooldown(15)  // Cambiar el número de segundos
```

### Modificar Estilos

Los estilos se gestionan con **Tailwind CSS**. Edita las clases directamente en `App.tsx`.

### Configurar CORS para Producción

En `backend/.env`:

```env
# Solo permitir tu dominio
ALLOWED_ORIGINS=https://tu-dominio.com

# Múltiples dominios (separados por comas)
ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
```

## 🐛 Solución de Problemas

### El backend no arranca

- Verifica que Python 3.8+ esté instalado
- Asegúrate de que el entorno virtual esté activado
- Revisa que todas las dependencias estén instaladas: `pip install -r requirements.txt`

### El frontend no conecta con el backend

- Verifica que el archivo `.env` exista en `frontend/`
- Comprueba que `VITE_API_URL` apunte a `http://localhost:8000`
- Asegúrate de que el backend esté corriendo

### No descarga videos

- Actualiza yt-dlp: `pip install --upgrade yt-dlp`
- Verifica que la URL de TikTok sea válida
- Revisa la consola del navegador para errores
- Algunos videos pueden estar geo-bloqueados

### Error de CORS

- Verifica la configuración de `ALLOWED_ORIGINS` en `backend/.env`
- En desarrollo, usa `ALLOWED_ORIGINS=*`
- En producción, especifica tu dominio exacto

## 📊 Limitaciones

- **Calidad:** Limitado a la calidad que TikTok ofrece (generalmente 1080p)
- **Videos privados:** No puede descargar videos de cuentas privadas
- **Rate limiting:** TikTok puede bloquear IPs con demasiadas peticiones (por eso existe el cooldown)
- **Geo-restricciones:** Algunos videos pueden no estar disponibles en ciertas regiones

## 🤝 Contribuir

Las contribuciones son bienvenidas! Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📧 Contacto

Si tienes preguntas o sugerencias, no dudes en abrir un issue en GitHub.

---

⭐ Si este proyecto te fue útil, considera darle una estrella en GitHub!

**Made with ❤️ by Cristian Ramirez**