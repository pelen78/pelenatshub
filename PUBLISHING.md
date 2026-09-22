# Panel de publicación de Pelen Class Hub

El portafolio permanece en `/`. El panel privado está en `/admin/`. Los enlaces directos a los assignments siguen siendo públicos para compartirlos en Classroom.

## Configuración en Cloudflare Pages

Proyecto existente: `pelenlab`, repositorio `pelen78/pelenatshub`, rama de producción `main`.

- Comando de compilación: `npm run build`
- Directorio de salida: `dist`
- Node.js: 22 o posterior
- `npm ci` también genera `dist` mediante `postinstall`, para permitir la primera compilación cuando el proyecto existente no tiene comando de build.
- Las Functions se compilan desde `functions/`. El sitio estático se genera sin código del servidor, pruebas, dependencias ni archivos de entorno.

En **Settings → Variables and Secrets**, configurar en producción:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `GITHUB_TOKEN` | Secret cifrado | Token de GitHub limitado a este repositorio, permiso Contents: Read and write |
| `ACCESS_TEAM_DOMAIN` | Variable | Dominio del equipo, por ejemplo `tu-equipo.cloudflareaccess.com` |
| `ACCESS_AUD` | Variable | Application Audience (AUD) de la aplicación Access |
| `ADMIN_EMAILS` | Secret cifrado | Los dos correos autorizados, separados por coma |
| `PUBLIC_ORIGIN` | Variable opcional | `https://pelenlab.com` (valor predeterminado) |

Los valores predeterminados de repositorio y rama ya están en el servidor. `GITHUB_OWNER`, `GITHUB_REPO` y `GITHUB_BRANCH` permiten cambiarlos si fuera necesario. No copiar secretos a `wrangler.toml`, al repositorio, al navegador ni al HTML.

## Login con código por correo

En Cloudflare Zero Trust / Access, crear una aplicación **Self-hosted** con estos dos destinos dentro de la misma aplicación (y el mismo AUD):

- Hostname `pelenlab.com`, path `admin` (incluir sus subrutas).
- Hostname `pelenlab.com`, path `api/admin` (incluir sus subrutas).

Activar el método **One-time PIN**. Crear una política **Allow → Emails**, con los dos correos elegidos por la propietaria. No usar una regla Everyone ni autorizar el dominio completo de la escuela. No proteger el sitio completo ni las carpetas de las actividades.

Configurar `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ADMIN_EMAILS` con los valores correspondientes. El servidor verifica criptográficamente el JWT (firma, emisor, audiencia, vencimiento y correo permitido); no confía solo en una cabecera de correo. Si faltan secretos o configuración, no permite entrar ni publicar. Los dominios de preview tampoco pueden escribir en el repositorio de producción.

Redeploy después de configurar variables y secretos. Comprobar con ambos correos que `/admin/` abre el panel, que un correo diferente es rechazado y que un assignment abre sin iniciar sesión.

## Uso

1. Entrar al panel y pulsar **+ ADD**.
2. Llenar materia, título, estado, descripción y fecha.
3. Seleccionar un HTML (hasta 5 MB) o pegar un enlace. Para un nuevo HTML con dependencias locales, adjuntar hasta 30 archivos de apoyo; el conjunto no puede superar 20 MB. La opción carpeta conserva subcarpetas.
4. Revisar la vista previa y pulsar **Publicar actividad**.
5. Esperar la confirmación de publicación y pulsar **Copiar enlace para Classroom**.

La vista previa usa un iframe aislado. Algunas capacidades de red o almacenamiento pueden no funcionar en la vista previa. Un HTML que necesita archivos externos debe conservar sus URLs o incluir sus archivos de apoyo.

Editar permite reemplazar el HTML conservando su enlace. Para HTML anteriores al panel se conserva la carpeta original y se reemplaza únicamente ese HTML; sus dependencias existentes no se cambian. Retirar una actividad elimina su tarjeta, pero conserva su HTML y su enlace. Las referencias fijadas conservan su estado.

Cada publicación guarda metadatos, HTML, archivos de apoyo y marcador de publicación en un único commit. Se usa una actualización de rama sin `force` para no sobrescribir cambios concurrentes. En ese caso se conserva el formulario y se pide actualizar la lista. Reintentar una solicitud cuya respuesta se perdió no duplica una publicación ya recibida.

La confirmación de publicación comprueba el marcador desplegado en el dominio, no solamente la respuesta de GitHub. Si Cloudflare falla o tarda, el panel informa que GitHub recibió los cambios pero todavía no se confirmó el despliegue. El historial de GitHub permite revertir un commit si hace falta.

## Desarrollo y verificación

```sh
npm ci
npm test
npm run build
npx wrangler pages functions build --outdir .wrangler/functions --build-output-directory dist
npm run dev
```

Sin configuración, el servidor local debe responder 503 en el panel y sus APIs, mientras sirve normalmente el portafolio y los assignments. No hay un bypass de autenticación en el código de producción. Para las pruebas de interfaz se utilizó un servidor de prueba externo al repositorio, con publicaciones simuladas en memoria; no se enviaron assignments de prueba a GitHub.

Las pruebas automatizadas cubren los dos correos permitidos, sesiones falsas o vencidas, emisor y audiencia, escrituras atómicas, cambios concurrentes, conservación de enlaces y referencias, metadatos maliciosos y validación de archivos.
