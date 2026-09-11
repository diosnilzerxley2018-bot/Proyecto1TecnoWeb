# Despliegue de NutriExpress

Backend y base de datos en **Railway**, frontend en **Vercel**, correo saliente
por **Brevo**.

El orden importa: cada paso necesita una dirección que produce el anterior.
Saltarse el orden obliga a volver atrás a corregir variables.

```
1. Base de datos (Railway)  ──► DATABASE_URL
2. Backend (Railway)        ──► https://<algo>.up.railway.app
3. Frontend (Vercel)        ──► https://<algo>.vercel.app
4. Volver al backend        ──► CORS_ORIGIN con la dirección de Vercel
5. Correo (Brevo)           ──► BREVO_API_KEY
```

---

## 1. La base de datos

En Railway: **New → Database → PostgreSQL**. No hay nada que configurar.

Railway crea `DATABASE_URL` **dentro del servicio Postgres**, y no la comparte
sola con los demás. El backend la recibe con una *variable de referencia*, que
se configura en el paso siguiente.

## 2. El backend

**New → GitHub Repo →** `Proyecto1TecnoWeb`.

Como el repositorio tiene dos proyectos, hay que decirle cuál construir. En
**Settings** del servicio:

| Campo | Valor |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Healthcheck Path | `/api/health` |

`npm install` dispara `postinstall`, que ejecuta `prisma generate`. Ese paso es
obligatorio: **el cliente de Prisma no viaja en el repositorio**, se genera a
partir del esquema.

### Variables de entorno

En **Variables**, y como mínimo:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<una cadena larga y aleatoria, distinta de la de desarrollo>
NODE_ENV=production
CORREO_MODO=simulado
CORS_ORIGIN=http://localhost:3000
```

Las llaves dobles de `DATABASE_URL` no son un ejemplo a rellenar: **se escriben
tal cual**. Es una referencia a la variable del servicio Postgres, y así el día
que Railway rote la contraseña de la base, el backend la sigue.

`PORT` la pone Railway sola. `CORS_ORIGIN` se corrige en el paso 4, cuando
exista la dirección de Vercel.

> El nombre `Postgres` dentro de las llaves es el del servicio en tu proyecto.
> Si lo renombraste, usa el nombre que tenga.

> **`JWT_SECRET` tiene que ser distinta de la de desarrollo.** Con la misma, un
> token firmado en cualquier máquina donde esté el `.env` abre la sesión en
> producción.

### Preparar la base

La base arranca vacía. El esquema es un script SQL y no un juego de migraciones
(hallazgo A5), así que hay que cargarlo una vez. Desde la pestaña de la
terminal del servicio en Railway:

```bash
npm run db:init
```

Carga `prisma/schema.sql` y siembra los datos iniciales. **Es idempotente y no
destruye**: si ya hay tablas, avisa y no toca nada. Ejecutarlo dos veces por
error no cuesta los datos.

Al terminar existen dos cuentas: `admin / Admin1234!` y
`repartidor / Reparto1234!`.

> **Cambia la contraseña de `admin` apenas entres.** Está en el repositorio, en
> `prisma/seed.ts`, a la vista de cualquiera.

Comprobación: `https://<tu-backend>.up.railway.app/api/health` debe responder
`{"estado":"ok","servicio":"nutriexpress-api"}`.

## 3. El frontend

En Vercel: **Add New → Project →** el mismo repositorio.

| Campo | Valor |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Next.js (lo detecta solo) |

Una variable, en **Environment Variables**:

```
NEXT_PUBLIC_API_URL=https://<tu-backend>.up.railway.app/api
```

**Con `/api` al final.** Sin eso, todas las peticiones dan 404 y el error no
dice por qué.

## 4. Cerrar el círculo: CORS

Vuelve a las variables del backend en Railway y pon la dirección real:

```
CORS_ORIGIN=https://<tu-frontend>.vercel.app
```

Admite varias separadas por coma. Si quieres que funcionen también las
previsualizaciones de Vercel —cada rama genera su propia dirección—, añádelas
igual:

```
CORS_ORIGIN=https://nutriexpress.vercel.app,https://nutriexpress-git-rama.vercel.app
```

Railway reinicia el servicio solo al cambiar una variable.

**Síntoma de que esto está mal:** el frontend carga pero ninguna petición
funciona, y la consola del navegador dice *«blocked by CORS policy»*. No es un
fallo del backend: es que no reconoce el origen.

## 5. El correo

Hasta aquí el sistema funciona con `CORREO_MODO=simulado`: los avisos se
generan pero no salen. Conviene dejarlo así hasta comprobar que todo lo demás
anda, para no confundir «el despliegue falla» con «el correo falla».

### Por qué Brevo y no SMTP

**Railway bloquea el puerto SMTP saliente en los planes Trial y Hobby.** El
`MensajeroSmtp` no puede conectarse por más bien configurado que esté. La
salida es la API HTTPS, que no está bloqueada.

### Configurarlo

1. Crear una cuenta en [brevo.com](https://www.brevo.com) — el plan gratuito da
   300 correos al día, sin caducidad.
2. **SMTP & API → API Keys → Generate a new API key**.
3. En las variables del backend, en Railway:

```
CORREO_MODO=brevo
BREVO_API_KEY=<la clave>
CORREO_REMITENTE=NutriExpress <no-responder@nutriexpress.bo>
```

Sin un dominio propio verificado, Brevo entrega igual a **cualquier**
destinatario, pero reescribe el remitente a `@brevosend.com`. Para una
demostración es suficiente.

### Comprobar que llega

Entra como `admin`, ve a **Ventas → Reportes**, elige un rango y usa *Enviar por
correo*. El reporte llega en PDF.

Si no llega, el registro de Brevo dice por qué:

```bash
curl -s "https://api.brevo.com/v3/smtp/statistics/events?limit=20" \
  -H "api-key: TU_CLAVE" | python -m json.tool
```

Cada envío aparece con su destinatario y su estado: `delivered`, `bounce`,
`spam`, `blocked`.

---

## Lo que hay que saber de estos planes

| | Límite | Qué pasa al alcanzarlo |
|---|---|---|
| **Railway Trial** | 30 días o $5 | Los servicios **se apagan** |
| **Vercel Hobby** | Sin caducidad | Prohibido el uso comercial; un proyecto académico está permitido |
| **Brevo gratuito** | 300 correos/día | El envío 301 falla; al día siguiente se restablece |

**El de Railway es el que puede arruinarte una defensa.** Si la presentación
cae fuera de esos 30 días, hace falta el plan Hobby ($5/mes). Conviene mirar el
calendario antes que el saldo.

## Lo que este despliegue no cubre

Tres cosas que conviene decir antes de que las pregunten, porque son
limitaciones conocidas y no descuidos:

- **Brevo no es un servidor de correo.** Envía, pero no recibe ni tiene
  buzones. El servidor de correo del proyecto sigue siendo el del laboratorio
  (Postfix + Dovecot + BIND9, documentado en `LABORATORIO-VMS.md`). Son dos
  cosas distintas y conviven: el laboratorio demuestra que se sabe montar el
  servidor; Brevo hace que el despliegue público pueda avisar a un cliente
  real.

- **No hay respaldos automáticos** (RNF-DIS-02). Railway ofrece copias de la
  base en sus planes pagos; en el gratuito hay que exportarla a mano con
  `pg_dump`.

- **El esquema no se gestiona con migraciones versionadas** (RNF-MAN-03,
  hallazgo A5). `db:init` sirve para una base vacía. Un cambio de esquema sobre
  una base con datos hay que aplicarlo a mano con `ALTER TABLE`.
