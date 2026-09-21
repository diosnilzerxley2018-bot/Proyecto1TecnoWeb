# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

**NutriExpress** — Sistema de Información Web para la Gestión de Ventas, Pedidos, Producción e Inventario de comida saludable. Proyecto académico de la materia Tecnología Web, con informe asociado (`Informe_Proyecto.docx`, `CasosDeUso_2.4.4.eapx`).

Son **dos proyectos npm independientes**, sin workspace raíz: `backend/` (API REST) y `frontend/` (Next.js). Cada uno se instala y se ejecuta por separado.

**Todo el código está en español** — identificadores, nombres de archivo, mensajes de error y comentarios. Mantener esa convención; no introducir nombres en inglés.

Los comentarios del código citan la trazabilidad con el informe (`CU-VEN-01`, `RF-PED-04`, `RNF-SEG-04`, restricciones `ck_*` del esquema). No es decoración: esas referencias justifican por qué una regla existe. Al modificar código, conservar y actualizar esas citas.

## Comandos

### Backend (`cd backend`)

| Comando | Qué hace |
|---|---|
| `npm run dev` | API en `http://localhost:4000` con recarga (tsx watch). Verificar con `GET /api/health` |
| `npm run build` / `npm start` | Compila a `dist/` / ejecuta lo compilado |
| `npm run typecheck` | `tsc --noEmit` — no hay ESLint en el backend |
| `npm test` | Suite completa de integración (vitest) |
| `npm run test:watch` | Modo watch |
| `npm run test:db` | Recrea la base de pruebas a mano |
| `npm run db:pull` / `db:generate` / `db:studio` | Prisma |

Puesta en marcha desde cero: `createdb nutriexpress` → `psql -d nutriexpress -f prisma/schema.sql` → `cp .env.example .env` → `npm install` → `npx prisma db pull` → `npx prisma generate` → `npx tsx prisma/seed.ts`.

Usuarios del seed: `admin / Admin1234!` (todos los permisos) y `repartidor / Reparto1234!`.

`node crear-usuarios-prueba.mjs` (en `backend/`, fuera del sistema y borrable) agrega un usuario por tipo de cuenta —`vendedor`, `cocinero`, `almacenero`, `cliente`— para probar la gestión sin tocar al administrador. Es idempotente.

### Frontend (`cd frontend`)

`npm run dev` (puerto 3000) · `npm run build` · `npm test` / `npm run test:watch`. No hay script de lint ni de typecheck; usar `npx tsc --noEmit`.

### Ejecutar una sola prueba

```bash
npm test -- tests/ventas.test.ts              # un archivo
npm test -- tests/ventas.test.ts -t "anular"  # un caso por nombre
```

## Pruebas

**El backend prueba contra PostgreSQL de verdad**, no contra mocks: `supertest` sobre la app Express completa.

- `tests/setup.ts` carga `.env.test` (base `nutriexpress_test`, separada de la de desarrollo). **`.env.test` está en `.gitignore`**: en una máquina nueva hay que crearlo a mano antes del primer `npm test` (mismas claves que `.env.example`, con `NODE_ENV=test`, `BCRYPT_ROUNDS=4` para que la suite no tarde y `PAGO_SIMULADO_RETARDO_MS=0`).
- `tests/preparar-global.ts` **borra y recrea la base entera antes de cada corrida** (`DROP DATABASE` + `schema.sql` + seed). Por eso la suite es determinista y por eso la primera prueba tarda; `testTimeout` está en 30 s.
- `fileParallelism: false` — todas las pruebas comparten la base y corren en serie. No introducir paralelismo.
- `tests/ayudantes.ts` da los atajos habituales: `obtenerToken()`, `registrarCliente()`, `crearEmpleado(cargo)`, `crearPedido()`, `sufijo()` para datos que no choquen entre pruebas.

El frontend prueba componentes con Testing Library sobre jsdom (`frontend/tests/*.test.tsx`), con alias `@` → `src`.

## Arquitectura del backend

Capas estrictas, una carpeta por estereotipo del modelo de análisis:

```
routes → controllers → services → models → Prisma
```

La dependencia **nunca** va al revés ni en diagonal (un controlador no toca `prisma`, un modelo no importa un servicio).

- `src/models/` — **única capa que importa `config/prisma.ts`**. Consultas y `select`/`include` compartidos.
- `src/services/` — lógica de negocio y transacciones (`prisma.$transaction`). Los servicios lanzan `ErrorApp` y no conocen HTTP.
- `src/controllers/` — leen la petición, invocan el servicio, devuelven el DTO. Son finos, casi siempre una línea.
- `src/dtos/` — esquemas Zod de entrada **y** tipos de salida de cada endpoint. El contrato de respuesta se declara aquí, no se improvisa en el controlador.
- `src/routes/` — endpoints, montados en `src/routes/index.ts` bajo `/api`.

