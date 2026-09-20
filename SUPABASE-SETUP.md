# GitHub Pages + Supabase

Proyecto existente: `ufbkidsiavdjbkhowdvw` (organización `jqrxqdwlooumznuxaqal`).
Panel: https://supabase.com/dashboard/project/ufbkidsiavdjbkhowdvw

Estado al 20/09/2026: el panel muestra Unhealthy / Loading infrastructure, con configuración, reinicio, base de datos y almacenamiento deshabilitados. No se aplicó todavía el esquema ni se obtuvo una clave pública. El sitio muestra que está en preparación y bloquea cargas; no simula fotos guardadas.

## Cuando el proyecto vuelva a estar operativo

1. Ejecutar `supabase-schema.sql` UNA VEZ en SQL Editor. Es una transacción: si falla, no deja un esquema parcial. No ejecutarlo sobre tablas existentes sin revisar migraciones.
2. En Authentication > Providers habilitar Anonymous Sign-Ins. Invitados sólo crean una sesión al subir/reaccionar; ver el álbum no requiere registro. Revisar el límite de altas por IP para el Wi-Fi compartido del salón y habilitar protección antiabuso compatible antes de abrir públicamente. El límite por sesión no evita que alguien borre su sesión y cree otra.
3. Crear un usuario permanente de administración en Authentication. Usar su UUID real en SQL: `insert into public.vf_admins(user_id) values ('UUID-DEL-USUARIO');`. Ningún invitado puede agregarse como administrador. El usuario de la app es distinto de la cuenta del panel Supabase.
4. Copiar sólo la clave **publishable** (o legacy **anon**) de API Keys a `pages-config.js`. Jamás copiar secret/service_role ni la contraseña Postgres.
5. `npm ci && npm run build:pages`. Publicar los cambios, incluyendo `index.html`. GitHub Pages usa `main / (root)`.
6. Entrar en `?vista=admin` con el email y contraseña del usuario creado, habilitar recepción y mantener la aprobación previa. Probar con dos teléfonos: subir, aprobar, proyectar, reaccionar, ocultar y borrar.

## Comportamiento y límites

- Sitio: https://martinezdiegoe-ux.github.io/Veamoslasfotos/
- Pantalla: `?vista=pantalla`; administración: `?vista=admin`; QR imprimible: `?vista=qr`.
- QR generado localmente: no envía la URL a un tercero. Siempre apunta al álbum público.
- Fotos JPEG/PNG/WebP hasta 15 MB de entrada; el navegador crea JPEG sin metadatos, hasta 1800 px y 700 KiB. HEIC debe exportarse a JPG si el navegador no lo admite.
- Bucket privado, MIME JPEG y límite 700 KiB comprobados en Storage. Máximo 1200 reservas de foto (incluye borradores), unas 820 MiB de imágenes como máximo. 30 reservas por sesión/hora.
- Las pendientes sólo se listan al administrador; el invitado puede acceder a su propio borrador mientras lo sube. Las aprobadas son visibles a cualquiera con el enlace. No hay PIN de invitación.
- URLs firmadas válidas 120 segundos; una foto recién ocultada puede continuar visible mediante una URL ya emitida hasta que expire. Borrar retira también el archivo.
- Actualización cada 8 segundos mientras la pestaña está visible. Las reacciones aparecen en el álbum; la versión Pages no emite emojis flotantes en tiempo real. La versión Node conserva SSE.
- El plan gratuito tiene límites de transferencia y puede pausarse por inactividad: comprobar el proyecto antes del evento. El tamaño máximo del álbum no garantiza que el tráfico del evento quepa en la transferencia gratuita.
- Si una carga se interrumpe cerrando la pestaña puede quedar un borrador. Revisar `vf_photos` con status=draft y retirar sus archivos desde Storage antes de borrar los registros. No borrar archivos modificando directamente las tablas de Storage.

## Verificación local

`npm test` incluye pruebas de permisos en PostgreSQL embebido (PGlite), además de pruebas del servidor y la interfaz. Eso valida SQL/RLS pero no sustituye la prueba en el proyecto real con Auth y Storage.

`npm run build:pages` genera un único HTML que incluye código, estilos y dependencias. La ilustración permanece en `public/assets/princesa-piano.png`. El código fuente principal es `public/app.js`, `pages.js` y `pages-config.js`.
