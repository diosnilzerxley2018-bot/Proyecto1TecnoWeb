# Backend — NutriExpress API REST

API REST del Sistema de Información Web para la Gestión de Ventas, Pedidos, Producción e Inventario de Comida Saludable.

---

## Arquitectura MVC y su trazabilidad con el análisis

Cada carpeta corresponde a un estereotipo del modelo de análisis (Capítulo III del informe). **Ésta es la trazabilidad que hace verificable el diseño:**

| Carpeta | Capa MVC | Clase de análisis | Responsabilidad |
|---|---|---|---|
| `src/routes/` | — | — | Define los endpoints REST y los conecta con su controlador |
| `src/controllers/` | **Controller** | `ctrl*` | Recibe la petición, invoca al servicio, devuelve el DTO |
| `src/services/` | **Controller** | `ctrl*` | Lógica de negocio y transacciones |
| `src/models/` | **Model** | `tbl*` | Acceso a datos vía Prisma. Única capa que toca la BD |
| `src/dtos/` | — | — | Contrato de salida de cada endpoint (RNF-REN-03) |
| `src/middlewares/` | — | — | Autenticación, permisos, validación, errores |
| `src/config/` | — | — | Entorno y cliente Prisma |
| `src/utils/` | — | — | Utilidades (hash, JWT) |

> La capa **View** vive en el proyecto `frontend/` (Next.js) y corresponde a las clases `frm*`.

**Regla de dependencia:** `routes → controllers → services → models → Prisma`.
Nunca al revés, y ninguna capa salta a otra que no sea la inmediata inferior. Esto cumple el `RNF-MAN-01` (arquitectura por capas) y el `RNF-MAN-04` (agregar módulos sin tocar los existentes).

---

## Versiones — y por qué éstas

Todas verificadas contra el registro de npm el **30/08/2026**. Están **fijadas sin `^`** para que la instalación sea reproducible en cualquier máquina, incluida la de la presentación.

| Paquete | Versión | Motivo |
|---|---|---|
| `express` | **5.2.1** | Línea 5 estable desde 09/2024; esta versión desde 12/2025. Maneja automáticamente los errores de handlers `async` |
| `prisma` / `@prisma/client` | **7.10.0** | ⚠️ Ver advertencia abajo |
| `typescript` | **6.0.3** | Publicada 04/2026, línea madura. TS 7.0.2 (07/2026) es la reescritura nativa en Go: estable pero muy reciente |
| `@types/node` | **22.20.1** | Debe coincidir con Node 22, no con la 26 que npm marca como `latest` |
| `@types/express` | **5.0.6** | Tipos para Express 5 |
| `bcrypt` | **6.0.0** | Hash de contraseñas con salt (`RNF-SEG-02`) |
| `jsonwebtoken` | **9.0.3** | Token de sesión (`RNF-SEG-06`) |
| `zod` | **4.5.4** | Validación de entrada en el servidor (`RNF-SEG-06`) |
| `dotenv` | **17.4.2** | Variables de entorno |
| `cors` | **2.8.6** | Permite el origen del frontend |
| `tsx` | **4.23.13** | Ejecuta TypeScript en desarrollo sin compilar |
| `multer` | **^2.4.0** | Recibe la foto de un producto como `multipart/form-data`, en memoria (nada a disco: en Railway se perdería en el siguiente despliegue) |

### ⚠️ Advertencia sobre Prisma

En npm, el paquete `prisma` tiene su etiqueta `latest` apuntando a **`8.0.0-rc.12`**, que es un *release candidate*, mientras que `@prisma/client` está en **`7.10.0`** estable.

**Si ejecuta `npm install prisma@latest` instalará un RC y quedará desalineado con el cliente.** Por eso ambos están fijados a `7.10.0` en `package.json`.

---

## Puesta en marcha

### 1. Crear la base de datos

El script `prisma/schema.sql` es el **diseño físico de la sección 4.5.3 del informe**: 30 tablas PostgreSQL con sus claves foráneas, restricciones `CHECK` e índices.

```bash
createdb nutriexpress
psql -d nutriexpress -f prisma/schema.sql
```

### 2. Configurar el entorno

```bash
cp .env.example .env
# editar .env con el usuario y contraseña de PostgreSQL
```

### 3. Instalar y generar el cliente Prisma

```bash
npm install
npx prisma db pull      # lee la BD y genera prisma/schema.prisma
npx prisma generate     # genera el cliente tipado
```

> `db pull` hace **ingeniería inversa**: el script SQL del informe es la fuente de verdad y Prisma se alinea a él, no al revés. A partir de aquí, los cambios de esquema se gestionan con migraciones versionadas (`RNF-MAN-03`).

### 4. Levantar el servidor

```bash
npm run dev
```

Verificación: `GET http://localhost:4000/api/health`

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor en desarrollo con recarga automática |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta la versión compilada |
| `npm run typecheck` | Verifica tipos sin generar archivos |
| `npm run db:pull` | Regenera `schema.prisma` desde la BD |
| `npm run db:studio` | Abre el explorador visual de la BD |

---

## Convención de endpoints

Un recurso por caso de uso, siguiendo los verbos HTTP estándar:

| Caso de uso | Método y ruta |
|---|---|
| `CU-SEG-01` Iniciar Sesión | `POST /api/auth/login` · `POST /api/auth/logout` |
| `CU-SEG-02` Gestionar Usuario | `GET/POST/PUT/DELETE /api/usuarios` |
| `CU-SEG-03` Gestionar Rol y Permisos | `GET/POST/PUT /api/roles` |
| `CU-SEG-04` Asignar Permisos a Usuario | `PUT /api/usuarios/:id/permisos` |
| `CU-SEG-05` Bloquear Cuenta | *(automático, dentro de `POST /api/auth/login`)* |

---

## Estructura

```
backend/
├── prisma/
│   ├── schema.sql          ← diseño físico del informe (4.5.3)
│   └── schema.prisma       ← generado por db pull
├── src/
│   ├── config/             ← entorno y cliente Prisma
│   ├── models/             ← MODEL   (tbl*)
│   ├── services/           ← lógica de negocio y transacciones
│   ├── controllers/        ← CONTROLLER (ctrl*)
│   ├── routes/             ← endpoints REST
│   ├── dtos/               ← contratos de salida
│   ├── middlewares/        ← auth, permisos, validación, errores
│   ├── utils/              ← hash, JWT
│   ├── app.ts              ← configuración de Express
│   └── server.ts           ← arranque y apagado ordenado
├── .env.example
├── package.json
└── tsconfig.json
```