### Reglas que se repiten en todo el backend

- **`src/config/dominio.ts` es la fuente única de los valores de dominio** (estados de pedido, orden y pago; motivos de ingreso/egreso; tipos de venta y conservación; modos de cobro) y de las máquinas de estado (`FLUJO_DE_ESTADOS`, `FLUJO_ORDEN`). Cada lista corresponde a una restricción `CHECK` del esquema SQL: si se agrega un valor hay que tocar ambos. Las transiciones se declaran como tabla, no como cadena de `if`.
- **`ErrorApp(estado, mensaje)`** (`src/errors/error-app.ts`) es la forma de fallar. Express 5 propaga los rechazos de handlers `async` al manejador central automáticamente: **no envolver controladores en `try/catch`** ni en wrappers tipo `asyncHandler`.
- **El identificador del usuario sale siempre de la sesión** (`idUsuarioDeSesion(req)`), nunca del cuerpo ni de la URL.
- **Permiso ≠ subtipo.** `requierePermiso('X')` consulta la base en cada petición (no confía en el token). Aparte, `actor.service.ts` (`exigirEmpleado` / `exigirCliente`) comprueba que el usuario sea del subtipo que la operación necesita, porque las claves foráneas apuntan a `empleado` o `cliente`. Ambas comprobaciones hacen falta.
- **`/api/perfil` es la excepción deliberada al permiso.** `perfil.routes.ts` solo exige sesión iniciada: administrar la cuenta propia no es un privilegio que se conceda, y el alcance lo limita la sesión. Un único `perfil.service.ts` sirve a empleados y clientes (Usuario es el supertipo; lo que difiere entre subtipos se agrega al leer, no al escribir). Lo que el titular **no** puede decidir sobre sí mismo —rol, permisos, estado de la cuenta, nombre de usuario— no tiene puerta de entrada por ahí; se administra desde `usuario.service.ts` (CU-SEG-02/03/04). No duplicar edición de cuenta en `usuario.service` ni en `cliente.service`.
- **La política de contraseñas vive una sola vez** en `src/dtos/contrasena.dto.ts` (`esquemaContrasena`, RF-SEG-03), y la comparten el alta por el administrador, el autorregistro del cliente y el cambio desde el perfil. `AYUDA_CONTRASENA` es el texto derivado para la interfaz.
- **Los precios los pone el servidor**, tomados de la tabla; nunca se aceptan en el cuerpo de la petición.
- **Cerrar una entrega es del repartidor asignado.** Las dos salidas de `En camino` —`Entregado` y `Cancelado` (no se pudo entregar)— las aplica `avanzarEstado` solo si el actor es el repartidor del pedido o tiene `PEDIDO_CERRAR_AJENO` (solo el administrador). Es permiso **e** identidad, como `exigirEmpleado`. Entregar cierra el cobro en efectivo y no entregar repone el stock: las tres cosas van en la misma transacción.
- **El efectivo de un pedido no está cobrado hasta la entrega.** `registrarCobroEnTransaccion` solo marca `Pagado` al crear cuando es una **venta** de mostrador; el pedido a domicilio nace `Pendiente` y lo cierra el repartidor. Igualarlos hacía que un pedido cancelado contara como dinero recaudado.
- **El rol `Cliente` es del sistema.** El autorregistro lo busca por nombre (`auth.service`) y `esPersonalInterno` compara contra ese nombre, así que `rol.service` impide eliminarlo o renombrarlo (sus permisos sí se editan). Un rol solo se elimina si no tiene usuarios.

### Base de datos

`prisma/schema.sql` (36 tablas, con sus `CHECK`, FK e índices) es **la fuente de verdad**; corresponde a la sección 4.5.3 del informe. `prisma/schema.prisma` se genera por ingeniería inversa con `prisma db pull` — **no editarlo a mano**. Un cambio de esquema se escribe primero en SQL.

No hay migraciones versionadas. `npm run db:init` solo carga una base **vacía** (si hay tablas no toca nada). Un cambio posterior se escribe en **dos** sitios: en `schema.sql` y, como ajuste idempotente y no destructivo, en `prisma/actualizar.ts` (`npm run db:actualizar`), que es lo que lo lleva a una base con datos como la de producción. Hay que aplicarlo **antes** de desplegar el código que usa la columna nueva (ver `DESPLIEGUE.md`).

Prisma 7 requiere adaptador de driver (`PrismaPg`); el cliente único vive en `src/config/prisma.ts`.

Las versiones de dependencias del backend están fijadas sin `^` a propósito (ver `backend/README.md`, que explica cada elección; en particular `prisma@latest` en npm apunta a un RC de la 8 desalineado con `@prisma/client` 7.10.0).

