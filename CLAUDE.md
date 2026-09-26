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
- **Leer no es gestionar.** Las lecturas que necesitan tareas distintas usan `requiereAlgunPermiso(...)` (`auth.middleware.ts`): la lista y la ficha de productos se leen con `PRODUCTO_GESTIONAR`, `ORDEN_PRODUCCION_GESTIONAR` o `STOCK_CONSULTAR`; sus recetas, con los dos primeros; la lista de insumos y la de almacenes, también con `ORDEN_PRODUCCION_GESTIONAR`. Lo que modifica sigue pidiendo su permiso. Sin esto, a quien se le recortaba `PRODUCTO_GESTIONAR` no le cargaba el formulario de notas de inventario ni el de órdenes.
- **`/api/perfil` es la excepción deliberada al permiso.** `perfil.routes.ts` solo exige sesión iniciada: administrar la cuenta propia no es un privilegio que se conceda, y el alcance lo limita la sesión. Un único `perfil.service.ts` sirve a empleados y clientes (Usuario es el supertipo; lo que difiere entre subtipos se agrega al leer, no al escribir). Lo que el titular **no** puede decidir sobre sí mismo —rol, permisos, estado de la cuenta, nombre de usuario— no tiene puerta de entrada por ahí; se administra desde `usuario.service.ts` (CU-SEG-02/03/04). No duplicar edición de cuenta en `usuario.service` ni en `cliente.service`.
- **La política de contraseñas vive una sola vez** en `src/dtos/contrasena.dto.ts` (`esquemaContrasena`, RF-SEG-03), y la comparten el alta por el administrador, el autorregistro del cliente y el cambio desde el perfil. `AYUDA_CONTRASENA` es el texto derivado para la interfaz.
- **Los precios los pone el servidor**, tomados de la tabla; nunca se aceptan en el cuerpo de la petición.
- **Dinero y cantidad se redondean distinto.** El dinero va a 2 decimales (`dosDecimales`, `utils/dinero.ts`); las cantidades de insumo a 3, el gramo y el mililitro (`redondearCantidad`, `utils/cantidad.ts`), y sus columnas son `NUMERIC(12,3)`. La validación de cantidades vive una sola vez en `src/dtos/cantidad.dto.ts` y **rechaza** lo que la base redondearía en silencio. No usar `dosDecimales` para pesar insumos: con dos decimales 125 g se guardaban como 130 g y 4 g como cero.
- **El costo de un insumo sigue a lo que se paga** (`costeo.service.ts`): cada nota de ingreso con motivo `Compra` lo recalcula por promedio ponderado móvil. Todo el costeo de producción cuelga de ese costo.
- **La zona horaria la fija la aplicación** (`process.env.TZ` en `config/env.ts`, `America/La_Paz` o `ZONA_HORARIA`), no la máquina: los reportes arman "el día" con la hora local, y Railway corre en UTC y el VPS en Europe/Berlin.
- **Un filtro de reporte deja fuera lo que no se pidió.** Con un insumo elegido no entra ningún producto y al revés (`reporte.model.ts`); los ítems se agrupan por tipo e id, nunca por nombre.
- **El reporte de movimientos cuenta como salidas las ventas y los pedidos** (`salidasPorVenta`, `salidasPorPedido`), aunque no tengan nota de egreso: sin ellas un producto elaborado y vendido figuraba con entradas, ninguna salida y existencia cero. No cuentan las ventas anuladas ni los pedidos cancelados, cuyo stock volvió al almacén.
- **Las cifras de dinero no suman lo que no dejó dinero.** El «recaudado» del historial de ventas deja fuera las anuladas y el total del reporte de pedidos, los cancelados. En el reporte de pedidos, por repartidor se distinguen los `asignados` de las `entregas` (solo los entregados).
- **Números, dinero y porcentajes se escriben en formato boliviano** con los formateadores comunes: `bolivianos()`, `formatearCantidad()` y `formatearPorcentaje()` en el backend (los PDF y los correos), `formatearBs()`, `formatearCantidad()` y `formatearPorcentaje()` en la interfaz. Nunca `toFixed` ni el número crudo en un texto: salía «0.16 kg» o «Bs 45.00» junto a «Bs 45,00».
- **Cerrar una entrega es del repartidor asignado.** Las dos salidas de `En camino` —`Entregado` y `Cancelado` (no se pudo entregar)— las aplica `avanzarEstado` solo si el actor es el repartidor del pedido o tiene `PEDIDO_CERRAR_AJENO` (solo el administrador). Es permiso **e** identidad, como `exigirEmpleado`. Entregar cierra el cobro en efectivo y no entregar repone el stock: las tres cosas van en la misma transacción.
- **El efectivo de un pedido no está cobrado hasta la entrega.** `registrarCobroEnTransaccion` solo marca `Pagado` al crear cuando es una **venta** de mostrador; el pedido a domicilio nace `Pendiente` y lo cierra el repartidor. Igualarlos hacía que un pedido cancelado contara como dinero recaudado.
  Consecuencia en la interfaz: un cobro `Pendiente` **no** significa "mostrar el QR". El carrito abre el cobro solo si el pedido está en `Pendiente de pago`; confundirlos le mostraba "Esperando la confirmación del pago" para siempre a quien pagaba en efectivo.
