# Veamoslasfotos · Bianca Mis XV

Aplicación de fotos para el festejo: invitados suben desde el QR, la organización aprueba y las fotos aparecen en una pantalla con fundidos, desplazamientos y zoom suave. Diseño marfil y dorado con la ilustración del piano.

## Qué incluye

- `/`: carga desde celular, vista previa, progreso, nombre y dedicatoria; álbum con reacciones.
- `/pantalla`: proyección, QR permanente, pantalla completa, pausa y avance. Espacio pausa; flecha derecha avanza.
- `/admin`: ingreso con contraseña, aprobar, ocultar, descargar o eliminar fotos, cerrar recepción y ajustar ritmo (4–30 segundos).
- `/qr`: tarjeta imprimible y descarga PNG del QR.
- Actualizaciones SSE con reconexión; fotos JPEG optimizadas y SQLite persistentes. Reacciones: una por identificador de navegador/foto, reemplazable. No identifica personas ni impide reacciones desde varios dispositivos.

## GitHub Pages y Supabase

La versión gratuita se publica desde `index.html` en la raíz. Incluye diseño, QR y proyección; la carga queda desactivada mientras se termina de configurar Supabase. Ver [configuración y estado](SUPABASE-SETUP.md).

```bash
npm ci
npm run build:pages
```

## Puesta en marcha del servidor Node alternativo

Requiere Node.js 24 o Docker. GitHub Pages usa la versión estática descrita arriba. Esta alternativa Node requiere un servidor propio.

```sh
npm ci
cp .env.example .env
```

Completar `.env` con `ADMIN_PASSWORD` (al menos 12 caracteres, exclusiva para esta aplicación) y `PUBLIC_URL` (URL real accesible por invitados, sin barra final). Nunca usar la contraseña de GitHub.

```sh
npm start
```

Abrir `http://localhost:3000`. Para un ensayo sin internet, usar la IP privada de la computadora en `PUBLIC_URL`, conectar los celulares a la misma red Wi-Fi y permitir el puerto 3000. No imprimir un QR con localhost: cada celular lo interpretaría como su propio dispositivo. La red de invitados no debe aislar los dispositivos si se usa esta modalidad.

### Servidor permanente

```sh
docker compose up -d --build
```

Usar un servidor con disco persistente y un dominio HTTPS. Configurar el proxy para puerto 3000, cargas de al menos 15 MB, SSE sin buffering y tiempo de espera superior a 60 segundos. Definir `TRUST_PROXY=1` sólo cuando haya exactamente un proxy confiable. Se requiere **una única instancia**, no almacenamiento efímero/serverless. El volumen `fotos-data` guarda fotos y base de datos; no usar `docker compose down -v` si se desean conservar. Las sesiones administrativas expiran a las 12 horas y al reiniciar el proceso.

## Preparar el festejo

1. Definir dirección permanente y configurar `PUBLIC_URL` antes de imprimir.
2. Abrir `/admin` e ingresar con la contraseña del servidor. La moderación viene activada.
3. Imprimir `/qr` y probarlo con al menos dos celulares.
4. Abrir `/pantalla` en la computadora conectada al televisor/proyector; activar pantalla completa y evitar suspensión del equipo.
5. Subir, aprobar, reaccionar y verificar antes de comenzar. Las nuevas fotos se incorporan a la rotación.
6. Al finalizar, cerrar recepción y guardar copia del volumen de datos con el servicio detenido para una copia SQLite consistente.

Las fotos aprobadas son visibles para quien tenga la URL. Las pendientes/ocultas sólo son accesibles con sesión de administración. Compartir la dirección únicamente con los invitados si se busca un álbum de circulación limitada: no hay PIN de invitación. No guardar fotos, base de datos o secretos en este repositorio público.

JPG, PNG y WebP admitidos; HEIC depende del soporte del códec del servidor y puede requerir exportar a JPG. Máximo 15 MB y 50 megapíxeles de entrada; salida hasta 2200 px, sin metadatos EXIF ni ubicación. Máximo predeterminado 3000 fotos (configurable); monitorear el espacio libre. Límite de 120 cargas por minuto por IP, configurable con `UPLOADS_PER_MINUTE`; ajustar si muchos invitados usan una única conexión compartida.

## Pruebas

```sh
npm test
```

Pruebas de integración: autenticación, carga real, validación de imágenes, moderación, protección de fotos pendientes, reacciones, ajustes, eliminación y persistencia tras reinicio.

La ilustración proporcionada se conserva como recurso original; el diseño usa una ventana CSS para mostrar únicamente la pianista y presenta “Mis XV” como texto. No contiene fotografías de invitados de ejemplo.