### Cobros

`src/pagos/` abstrae la pasarela tras la interfaz `PasarelaPago` (`crearCobro`, `verificarFirma`, `interpretarAviso`, `consultarEstado`). `pasarelaPara(modo)` en `src/pagos/index.ts` es el único punto que decide con quién se cobra; hay `simulada.ts` y `libelula.ts`.

Tres cosas frágiles a respetar:

1. El **modo de cobro** (`Simulado` / `Real`) no está en el entorno: vive en la tabla `configuracion` (`MODO_COBRO`) y lo cambia el administrador en caliente. Cada pago guarda el modo con el que nació.
2. `/api/pagos/notificacion` se monta con `express.raw()` **antes** del `express.json()` general (`src/app.ts`): la firma se valida sobre los bytes exactos que envió la pasarela. Reordenar eso rompe todo aviso legítimo.
3. `middlewares/mantenimiento.middleware.ts` vence cobros abandonados colgándose del tránsito normal de la API (limitado a una vez por minuto, sin bloquear la petición). No sustituirlo por `setInterval`.

## Arquitectura del frontend

Next.js 16 (App Router, React 19 con React Compiler activado, Tailwind 4). No hay obtención de datos en el servidor: **la app es cliente contra la API**; casi todas las páginas son `'use client'`.

- **Dos espacios separados por route group**: `src/app/(privado)/` es el escritorio del personal (barra lateral, módulos de gestión) y `src/app/(portal)/` es el portal del cliente. Cada layout redirige al que no corresponde — un cliente nunca aterriza en el escritorio.
- **Tres contextos, uno por preocupación**: `AuthContext` (sesión en `localStorage` vía `lib/sesion.ts`, `tienePermiso()`, y el destino tras iniciar sesión según `esPersonalInterno(rol)`), `CarritoContext` (solo el portal) y `TemaContext` (escribe `html[data-tema]` y `html[data-modo]`). Todos en `src/context/`.
- `src/lib/api.ts` — único cliente HTTP. Adjunta el `Bearer`, convierte errores en `ErrorApi(estado, mensaje)` y ante un 401 cierra la sesión y va a `/login`. No usar `fetch` directo en componentes. Base: `NEXT_PUBLIC_API_URL`.
- `src/components/RequierePermiso.tsx` es **comodidad de interfaz, no seguridad**: quien manda es el permiso verificado en el servidor.
- `src/lib/dominio.ts` duplica a propósito un subconjunto de `backend/src/config/dominio.ts`. Si se cambia una regla allí, revisar aquí. También fija los seis decimales de las coordenadas (`redondearCoordenadas`), que son los que admite `ubicacion.latitud/longitud` en el esquema.
- **Mapas**: `components/pedidos/MapaUbicacion.tsx` usa **Leaflet directo, sin `react-leaflet`** (una dependencia menos y ningún riesgo con React 19 + React Compiler). Leaflet toca `window` al importarse, así que se carga con `await import('leaflet')` **dentro** del efecto — por eso el componente no necesita `dynamic(..., { ssr: false })` en cada pantalla. Sin la prop `onCambiar` el mapa es de solo lectura: el mismo componente sirve al cliente que elige y al personal que consulta. Las teselas son de OpenStreetMap (sin clave de API) y **el crédito debe seguir visible**, que es lo que exige su licencia; el modo noche las invierte por CSS en `globals.css`.
- `src/lib/modulos.ts` es el catálogo único de módulos (etiqueta, ruta, icono, permiso, `implementado`) que consumen la barra lateral y la pantalla de inicio.
- **Diseño por tokens**: `src/app/globals.css` define el tema en `@theme` (`fondo`, `superficie`, `borde`, `tinta`, `marca-*`, `sobre-marca`, `aviso`, `peligro`…) con modo día/noche vía `html[data-modo]`. Usar esas clases semánticas (`bg-superficie`, `text-tinta-suave`, `ring-borde`), nunca colores crudos de Tailwind. Los primitivos reutilizables están en `src/components/ui/`.
- `frontend/CLAUDE.md` solo hace `@AGENTS.md`, y ese bloque de `AGENTS.md` lo regenera `next dev`: si reaparece en el diff, commitearlo junto al trabajo en lugar de borrarlo.

## Otros archivos del repositorio

`LABORATORIO-VMS.md` documenta el laboratorio de máquinas virtuales de la materia (Postfix/Dovecot/BIND9 + Apache/PHP/MySQL sobre VirtualBox). No tiene relación con el código de NutriExpress. `Correcciones_Diagrama_Casos_de_Uso.md` recoge correcciones del modelo de casos de uso.