- **Un pedido cancelado guarda por qué** (`pedido.motivo_cancelacion`: `Cliente`, `No entregado`, `Sin pago`). Lo escriben los tres caminos que cancelan —`pedido.service.cancelar`, el cierre del repartidor en `pedido-gestion` y `resolverPedido` en `pago.service`— y el cliente ve y recibe por correo el motivo, no "Pedido cancelado" a secas.
- **El rol `Cliente` es del sistema.** El autorregistro lo busca por nombre (`auth.service`) y `esPersonalInterno` compara contra ese nombre, así que `rol.service` impide eliminarlo o renombrarlo (sus permisos sí se editan). Un rol solo se elimina si no tiene usuarios.
- **Nadie se cambia a sí mismo el rol, los permisos ni el estado de la cuenta** (`exigirCuentaAjena`, `actor.service.ts`): se lo hace otro administrador. Sin esto el único administrador podía darse de baja o quitarse el permiso de administrar usuarios y dejar el sistema sin salida. El estado de la cuenta solo cambia por **dar de baja** y **reactivar**, ambos con `USUARIO_BAJA`; `activo` no viaja en la edición (con `USUARIO_EDITAR` alcanzaba para dar de baja). Los tres estados del listado —activos, bloqueados, de baja— no se superponen (`POR_ESTADO` en `usuario.model.ts`).
- **La búsqueda de texto no distingue tildes ni mayúsculas, y busca cada palabra por separado.** `contieneTodas` (`models/busqueda-texto.ts`) arma la condición SQL con `translate` —no con la extensión `unaccent`, que pide superusuario en cada base— y cada modelo la usa en su `idsQueCoinciden`. `utils/texto.ts` es la misma regla en memoria y `frontend/src/lib/texto.ts` la de la interfaz. No volver a `contains` con `mode: 'insensitive'`: no iguala tildes y compara la frase entera contra cada columna, así que "camila cliente" no encontraba a nadie.
- **El buscador general** (`GET /api/buscar`, `busqueda.service.ts`) pide para cada tipo de resultado **el mismo permiso que su listado** (tabla `FUENTES`) y además que quien busca sea empleado: el rol Cliente tiene `PEDIDO_LEER` para ver sus pedidos, y con el permiso solo vería los de todos. Devuelve tipo, id y `referencia`; a qué pantalla lleva cada uno lo decide la interfaz (`lib/busqueda.ts`).
- **El stock filtrado por almacén muestra ese almacén, pero la reposición mira todos.** `stockTotal` es lo del almacén consultado y `stockGeneral` la suma de todos; `bajoMinimo` se calcula con la general, porque el mínimo es del insumo y no del almacén.
- **El dinero se escribe con `bolivianos()`** (`utils/dinero.ts`, «Bs 1.234,50», igual que `formatearBs` en la interfaz), nunca con `toFixed(2)`. Las sumas de cantidades se redondean con `redondearCantidad` antes de devolverlas: la coma flotante deja restos como 0,30000000000000004.
- **El seguimiento del repartidor** (`seguimiento.service.ts`, tabla `posicion_repartidor`) solo existe con un pedido `En camino`: fuera de ese tramo el servidor rechaza la posición (409) y no la muestra. Es una fila por repartidor que se pisa —no se guarda el recorrido— y se borra al cerrar su última entrega, dentro de la misma transacción de `avanzarEstado`. El cliente la ve solo para su pedido (uno ajeno responde 404); el personal, para cualquiera.

### Base de datos

