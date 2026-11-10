# Publicar Cupón Corrido (GitHub + Vercel + dominio)

Guía paso a paso. Nada de esto se hace desde el código: son pasos en las páginas de GitHub y Vercel.
Las claves **nunca** se escriben en el código ni en el chat: van solo en `.env.local` (local) y en
las variables de entorno de Vercel.

---

## 1. Subir el proyecto a GitHub

1. Entre a <https://github.com/new>.
2. Nombre del repositorio: `cupon-corrido`. Puede ser **privado** (Vercel funciona igual).
3. **No** marque "Add a README", ".gitignore" ni "license" (el proyecto ya los tiene).
4. Pulse **Create repository** y copie la URL que aparece (`https://github.com/SU-USUARIO/cupon-corrido.git`).
5. En la terminal, en la carpeta del proyecto:

```bash
git remote add origin https://github.com/SU-USUARIO/cupon-corrido.git
git push -u origin main
```

La primera vez Git abre una ventana para iniciar sesión en GitHub. `.env.local` y `data/cargas/`
no se suben (están en `.gitignore`).

---

## 2. Crear el proyecto en Vercel

1. Entre a <https://vercel.com/new> e inicie sesión **con GitHub**.
2. En "Import Git Repository" elija `cupon-corrido` y pulse **Import**.
3. Vercel detecta Next.js solo. **No** cambie los comandos de build.
4. Antes de pulsar **Deploy**, abra **Environment Variables** y agregue las del punto 3.
   (También se pueden agregar después en *Settings → Environment Variables*; cada cambio de
   variables necesita un nuevo despliegue: *Deployments → ⋯ → Redeploy*.)

---

## 3. Variables de entorno

| Variable | ¿Obligatoria? | Valor |
|---|---|---|
| `ADMIN_KEY` | Sí, para usar «Cargar datos» | Una clave larga inventada por usted (mínimo 8 caracteres; mejor 20 o más). Puede reutilizar la de su `.env.local`. |
| `CRON_SECRET` | Sí, para el refresco automático | Otra clave larga inventada. Vercel la envía al cron (`vercel.json`: todos los días a las 12:00 y a las 21:00 de Bogotá; en el plan Hobby la hora exacta puede variar dentro de esa hora). |
| `ACTUALIZAR_KEY` | No | Clave para forzar la actualización con `POST /api/actualizar`. Si falta, sirve la `ADMIN_KEY` (también desde el botón «Actualizar datos en vivo ahora» de /datos). |
| `ANTHROPIC_API_KEY` | No | Sin ella, el asesor queda en **modo demo**. Para activarlo: <https://console.anthropic.com> → *API Keys* → *Create Key*. |
| `NEXT_PUBLIC_SITIO_URL` | No | La dirección pública, p. ej. `https://cuponcorrido.co`. Si falta se usa la de Vercel. |
| `ASESOR_MODELO`, `ASESOR_ESFUERZO`, `ASESOR_MAX_TOKENS`, `ASESOR_CONSULTAS_HORA` | No | Control de costos del asesor (ver `.env.example`). |

Para generar una clave larga y segura en PowerShell (generador criptográfico del sistema):

```bash
$b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

### Almacenamiento (recomendado)

- **Vercel Blob** (para guardar las curvas FRAC y series cargadas): en el proyecto, pestaña
  **Storage → Create → Blob → Connect**. Vercel agrega solo `BLOB_READ_WRITE_TOKEN`.
  Sin Blob, «Cargar datos» avisa que no puede guardar en producción.
- **Upstash Redis** (límite de 20 consultas/hora compartido y caché de 24 h del asesor):
  **Storage → Marketplace → Upstash (Redis) → Create/Connect**. Vercel agrega `KV_REST_API_URL`
  y `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`); el código acepta ambos nombres.
  Sin Redis, cada instancia cuenta por separado (funciona, pero el límite es menos estricto).

Después de conectar Blob o Redis, haga **Redeploy** para que tomen efecto.

---

## 4. Desplegar y revisar

1. Pulse **Deploy** y espere a que termine (2–3 minutos).
2. Abra la URL que entrega Vercel (`https://cupon-corrido-xxxx.vercel.app`) y revise:
   - **Mercado** y **Noticias y fuentes**: la tabla «Estado de los datos» debe mostrar **En vivo**
     para TPM, IBR, UVR y TRM.
   - **Noticias**: titulares de Bloomberg Línea y fuentes oficiales.
   - **Asesor IA**: «Demo» si no configuró la clave; con la clave, una respuesta en streaming.
   - **Cargar datos**: suba `excel/Calculadora_para_pagina.xlsx` con su `ADMIN_KEY`.
   - **Privacidad** y **Términos** en el pie.
3. Si algo falla: proyecto → **Deployments** → el despliegue → **Logs** (o *Functions*).

---

## 5. Conectar su dominio

1. Compre el dominio en un registrador (por ejemplo, para `.co`: GoDaddy, Namecheap o
   un registrador autorizado de `.co`).
2. En Vercel: proyecto → **Settings → Domains → Add** y escriba el dominio
   (`cuponcorrido.co` y también `www.cuponcorrido.co`).
3. Vercel muestra los registros DNS que debe crear (normalmente un registro **A** para el
   dominio raíz y un **CNAME** para `www`). **Copie exactamente los valores que muestra Vercel**
   en la sección DNS de su registrador.
4. Espere la verificación (de minutos a unas horas). Vercel emite el certificado HTTPS solo.
5. Agregue `NEXT_PUBLIC_SITIO_URL=https://su-dominio` en las variables y haga **Redeploy**
   (así los metadatos y la política de privacidad muestran la dirección correcta).

---

## 6. Después de publicar

- Cada `git push` a `main` despliega una versión nueva automáticamente.
- Para cambiar nombre, colores o tipografías: `lib/brand.ts`, `app/globals.css`, `app/fuentes.ts`.
- Datos del responsable en la política de privacidad: `lib/brand.ts` → `responsable`.
- Si cambia el tratamiento de datos (p. ej. agrega analítica o cuentas), actualice
  `app/privacidad/page.tsx` y la `fechaLegal`.