`prisma/schema.sql` (37 tablas, con sus `CHECK`, FK e índices) es **la fuente de verdad**; corresponde a la sección 4.5.3 del informe. `prisma/schema.prisma` se genera por ingeniería inversa con `prisma db pull` — **no editarlo a mano**. Un cambio de esquema se escribe primero en SQL.

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
- `src/lib/modulos.ts` es el catálogo único de módulos (etiqueta, ruta, icono, permiso, `cargos`, `implementado` y sus `secciones`) que consumen la barra lateral, la pantalla de inicio, las pestañas de cada módulo (`seccionesDe` / `seccionesAccesibles`) y el buscador general (`destinosAccesibles`). Una pestaña pide su permiso o, si no declara uno, el del módulo; un módulo con pestañas aparece si alguna se puede abrir y **se entra por esa** (`entrada` en `modulosAccesibles`, y `EntradaModulo` en la raíz del módulo). Redirigir la raíz a una pestaña fija dejaba frente a «Acceso no autorizado» a quien tenía permiso para otra. `cargos` es **enfoque, no seguridad**: la sesión trae el cargo del empleado (`usuario.cargo`) para que "Mis entregas" solo aparezca al repartidor.
- **Buscador general**: `components/buscador/BuscadorGeneral.tsx`, con Ctrl/⌘+K o el botón de la barra lateral. Las pantallas se filtran en el cliente; lo demás lo busca `/api/buscar`. Cada resultado lleva a su pantalla con un **enlace directo** (`?pedido=`, `?venta=`, `?orden=`, `?producto=`, `?almacen=`, `?buscar=`) que la pantalla atiende con `useEnlaceDirecto`: el parámetro es una orden de una sola vez, se aplica y se quita de la dirección. Leerlo solo al montar la página fallaba cuando se elegía algo de la pantalla en la que ya se estaba (le pasaba también al catálogo del portal con `?termino=`). Por `useSearchParams`, los dos layouts envuelven las páginas en `<Suspense>`.
- **Los hooks propios se llaman `useXxx`**, aunque el archivo se llame `usarXxx.ts` (`useMenuFlotante`, `useRetardo`, `useEnlaceDirecto`, `useRefrescoPeriodico`, `useCompartirUbicacion`). El React Compiler reconoce los hooks por el prefijo `use`: a un `usarRetardo` lo trataba como función común, memorizaba su llamada y en el dibujo siguiente se salteaba sus hooks, y React se caía con «change in the order of Hooks».
- **El inicio se enfoca en el cargo** (`components/inicio/Pendientes.tsx`, `principalesPara` en `modulos.ts`): primero «Para hoy» —pedidos por preparar, órdenes, insumos por reponer, lotes por vencer, lo vendido hoy o las entregas propias, según el cargo y con el permiso de la pantalla a la que llevan— y después los módulos de su trabajo. Todos los empleados comparten el rol Empleado: es enfoque, no seguridad.
- **Los permisos se muestran en palabras** (`describirPermiso` y `agruparPermisos` en `lib/roles.ts`, `ListaPermisos`): la frase de lo que habilitan, agrupada por parte del sistema, con el código debajo. Un permiso nuevo se agrega también allí.
- **El portal en el celular navega por una barra inferior con nombres** (`BarraInferior` en el layout del portal): arriba solo cabían iconos sueltos, y en una pantalla táctil no hay texto al pasar el dedo.
- **Notas de inventario** (`FormularioMovimiento` y `EditorLineas`): al elegir el ítem se propone el almacén —en un ingreso, el de su conservación: el que ya lo guarda, el único apto o el `preferido`; en un egreso, solo los que tienen existencias, diciendo cuánto hay—. El costo de un producto se toma de su ficha (`costoPromedio`), **nunca de su precio de venta**: el costo promedio sale de estas notas y el margen se leía en cero. Una línea a medio llenar se señala (`revisarLineas`), no se descarta; la que queda en blanco sí se ignora. El motivo Producción manual avisa que la orden ya movió el stock.
- **Seguimiento en vivo**: `useCompartirUbicacion` (en "Mis entregas") comparte la posición mientras haya un pedido en camino —cada 15 s o al moverse 40 m, con un latido que le pregunta al GPS si el teléfono quieto deja de avisar, y la pantalla encendida con `wakeLock`—. `SeguimientoEnVivo` la muestra al cliente y al personal sobre `MapaUbicacion`, que acepta un `repartidor`. En solo lectura el mapa encuadra **sin animación**: Leaflet ignora un cambio de vista pedido mientras otro zoom se anima, y el repartidor quedaba fuera del mapa.
- **El pago y la cancelación se dicen en un solo lugar** (`textoDePago`, `explicarCancelacion` y `avisoTrasAccion` en `src/lib/pedidos.ts`), según quién lee: al cliente, qué tiene que hacer ("Paga Bs X en efectivo al recibir"); al personal, qué cobrar ("Cobrar Bs X en efectivo"). No volver a armar "Pago {estado} · {método}" a mano: así salían "Pago pagado" y un "Pago pendiente" en amarillo que parecía un error.
- Las pantallas de seguimiento (mis pedidos, mis entregas, tablero) se refrescan solas con `useRefrescoPeriodico`, que solo consulta con la pestaña visible. Las búsquedas que resuelve el servidor esperan a que se deje de escribir (`useRetardo`) y descartan respuestas que llegan fuera de orden (el número de la última consulta, en una `ref`).
- **Diseño por tokens**: `src/app/globals.css` define el tema en `@theme` (`fondo`, `superficie`, `borde`, `tinta`, `marca-*`, `sobre-marca`, `aviso`, `peligro`…) con modo día/noche vía `html[data-modo]`. Usar esas clases semánticas (`bg-superficie`, `text-tinta-suave`, `ring-borde`), nunca colores crudos de Tailwind. Los primitivos reutilizables están en `src/components/ui/`.
- `frontend/CLAUDE.md` solo hace `@AGENTS.md`, y ese bloque de `AGENTS.md` lo regenera `next dev`: si reaparece en el diff, commitearlo junto al trabajo en lugar de borrarlo.

## Otros archivos del repositorio

`LABORATORIO-VMS.md` documenta el laboratorio de máquinas virtuales de la materia (Postfix/Dovecot/BIND9 + Apache/PHP/MySQL sobre VirtualBox). No tiene relación con el código de NutriExpress. `Correcciones_Diagrama_Casos_de_Uso.md` recoge correcciones del modelo de casos de uso.
