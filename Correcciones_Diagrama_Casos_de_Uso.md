# Correcciones al Diagrama General de Casos de Uso

**Proyecto:** Sistema de Información Web para la Gestión de Ventas, Pedidos, Producción e Inventario de Comida Saludable — NutriExpress
**Archivo analizado:** `CasosDeUso_2.4.4.eapx`
**Documento analizado:** `Informe_Proyecto.docx`
**Fuente de referencia:** Arlow, J. & Neustadt, I. — *UML 2 y el Proceso Unificado* (edición en español)
**Última actualización:** 2 de septiembre de 2026

---

> **Alcance.** Las secciones 1 a 5 corrigen el modelo de casos de uso. La
> sección 6 recoge los hallazgos aparecidos al implementar el backend, la 7
> audita la cobertura de los requisitos del informe, la 8 documenta la
> producción al instante y la 9 los cobros en línea. Todas afectan al script de
> la base de datos y a las fichas de análisis.

## Decisiones tomadas

| Decisión | Valor |
|---|---|
| Cantidad final de casos de uso | **22** |
| Relaciones `include` | **7** |
| Relaciones `extend` | **5** |
| Total de relaciones | **12** |
| Casos de uso de Reportes | **Se eliminan del modelo** (los reportes sí se implementan; ver A4) |
| Producir al Instante | **Implementado en el software · pendiente de consulta al docente** si entra al diagrama como sexto `extend` (ver 8.7) |
| Modo de cobro | Nace en **Simulado**. El administrador lo cambia a **Real** desde su perfil (ver sección 9) |

> **Cambios respecto a la primera versión de este documento:** se retiró el antiguo Error 3 (no era redundancia real), el antiguo Error 5 se reclasificó de error a decisión de estilo, se agregaron 4 casos de uso de extensión y se incorporó la sección 4 sobre coherencia entre casos de uso y clases de análisis.

---

## Índice

1. [Lo que ya está correcto](#1-lo-que-ya-esta-correcto)
2. [Errores detectados y su corrección](#2-errores-detectados-y-su-correccion)
3. [Estado objetivo: 22 casos de uso y 12 relaciones](#3-estado-objetivo-22-casos-de-uso-y-12-relaciones)
4. [Coherencia entre casos de uso y clases de análisis](#4-coherencia-entre-casos-de-uso-y-clases-de-analisis)
5. [Tabla resumen de correcciones](#5-tabla-resumen-de-correcciones)
6. [Hallazgos de implementación](#6-hallazgos-de-implementacion)
7. [Auditoría de cobertura de requisitos](#7-auditoria-de-cobertura-de-requisitos)
8. [Producción al instante: extensión de CU-VEN-01](#8-produccion-al-instante--extension-de-cu-ven-01)
9. [Cobros en línea: RF-PED-04](#9-cobros-en-linea--rf-ped-04)
10. [Los cuatro reportes del sistema](#10-los-cuatro-reportes-del-sistema)
11. [Información del negocio y buscador: RF-PED-03](#11-informacion-del-negocio-y-buscador-del-encabezado--rf-ped-03)
12. [Paginación de los listados: hallazgo H7](#12-paginacion-de-los-listados--hallazgo-h7)
13. [Lo que la corrida dejó registrado: H5, H6 y H10](#13-lo-que-la-corrida-dejo-registrado--h5-h6-y-h10)
14. [Revisión de seguridad y consistencia](#14-revision-de-seguridad-y-consistencia)
15. [Anexo: la pregunta del docente](#15-anexo-la-pregunta-del-docente)

---

## 1. Lo que ya está correcto

Estos cuatro puntos **no se deben tocar** y sirven como argumento de defensa.

### 1.1 La frontera del sistema está bien trazada

Verificación de coordenadas en el archivo `.eapx`:

```
Frontera "Sistema NutriExpress":            izquierda = 740   derecha = 1780
Actores (Cliente, Empleado, Administrador): izquierda = 150   derecha = 260   → FUERA
Casos de uso (los 18 actuales):             entre 800 y 1700                  → DENTRO
```

> **Regla aplicada (Arlow, §4.3):** *"El sujeto se dibuja como un cuadro, etiquetado con el nombre del sistema, con los actores dibujados fuera del límite y los casos de uso dentro."*

### 1.2 `Verificar Disponibilidad de Stock` es un `include` correctamente construido

Cuatro casos de uso distintos lo invocan. Es **reutilización real**, no descomposición: el paso "verificar si hay stock" se repetía en cuatro flujos y se extrajo a un caso de uso aparte.

> **Regla aplicada (Arlow, §5.4):** *"«include» le permite resolver pasos repetidos en varios flujos de caso de uso en un caso de uso aparte que incluye donde sea necesario."*

### 1.3 Los casos de uso de inclusión y extensión no llevan actor

Correcto. Ningún actor entra al sistema con el objetivo de "verificar disponibilidad" o "bloquear su propia cuenta": esos comportamientos se activan desde otro caso de uso.

> **Regla aplicada (Arlow, §5.4):** un caso de uso de inclusión incompleto *"no se puede instanciar, es decir, no se puede activar directamente por los actores, solamente se puede ejecutar cuando está incluido en una base apropiada."*

### 1.4 `Iniciar Sesión` no se modeló como `include` de todos los casos de uso

Correcto. La autenticación es una **precondición**, no un paso incluido. Modelarla como `include` habría producido 21 flechas hacia un mismo óvalo.

---

## 2. Errores detectados y su corrección

### 🔴 ERROR 1 — Desajuste en la cantidad de casos de uso

**Qué se observa**

| Fuente | Cantidad |
|---|---|
| `Informe_Proyecto.docx`, sección 2.4.2 | **21** |
| `CasosDeUso_2.4.4.eapx` | **18** |
| **Objetivo acordado** | **22** |

**Dónde lo dice el informe**

Sección **2.4.2 "Casos de Uso"**, primera línea:

> *"El sistema comprende un total de 21 casos de uso distribuidos en cinco subsistemas."*

**Corrección a aplicar**

Adoptar la cifra de **22**, que resulta de:

```
18 casos de uso actuales del modelo
 − 0 (los 4 de Reportes ya no están en el modelo)
 + 4 casos de uso de extensión nuevos
─────
22
```

> ⚠️ Hay que tocar **tres lugares** del informe:
> - **2.4.2** — la frase "un total de 21 casos de uso" → **22**
> - **2.4.3 Priorización** — la tabla debe listar 22 filas
> - **2.4.4 Descripción** — debe haber 22 fichas

---

### 🔴 ERROR 2 — El código `CU-INV-06` identifica dos casos de uso distintos

**Qué se observa**

| Paquete del `.eapx` | Nombre asignado a `CU-INV-06` |
|---|---|
| `2.4.4 Diagramas de Casos de Uso` → Inventario | **Verificar Disponibilidad de Stock** |
| `3.3 Realización de Casos de Uso de Análisis` | **Reportes de Inventario** |

**Por qué importa**

Un código de caso de uso es un identificador único. Con dos significados, la trazabilidad entre el diagrama, la ficha de 2.4.4 y la especificación de 3.2 se rompe.

**Corrección a aplicar**

Al eliminar *Reportes de Inventario* del modelo, el código `CU-INV-06` queda libre y se asigna definitivamente a **Verificar Disponibilidad de Stock**. Ver la numeración completa en la [sección 3](#3-estado-objetivo-22-casos-de-uso-y-12-relaciones).

---

### 🔵 VERIFICACIÓN 3 — Venta y Pedido **no** deben incluir a *Gestionar Egreso*

> **Nota de revisión.** Una versión anterior de este documento proponía agregar
> `Venta «include» Egreso` y `Pedido «include» Egreso`. **Esa propuesta era
> incorrecta** y queda retirada. El motivo se detalla aquí porque es exactamente
> el tipo de incoherencia entre el diagrama de clases y el de casos de uso que el
> docente anticipó.

**El razonamiento que parecía correcto**

Los tres flujos —venta, pedido y orden de producción— descuentan stock. Si la
orden de producción declara `«include» Gestionar Egreso`, parecería que la venta y
el pedido deberían declararlo también, bajo el principio de que *ningún movimiento
de stock ocurre sin un documento que lo respalde*.

**Por qué el modelo de datos lo desmiente**

La tabla `nota_egreso` del script de la sección 4.5.3 lo impide de dos maneras:

```sql
CREATE TABLE nota_egreso (
    ...
    motivo       VARCHAR(20) NOT NULL,
    id_empleado  INT NOT NULL,          -- obligatorio
    CONSTRAINT ck_notaegr_motivo
        CHECK (motivo IN ('Produccion','Merma','Ajuste'))   -- no existe 'Venta'
);
```

1. **No hay motivo aplicable.** La restricción `CHECK` admite únicamente
   *Produccion*, *Merma* y *Ajuste*. Una venta o un pedido no encajan en ninguno.
2. **Exige un empleado.** `id_empleado` es `NOT NULL`. Cuando un cliente confirma
   un pedido desde el portal no interviene ningún empleado, de modo que la fila no
   podría crearse.

**Qué dice el propio informe**

Las especificaciones son consistentes con el esquema: **nunca** mencionan una nota
de egreso en venta ni en pedido.

| Caso de uso | Texto literal del flujo del sistema |
|---|---|
| **CU-VEN-01** | *"El sistema descuenta las cantidades del almacén correspondiente."* |
| **CU-PED-02** | *"El sistema descuenta las cantidades del almacén correspondiente."* |
| **CU-INV-04** | *"...o el sistema la genera automáticamente **al finalizar una orden de producción**."* |

**Dónde queda entonces la trazabilidad del movimiento**

El documento que respalda la salida ya existe: es el **propio detalle de la venta o
del pedido**, cuya clave primaria incluye el almacén de origen.

```sql
CREATE TABLE detalle_pedido (
    id_pedido    INT NOT NULL,
    id_producto  INT NOT NULL,
    id_almacen   INT NOT NULL,      -- de qué almacén salió
    cantidad     INT NOT NULL,
    ...
    PRIMARY KEY (id_pedido, id_producto, id_almacen)
);
```

`nota_egreso` documenta las salidas **que no tienen otro documento**: consumo de
insumos por producción, mermas y ajustes de inventario. Las ventas y los pedidos ya
son su propio documento.

**Conclusión**

Se mantienen únicamente estos vínculos con el egreso:

```
Gestionar Orden de Produccion  --<<include>>-->  Gestionar Egreso
Gestionar Egreso               --<<include>>-->  Verificar Disponibilidad de Stock
```

> **Para la defensa.** Si el jurado pregunta *"¿por qué la venta no genera una nota
> de egreso si descuenta stock?"*, la respuesta es: *porque el detalle de la venta ya
> registra el almacén de origen y hace las veces de documento. La nota de egreso
> existe para las salidas que no quedan documentadas por otra vía —producción, merma
> y ajuste—, y por eso su restricción `CHECK` solo admite esos tres motivos.*

---

### 🟠 ERROR 4 — Faltan los casos de uso de extensión

**Qué se observa**

El modelo tiene un solo `extend` (`Pagar Pedido en Línea`). Las secciones **"Variaciones y Extensiones"** de la especificación 3.2 documentan cuatro comportamientos condicionales más que no están modelados.

**Por qué importa**

Un diagrama con muy pocos `include` / `extend` no muestra la estructura interna del modelo. Es la observación que hizo el docente: *"los diagramas sin include ni extend son más como diagramas de casos de uso de alto nivel."*

**Corrección a aplicar**

Agregar los 4 casos de uso de extensión, todos con respaldo textual en el informe:

| Caso de uso nuevo | Texto de origen |
|---|---|
| **Bloquear Cuenta por Intentos Fallidos** | CU-SEG-01: *"Si se alcanzan tres intentos fallidos consecutivos, el sistema bloquea la cuenta y registra la fecha del bloqueo."* |
| **Registrar Valor Nutricional** | CU-PRO-01: *"La información nutricional es **opcional** y puede registrarse posteriormente."* |
| **Cancelar Pedido** | CU-PED-02: *"El cliente puede cancelar el pedido mientras no haya pasado al estado En camino."* |
| **Cancelar Orden de Producción** | CU-PRO-02: *"El empleado puede cancelar una orden mientras se encuentre en estado Pendiente o En proceso."* |

> **Nota:** `Registrar Valor Nutricional` y `Cancelar Pedido` **ya existían** en la versión de 40 casos de uso (`CU-PRO-02` y `CU-PED-09`). Se fusionaron al consolidar el modelo; reponerlos como extensiones es volver a algo ya identificado correctamente.

---

### 🟡 ERROR 5 — Dos nombres casi idénticos que se prestan a confusión

**Qué se observa**

| Caso de uso | Actor | Propósito |
|---|---|---|
| `Control de Stock` | Empleado, Administrador | **Consultar** existencias y ver alertas |
| `Verificar Disponibilidad de Stock` | *(ninguno — es include)* | **Validar** internamente antes de descontar |

**Corrección a aplicar**

Renombrar el segundo a **`Validar Stock Disponible`** o **`Comprobar Existencias`**.

---

### 🟡 ERROR 6 — El diagrama individual de `CU-INV-06` contiene un solo objeto

**Qué se observa**

El diagrama `CU-INV-06 - Verificar Disponibilidad de Stock` tiene **1 objeto**: únicamente el óvalo.

**Corrección a aplicar**

Agregar los cuatro casos de uso que lo invocan con sus flechas `«include»`:

```
Gestionar Venta                ──«include»──▶ ┐
Gestionar Pedido               ──«include»──▶ ├──▶ Verificar Disponibilidad de Stock
Gestionar Orden de Producción  ──«include»──▶ │
Gestionar Egreso               ──«include»──▶ ┘
```

---

### 🟡 ERROR 7 — Los `include` / `extend` están creados como `Dependency`

**Qué se observa**

Las relaciones son de tipo `Dependency` con estereotipo `«include»` o `«extend»`.

**Por qué importa**

Visualmente se dibujan igual, pero en UML 2 `Include` y `Extend` son **metaclases propias**, no dependencias estereotipadas.

**Corrección a aplicar** *(opcional, bajo impacto)*

En Enterprise Architect, usar los conectores **Include** y **Extend** del toolbox de Casos de Uso en lugar de *Dependency* + estereotipo.

---

### 🟡 ERROR 8 — Los nombres de casos de uso siguen el patrón "Gestionar X"

**Qué se observa**

12 de los casos de uso comienzan con "Gestionar", el mismo vocabulario del anti-patrón que Arlow ilustra con `GestionarBiblioteca` → `MantenerLibros` → `AñadirLibro`.

> **Regla aplicada (Arlow, §4.3.3):** *"Cada caso de uso debe tener asignado un nombre descriptivo, breve, que es una frase verbal; después de todo, el caso de uso es hacer algo."*

**Importante:** el modelo **no es** una descomposición funcional. Es plano, no parte de un caso de uso único, no tiene jerarquías de más de un nivel y cada caso de uso tiene especificación propia. El problema está en el **nombre**, no en la estructura.

La propia especificación lo confirma: el propósito de `Gestionar Venta` dice *"**Registrar** las ventas realizadas de forma presencial"*.

**Corrección a aplicar**

| Nombre actual | Nombre propuesto |
|---|---|
| Gestionar Venta | Registrar Venta |
| Gestionar Ingreso | Registrar Nota de Ingreso |
| Gestionar Egreso | Registrar Nota de Egreso |
| Gestionar Pedido | Registrar Pedido |
| Control de Stock | Consultar Stock |

---

### ✅ Puntos retirados de la versión anterior de este documento

| Punto | Por qué se retiró |
|---|---|
| *"`Orden de Producción «include» Verificar Disponibilidad` es redundante"* | **Falso.** Son dos momentos distintos del flujo: la verificación al **planificar** la orden y la validación al **finalizar**, dentro del egreso. CU-PRO-02 lo dice: *"calcula los insumos requeridos… y verifica su disponibilidad. **Al finalizar la orden** se generan… la nota de egreso…"* |
| *"`Gestionar Pedido «include» Gestionar Ubicación` es un error"* | **Reclasificado a decisión de estilo.** Arlow admite el caso: *"Si los casos de uso de inclusión están completos, actúan como casos de uso normales y se pueden instanciar."* `Gestionar Ubicación` está completo y tiene actor. **Se conserva.** |

---

## 3. Estado objetivo: 22 casos de uso y 12 relaciones

### 3.1 Regla de dirección — léala antes de dibujar

Es el error más común y va **al revés** en cada tipo:

| Tipo | La flecha sale de… | …y apunta a… |
|---|---|---|
| `«include»` | el caso de uso **base** | el caso de uso **incluido** |
| `«extend»` | el caso de uso **extensión** | el caso de uso **base** |

### 3.2 Los 7 `include`

| # | Origen (base) | | Destino (incluido) | Por qué siempre ocurre |
|---|---|---|---|---|
| 1 | Gestionar Venta | ──▶ | Verificar Disponibilidad de Stock | Antes de agregar cada producto hay que validar existencias |
| 2 | Gestionar Pedido | ──▶ | Verificar Disponibilidad de Stock | Igual que la venta, al armar el carrito |
| 3 | Gestionar Pedido | ──▶ | Gestionar Ubicación | Todo pedido requiere dirección de entrega |
| 4 | Gestionar Orden de Producción | ──▶ | Verificar Disponibilidad de Stock | Al planificar: ¿alcanzan los insumos para N porciones? |
| 5 | Gestionar Orden de Producción | ──▶ | Gestionar Egreso | Al finalizar: salen los insumos consumidos |
| 6 | Gestionar Orden de Producción | ──▶ | Gestionar Ingreso | Al finalizar: entra el producto terminado |
| 7 | Gestionar Egreso | ──▶ | Verificar Disponibilidad de Stock | Toda salida valida antes de descontar |

### 3.3 Los 5 `extend`

| # | Origen (extensión) | | Destino (base) | Condición |
|---|---|---|---|---|
| 8 | Pagar Pedido en Línea | ──▶ | Gestionar Pedido | `{método de pago ≠ efectivo}` |
| 9 | Cancelar Pedido | ──▶ | Gestionar Pedido | `{estado ≠ En camino}` |
| 10 | Bloquear Cuenta por Intentos Fallidos | ──▶ | Iniciar Sesión | `{tres intentos fallidos consecutivos}` |
| 11 | Cancelar Orden de Producción | ──▶ | Gestionar Orden de Producción | `{estado ∈ (Pendiente, En proceso)}` |
| 12 | Registrar Valor Nutricional | ──▶ | Gestionar Producto y Receta | `{se registra información nutricional}` |

### 3.4 Vista por caso de uso — para verificar uno por uno

**Los 9 que tienen relaciones saliendo:**

| Caso de uso | Qué usa |
|---|---|
| **Gestionar Venta** | `include` → Verificar Disponibilidad de Stock |
| **Gestionar Pedido** | `include` → Verificar Disponibilidad de Stock<br>`include` → Gestionar Ubicación |
| **Gestionar Orden de Producción** | `include` → Verificar Disponibilidad de Stock<br>`include` → Gestionar Egreso<br>`include` → Gestionar Ingreso |
| **Gestionar Egreso** | `include` → Verificar Disponibilidad de Stock |
| **Pagar Pedido en Línea** | `extend` → Gestionar Pedido |
| **Cancelar Pedido** | `extend` → Gestionar Pedido |
| **Bloquear Cuenta por Intentos Fallidos** | `extend` → Iniciar Sesión |
| **Cancelar Orden de Producción** | `extend` → Gestionar Orden de Producción |
| **Registrar Valor Nutricional** | `extend` → Gestionar Producto y Receta |

**Los 6 que solo reciben relaciones:**

| Caso de uso | Quién lo usa |
|---|---|
| **Verificar Disponibilidad de Stock** | Lo incluyen **4**: Venta, Pedido, Orden de Producción y Egreso |
| **Gestionar Egreso** | Lo incluye **1**: Gestionar Orden de Producción |
| **Gestionar Ubicación** | Lo incluye **1**: Gestionar Pedido |
| **Gestionar Ingreso** | Lo incluye **1**: Gestionar Orden de Producción |
| **Iniciar Sesión** | Lo extiende **1**: Bloquear Cuenta |
| **Gestionar Producto y Receta** | Lo extiende **1**: Registrar Valor Nutricional |

> `Gestionar Egreso` aparece en las dos listas: **incluye** a Verificar Disponibilidad y **es incluido** por la orden de producción. Es correcto — un caso de uso puede ser base e incluido a la vez.

**Los 8 sin ninguna relación — y está bien que así sea:**

`Gestionar Usuario` · `Gestionar Rol y Permisos` · `Asignar Permisos a Usuario` · `Gestionar Cliente` · `Buscar Productos` · `Gestionar Insumo` · `Gestionar Almacén` · `Control de Stock`

> Son CRUDs y consultas autocontenidos. Forzarles relaciones sería justo lo que Arlow advierte.

### 3.5 Numeración de los 22 casos de uso

Al quitar los 4 reportes quedan códigos libres que encajan sin renumerar nada:

| Subsistema | Casos de uso |
|---|---|
| **Seguridad** (5) | `CU-SEG-01` Iniciar Sesión · `CU-SEG-02` Gestionar Usuario · `CU-SEG-03` Gestionar Rol y Permisos · `CU-SEG-04` Asignar Permisos a Usuario · **`CU-SEG-05` Bloquear Cuenta por Intentos Fallidos** |
| **Ventas** (2) | `CU-VEN-01` Gestionar Venta · `CU-VEN-02` Gestionar Cliente |
| **Pedidos** (5) | `CU-PED-01` Buscar Productos · `CU-PED-02` Gestionar Pedido · `CU-PED-03` Gestionar Ubicación · `CU-PED-04` Pagar Pedido en Línea · **`CU-PED-05` Cancelar Pedido** |
| **Producción** (4) | `CU-PRO-01` Gestionar Producto y Receta · `CU-PRO-02` Gestionar Orden de Producción · **`CU-PRO-03` Registrar Valor Nutricional** · **`CU-PRO-04` Cancelar Orden de Producción** |
| **Inventario** (6) | `CU-INV-01` Gestionar Insumo · `CU-INV-02` Gestionar Almacén · `CU-INV-03` Gestionar Ingreso · `CU-INV-04` Gestionar Egreso · `CU-INV-05` Control de Stock · **`CU-INV-06` Verificar Disponibilidad de Stock** |

### 3.6 Trabajo pendiente que genera esta decisión

Los 4 casos de uso nuevos necesitan:

- Su **ficha en 2.4.4** (formato de alto nivel: nombre, actores, propósito, resumen, tipo, referencia cruzada)
- Su **especificación en 3.2** (formato expandido, pero más corta: describe el **segmento de inserción** con sus precondiciones, flujo y postcondiciones, como en la figura 5.13 del libro)
- Su **fila en la tabla de priorización 2.4.3**
- Su **diagrama individual** en el paquete 2.4.4 del `.eapx`

---

## 4. Coherencia entre casos de uso y clases de análisis

> **Observación del docente:** *"lo primero que no cuadra sería el diagrama de clases con el caso de uso: van a aparecer casos de uso sin relacionar y cuando estemos en el diagrama de comunicación ya estarán relacionados."*

### 4.1 Qué está comprobando

Va a poner los dos diagramas lado a lado y buscar esto:

> *Si dos casos de uso aparecen **sueltos** en el diagrama de casos de uso, pero en el diagrama de comunicación **comparten clases**, entonces hay una relación que el diagrama de casos de uso no está mostrando.*

### 4.2 La distinción que decide todo

| Qué comparten | ¿Es problema? | Por qué |
|---|---|---|
| Una clase **entidad** (`tbl…`) | ❌ **Normal** | Dos casos de uso pueden leer la misma tabla sin relacionarse. Es reutilización de **datos** |
| Una clase **control** (`ctrl…`) | ⚠️ **Señal de alerta** | La clase control encapsula el **comportamiento** del caso de uso. Si dos casos de uso comparten controlador, o son el mismo caso de uso, o uno incluye al otro |

### 4.3 Los tres casos que sí son señal en su modelo

#### ⚠️ `Control de Stock` y `Verificar Disponibilidad de Stock` comparten `ctrlStock`

```
CU-INV-05 Control de Stock         :: ctrlStock, tblIngredienteAlmacen, tblProductoAlmacen, tblIngrediente
CU-INV-06 Verificar Disponibilidad :: ctrlStock, tblIngredienteAlmacen, tblProductoAlmacen
```

Mismo controlador y prácticamente las mismas entidades, pero en el diagrama de casos de uso están desconectados.

**Corrección:** justificarlo por escrito en el informe:

> *"`ctrlStock` es el controlador del stock con dos operaciones distintas: `consultarStock()` para la consulta del actor y `verificarDisponibilidad(producto, cantidad)` para la validación que invocan otros casos de uso. Comparten controlador porque operan sobre la misma entidad, pero responden a objetivos distintos."*

#### ⚠️ `Iniciar Sesión` y `Gestionar Usuario` comparten `ctrlUsuario`

```
CU-SEG-01 Iniciar Sesión    :: frmLogin, ctrlUsuario, tblUsuario
CU-SEG-02 Gestionar Usuario :: frmUsuario, ctrlUsuario, tblUsuario, tblRol
```

Autenticar y administrar cuentas son responsabilidades distintas en un mismo controlador.

**Corrección:** separar en `ctrlLogin` (autenticación) y `ctrlUsuario` (CRUD). El paquete `Clases de Análisis` (versión A) **ya tenía `ctrlLogin` separado**; la Versión B lo fusionó.

#### ⚠️ `Buscar Productos` y `Gestionar Producto y Receta` comparten `ctrlProducto`

```
CU-PED-01 Buscar Productos            :: frmCatalogo, ctrlProducto, tblProducto, tblCategoria
CU-PRO-01 Gestionar Producto y Receta :: frmProducto, ctrlProducto, tblProducto, tblValorNutricional, tblReceta
```

Consultar el catálogo (solo lectura, actor Cliente) y mantener productos (escritura, actor Administrador/Empleado) son cosas distintas.

**Corrección:** restituir **`ctrlCatalogo`** separado. La versión A también lo tenía.

### 4.4 Lo que está bien y puede defender

Estos comparten **solo entidades**, que es normal:

| Casos de uso | Comparten | Por qué está bien |
|---|---|---|
| Gestionar Usuario ↔ Gestionar Rol y Permisos | `tblRol` | Uno asigna el rol, otro lo define |
| Asignar Permisos ↔ Gestionar Rol y Permisos | `tblRolPermiso` | Uno crea las combinaciones, otro las habilita |
| Gestionar Cliente ↔ Iniciar Sesión | `tblUsuario` | El cliente es un usuario |
| Gestionar Insumo ↔ Control de Stock | `tblIngrediente` | Uno mantiene el catálogo, otro consulta existencias |
| Ingreso ↔ Egreso ↔ Venta ↔ Pedido ↔ Producción | `tblProductoAlmacen` | **Es el corazón del sistema.** Siete casos de uso tocan el stock |

**Y uno queda correctamente aislado:**

```
CU-INV-02 Gestionar Almacén :: frmAlmacen, ctrlAlmacen, tblAlmacen
```

No comparte nada con nadie. Su aislamiento en el diagrama de casos de uso es coherente con el modelo de clases.

### 4.5 Problema adicional: dos paquetes de clases en paralelo

El `.eapx` tiene **dos modelos de análisis que no coinciden**:

| Paquete | Controladores distintivos | Entidades | Cubre |
|---|---|---|---|
| `Clases de Análisis` (A) | `ctrlLogin`, `ctrlCatalogo`, `ctrlRol`, `ctrlPermiso`, 4 `ctrlReporte*` | 18 tablas | 21 casos de uso |
| `Clases de Análisis (Versión B)` | `ctrlRolPermiso`, `ctrlAsignarPermiso` | 26 tablas | 18 casos de uso |

Ninguna es completa: **A tiene los controladores mejor separados, B tiene el modelo de datos completo.**

**Corrección:** consolidar en uno solo — la separación de controladores de A más las entidades de B.

### 4.6 Acciones de esta sección

| # | Acción |
|---|---|
| 1 | Consolidar los dos paquetes de clases de análisis en uno |
| 2 | Restituir `ctrlLogin` separado de `ctrlUsuario` |
| 3 | Restituir `ctrlCatalogo` separado de `ctrlProducto` |
| 4 | Documentar por qué `ctrlStock` sirve a dos casos de uso |
| 5 | Agregar al informe una **matriz caso de uso ↔ clases de análisis** |

> Sobre el punto 5: una tabla con los casos de uso en las filas y las clases en las columnas. Es el artefacto que responde la observación del docente sin que él tenga que buscarla.

### 4.7 Cómo responder si le pregunta

> *"Compartir una clase entidad entre casos de uso no implica una relación `include`: `Iniciar Sesión` y `Gestionar Cliente` leen ambos `tblUsuario` y son objetivos independientes. Lo que sí revisé fue el compartir **clases de control**, porque ésas encapsulan el comportamiento del caso de uso. Encontré tres casos y los separé: `ctrlLogin` de `ctrlUsuario`, y `ctrlCatalogo` de `ctrlProducto`. El tercero, `ctrlStock`, sirve a dos casos de uso a propósito, porque son dos operaciones sobre la misma entidad con objetivos distintos, y lo documenté."*

---

## 5. Tabla resumen de correcciones

| # | Corrección a aplicar | Gravedad | Dónde |
|---|---|---|---|
| 1 | Ajustar la cantidad a **22 casos de uso** en 2.4.2, 2.4.3 y 2.4.4 | 🔴 Alta | Informe |
| 2 | Liberar `CU-INV-06` para *Verificar Disponibilidad de Stock* | 🔴 Alta | Informe + EA |
| 3 | **No** agregar `Venta/Pedido «include» Gestionar Egreso`: el esquema lo desmiente (ver Verificación 3) | 🔵 Informativa | — |
| 4 | Agregar los 4 casos de uso de extensión con sus `«extend»` | 🟠 Media | EA + Informe |
| 5 | Consolidar los dos paquetes de clases de análisis | 🟠 Media | EA |
| 6 | Separar `ctrlLogin` de `ctrlUsuario` y `ctrlCatalogo` de `ctrlProducto` | 🟠 Media | EA |
| 7 | Renombrar `Verificar Disponibilidad de Stock` → `Validar Stock Disponible` | 🟡 Baja | EA + Informe |
| 8 | Completar el diagrama individual con sus 4 invocadores | 🟡 Baja | EA |
| 9 | Cambiar conectores de `Dependency` a `Include` / `Extend` nativos | 🟡 Baja | EA |
| 10 | Renombrar los "Gestionar X" a verbos de objetivo | 🟡 Baja | EA + Informe |
| 11 | Agregar la matriz caso de uso ↔ clases de análisis | 🟡 Baja | Informe |

---

## 6. Hallazgos de implementación

Esta sección registra lo que apareció **al construir el software**, no al leer el
documento. Cada entrada indica la evidencia que la respalda, porque de eso
depende su validez.

> **Regla de dirección.** La dirección normal es *informe → software*: la
> especificación manda y el código la sigue. La inversa —*software → informe*—
> solo es admisible cuando la implementación revela una contradicción o una
> imposibilidad real, y siempre citando evidencia **externa al código**: el
> script de la sección 4.5.3, una frase de la especificación o una restricción
> del motor. Un cambio cuya única justificación sea *"así lo programé"* no es
> válido.

### 6.1 Resumen

| # | Hallazgo | Etapa | Dónde se corrige | Estado |
|---|---|---|---|---|
| H1 | Faltan dos `CHECK` en `ingrediente` | 2 | Script 4.5.3 | ✅ Aplicado |
| H2 | La variación y la excepción de "receta activa" se contradicen | 3 | Ficha CU-PRO-01 | ⏳ Pendiente |
| H3 | El tipo de conservación no existe en insumo ni producto | 4 | Script 4.5.3 + fichas | ✅ Aplicado (opción A) |
| H4 | La orden de producción no registra el almacén de destino | 5 | Ficha CU-PRO-02 | ✅ Resuelto en código · falta la ficha |
| H5 | No está definido el costo del producto obtenido | 5 | Ficha CU-PRO-02 | ✅ Definido y **registrado** (§13) · falta la ficha |
| C6 | `CLIENTE_GESTIONAR` definido pero sin ninguna ruta que lo usara | 6 | Código | ✅ Resuelto |
| C7 | El cliente no podía modificar sus propios datos | 6 | Código | ✅ Resuelto |
| O1 | No existe tabla de precios ni historial de precios | 6 | — | 🔵 Observación |
| H6 | Una orden finalizada muestra la receta de hoy, no la que usó | Revisión | Código | ✅ Corregido (§13) |
| H7 | Ningún listado tiene paginación ni filtro por fecha | Revisión | Código | ✅ Corregido (§12) |
| H8 | El bloqueo por intentos fallidos permite dejar sin acceso a todo el personal | Revisión | Código + ficha CU-SEG-05 | ✅ Corregido: desbloqueo automático por tiempo |
| H9 | Bloquear o dar de baja a un usuario no invalida su sesión abierta | Revisión | Código | ✅ Corregido: cada petición contrasta el estado de la cuenta |
| H10 | La producción no admite mermas: ingresa siempre lo planificado | Revisión | Código + ficha CU-PRO-02 | ✅ Corregido (§13) · falta la ficha |
| H11 | Nada avisa si el precio de venta queda por debajo del costo | Revisión | — | 🔵 Observación |
| H12 | El bloqueo de cuentas permitía expulsar de su sesión al dueño de la cuenta | Revisión 2 | Código | ✅ Corregido (§14) |
| H13 | Tres listados paginados sin índice por fecha | Revisión 2 | Script 4.5.3 | ✅ Corregido (§14) |
| H14 | La regla de la hora local estaba escrita en tres sitios | Revisión 2 | Código | ✅ Corregido (§14) |
| V1 | CU-PED-02 resultó implementable tal como está escrito | 1 | — | ✅ Verificado |
| V2 | Los permisos del seed ya coincidían con los actores | 2 | — | ✅ Verificado |
| V3 | El índice `ux_receta_activa` ya garantiza RF-PRO-04 | 3 | — | ✅ Verificado |
| V4 | Las dos verificaciones de stock de la orden **no** son redundantes | 5 | — | ✅ Verificado |
| V5 | Un cliente con pedidos o ventas nunca se elimina: solo hay baja lógica | 6 | — | ✅ Verificado |
| V6 | El comprobante de venta no necesita tabla propia | 6 | — | ✅ Verificado |
| V7 | La producción al instante respeta los lotes y el FEFO | Revisión | — | ✅ Verificado |
| V8 | Venta y producción compiten por el stock sin corromperlo | Revisión | — | ✅ Verificado |

---

### H1 · Faltan dos restricciones `CHECK` en `ingrediente`

**Qué se observó.** CU-INV-01 indica: *"El sistema valida que el costo unitario
y el stock mínimo no sean negativos."* La validación quedó implementada en la
capa de aplicación, pero el script no la sostiene en la base.

**Evidencia.** El propio script defiende el caso equivalente en `producto`:

```sql
producto:    CONSTRAINT ck_producto_precio CHECK (precio_venta >= 0)     ✅
ingrediente: (ninguna sobre costo_unitario ni stock_minimo)              ❌
```

**Por qué importa.** Es una asimetría que un jurado puede señalar: *"¿por qué el
precio del producto se defiende en la base y el costo del insumo no?"*

**Corrección — ✅ aplicada al script.** Se agregaron a la tabla `ingrediente`:

```sql
CONSTRAINT ck_ingrediente_costo  CHECK (costo_unitario >= 0),
CONSTRAINT ck_ingrediente_minimo CHECK (stock_minimo >= 0)
```

> **Pendiente en el `.docx`:** copiar la tabla `ingrediente` actualizada a la
> sección 4.5.3.

---

### H2 · La variación y la excepción de "receta activa" se contradicen

**Qué se observó.** La ficha CU-PRO-01 afirma dos cosas que no pueden ser ambas
ciertas de la misma acción:

| Apartado | Texto |
|---|---|
| Variación | *"Al activar una nueva versión de receta, el sistema **desactiva automáticamente la anterior**."* |
| Excepción | *"Si se intenta activar una segunda receta para el mismo producto, el sistema **rechaza la operación**."* |

**Resolución adoptada.** Describen **dos operaciones distintas**, que es la única
lectura coherente:

- **Registrar** una versión marcándola activa mientras ya hay otra vigente → se
  rechaza. Es un accidente.
- **Activar** explícitamente una versión → desactiva la anterior en la misma
  transacción. Es una decisión deliberada.

En consecuencia, las versiones nuevas nacen **inactivas** por omisión y existe
una operación aparte para el relevo.

**Corrección.** Redactar así los dos apartados en la ficha CU-PRO-01, para que
quede explícito que se refieren a acciones diferentes.

---

### H3 · El tipo de conservación no tiene atributo en insumo ni producto

**Qué se observó.** CU-INV-02 afirma:

> *"El tipo de conservación determina qué insumos y productos pueden almacenarse
> en cada almacén."*

**Evidencia.** `tipo_conservacion` existe **únicamente** en la tabla `almacen`.
Ni `ingrediente` ni `producto` declaran qué conservación requieren, de modo que
el sistema no tiene con qué comparar. **La regla es hoy inaplicable**, y no se
implementó ninguna validación inventada.

**Corrección — ✅ aplicada la opción A: ampliar el esquema.**

Se agregó el atributo a las dos tablas, con la misma restricción de valores que
ya tenía `almacen`:

```sql
-- en ingrediente y en producto
tipo_conservacion   VARCHAR(20) NOT NULL DEFAULT 'Seco',
CONSTRAINT ck_<tabla>_conservacion CHECK (tipo_conservacion IN ('Seco','Refrigerado'))
```

El valor por omisión es `Seco`, la condición menos restrictiva, de modo que el
atributo no obliga a rehacer los datos existentes.

**La regla pasó a ser real.** Al registrar una nota de ingreso, el sistema
rechaza guardar un ítem en un almacén cuya conservación no coincide:

> *Conservación incompatible: el insumo "Yogur griego natural" requiere
> conservación Refrigerado y el almacén "Almacen Seco" es Seco.*

La validación se aplica **solo al ingreso**, que es donde se decide el destino.
El egreso saca lo que ya está guardado: ahí no hay destino que elegir.

**Pendiente en el `.docx` —** tres cambios que acompañan a este:

| Dónde | Qué cambia |
|---|---|
| Sección 4.5.3 | Copiar las tablas `ingrediente` y `producto` con la nueva columna y su `CHECK` |
| Ficha CU-INV-01 | Agregar al flujo del actor: *"El empleado define el tipo de conservación del insumo"* |
| Ficha CU-PRO-01 | Agregar al flujo del actor: *"El actor define el tipo de conservación del producto"* |
| Ficha CU-INV-03 | Agregar a excepciones: *"Si la condición de conservación del ítem no coincide con la del almacén de destino, el sistema rechaza el registro"* |

Con esto, la variación de CU-INV-02 —*"el tipo de conservación determina qué
insumos y productos pueden almacenarse en cada almacén"*— deja de ser una
afirmación sin respaldo y pasa a ser una regla que el sistema verifica.

---

### V1 · CU-PED-02 resultó implementable tal como está escrito

Al construir el lado del empleado —avance de estados y asignación de
repartidor— no hizo falta ninguna corrección. El flujo *recibido → en
preparación → en camino → entregado*, la precondición de asignar repartidor
antes de marcar en camino y la restricción de que solo el cargo Repartidor puede
asignarse estaban todos especificados de forma implementable.

*Se registra porque la verificación también vale cuando confirma.*

---

### V2 · Los permisos del seed ya coincidían con los actores

CU-INV-02 declara como actor al **Administrador** y CU-INV-01 al **Empleado**.
El catálogo de permisos definido en el módulo de seguridad ya otorgaba
`INSUMO_GESTIONAR` al rol Empleado pero **no** `ALMACEN_GESTIONAR`. No hubo que
ajustar nada; hay una prueba automatizada que lo verifica.

---

### V3 · El índice `ux_receta_activa` ya garantiza RF-PRO-04

RF-PRO-04 exige *"una sola receta activa a la vez"* por producto. El script ya
lo sostiene en la base:

```sql
CREATE UNIQUE INDEX ux_receta_activa ON receta (id_producto) WHERE activa;
```

**Advertencia técnica derivada.** Prisma introspecta ese índice parcial como un
`UNIQUE` completo y, en consecuencia, modela `producto.receta` como una relación
**uno a uno**, cuando en realidad un producto tiene varias versiones. Esa
relación no se usa en el código; las recetas se consultan por su propio modelo.
Queda anotado para que nadie la utilice por descuido.

---

### H4 · La orden de producción no registra el almacén de destino

**Qué se observó.** Al finalizar una orden, el producto terminado ingresa a un
almacén. Ni la tabla `orden_produccion` tiene una columna para indicarlo, ni la
ficha CU-PRO-02 dice quién lo decide.

**Evidencia.** Las columnas de la tabla son `id_receta`, `cantidad`, `estado`,
`fecha_finalizacion`, `id_empleado`, `id_nota_egreso` e `id_nota_ingreso`. El
almacén solo aparece más abajo, en `detalle_ingreso_producto`, que sí lo exige.

**Solución adoptada.** El sistema lo **deduce de la condición de conservación
del producto**, que existe gracias a la corrección H3. Si hay un solo almacén
compatible, lo usa sin preguntar; si hay varios, pide que se indique; si no hay
ninguno, lo informa. El empleado puede indicarlo siempre que quiera, y entonces
se valida que sea compatible.

Esta salida no inventa una regla: aplica la que CU-INV-02 ya declara —*"cada
insumo y producto permanece en el almacén que corresponde a su condición"*—.

**Pendiente en el `.docx`.** Agregar al flujo del sistema de CU-PRO-02:

> *"El sistema determina el almacén de destino del producto terminado según su
> condición de conservación; si existe más de un almacén compatible, solicita al
> empleado que indique cuál."*

---

### H5 · No está definido el costo del producto obtenido

**Qué se observó.** `detalle_ingreso_producto.costo_unitario` es `NOT NULL`, de
modo que la nota de ingreso generada al finalizar la orden **obliga** a
asignarle un costo al producto terminado. Ninguna ficha dice cuál.

**Solución adoptada.** El costo de la corrida —la suma de cantidad por costo
unitario de los insumos consumidos— repartido entre las porciones producidas.

Para la receta de barras de avena: 0,24 kg × Bs 14 + 0,08 kg × Bs 65 +
0,12 kg × Bs 11 = **Bs 9,88** por corrida de 4 porciones, es decir **Bs 2,47**
por unidad.

**Por qué es la lectura correcta.** RF-PRO-08 pide un reporte que muestre *"los
insumos consumidos y el costo por corrida"*. El dato que ese requisito necesita
es justamente el que aquí se calcula, de modo que la definición no es
arbitraria: la exige otro requisito del propio informe.

**Pendiente en el `.docx`.** Agregar al flujo del sistema de CU-PRO-02:

> *"El sistema calcula el costo de la corrida como la suma del costo de los
> insumos consumidos, y lo distribuye entre las porciones obtenidas para
> registrar el costo unitario del producto terminado."*

---

### V4 · Las dos verificaciones de stock de la orden no son redundantes

Una versión anterior de este documento se preguntaba si
`Gestionar Orden de Producción «include» Verificar Disponibilidad de Stock` era
redundante, dado que `Gestionar Egreso` ya incluye esa verificación.

**No lo es, y la implementación lo confirma.** Son dos momentos separados en el
tiempo:

| Momento | Qué verifica | Qué ocurre si falla |
|---|---|---|
| **Al planificar** | ¿Alcanzan los insumos para N porciones? | La orden no llega a registrarse |
| **Al ejecutar** | ¿Siguen alcanzando ahora? | Se revierte toda la transacción |

Entre ambos momentos la orden puede pasar días en estado Pendiente, y otras
operaciones —una merma, otra orden— consumen los mismos insumos. La segunda
comprobación es la que decide.

La ficha CU-PRO-02 lo respalda literalmente: *"verifica la disponibilidad…
registra la orden con estado Pendiente"* y, más abajo, *"**Al finalizar la
orden**, el sistema genera una nota de egreso…"*.

---

### C6 · `CLIENTE_GESTIONAR` estaba definido pero ninguna ruta lo usaba

**Qué se observó.** Al auditar qué permisos del catálogo tenían ruta asociada,
tres quedaban sin usar: `VENTA_REGISTRAR`, `VENTA_LEER` y `CLIENTE_GESTIONAR`.
Los dos primeros correspondían a trabajo aún no hecho; el tercero revelaba algo
distinto.

**Por qué importaba.** CU-VEN-02 declara dos actores: **Empleado** y Cliente. El
rol Empleado tiene `CLIENTE_GESTIONAR` en el seed, pero no existía ninguna ruta
que lo exigiera, y `/api/usuarios` requiere permisos de administración que ese
rol no tiene. Es decir: **un empleado no podía gestionar clientes**, aunque
RF-VEN-01 lo exige —*"registrar, modificar y consultar los datos de los
clientes"*—.

**Resuelto.** Se agregó `/api/clientes` con el permiso correspondiente, incluida
la búsqueda por nombre o correo y la cantidad de pedidos y ventas de cada ficha.

---

### C7 · El cliente no podía modificar sus propios datos

**Qué se observó.** CU-VEN-02 declara la variación: *"El cliente puede modificar
sus propios datos, pero no los de otros clientes."* No estaba implementada.

Solo existía `GET /api/auth/perfil`, de lectura. Y como el rol Cliente no tiene
`USUARIO_EDITAR`, tampoco podía usar la ruta de administración: un cliente
registrado no tenía **ninguna** forma de corregir su teléfono o declarar una
restricción dietética.

**Resuelto.** `GET` y `PUT /api/clientes/perfil`. El identificador de la ficha
sale siempre de la sesión y nunca de la URL, de modo que no existe forma de
apuntar a la ficha de otro. El esquema de autoservicio tampoco admite `activo`:
dar de baja una cuenta es decisión del personal, no del titular.

---

### O1 · No existe tabla de precios ni historial de precios

**Qué se observó.** El modelo no tiene una entidad `Precio` asociada a producto
que registre los cambios de precio en el tiempo. Se verificó en las tres
fuentes: el informe no la menciona en ningún RF, alcance ni ficha; el script
4.5.3 no la declara; y el `.eapx` no contiene ninguna clase con ese nombre —el
control de la búsqueda sí encontró `tblProducto`, `tblVenta` y `tblReceta`—.

**Por qué no es una incoherencia.** RF-PRO-01 modela el precio como un atributo
mutable: *"registrar y modificar productos indicando su categoría y precio de
venta"*. No hay ninguna promesa incumplida.

**Y la propiedad crítica ya está garantizada.** Tanto `detalle_venta` como
`detalle_pedido` declaran `precio_unitario`: el precio queda **congelado en cada
documento** en el momento de la transacción. Modificar el precio de un producto
no altera ningún total ya emitido. El backend lo respeta —el precio nunca viaja
en el cuerpo de la petición, lo toma el servidor de `producto.precio_venta` al
confirmar—.

**Lo que sí se pierde:** cuándo cambió un precio, de cuánto a cuánto y quién lo
cambió; y poder responder *"¿qué precio tenía este producto el 15 de marzo?"* si
ese día no hubo ventas.

**Advertencia si se decidiera agregarla.** No pueden coexistir
`producto.precio_venta` y una tabla `precio` sin crear dos fuentes de verdad: o
el atributo desaparece y el precio vigente pasa a ser la última fila, o la tabla
es redundante. Esa es la decisión delicada, más que la tabla en sí.

> **Para la defensa.** *"El precio vigente es un atributo del producto, y el
> precio histórico se conserva en el detalle de cada venta y pedido, que lo
> registra en el momento de la transacción. Por eso modificar un precio no
> altera ningún documento ya emitido."*

---

### V5 · Un cliente con historial nunca se elimina

CU-VEN-02, excepción: *"Si el cliente tiene pedidos o ventas registrados, el
sistema no permite eliminarlo."*

**Se cumple por diseño, sin necesidad de una comprobación adicional.** El
sistema no borra usuarios en ningún caso: `DELETE /api/usuarios/:id` ejecuta una
baja lógica —`activo = false`—, tal como exige RF-SEG-05. La fila permanece y
todas las claves foráneas de sus pedidos y ventas siguen siendo válidas.

Agregar un bloqueo sobre la baja lógica habría sido un error: impediría desactivar
la cuenta de un cliente que alguna vez pidió, que es justamente el caso normal.

---

### V6 · El comprobante de venta no necesita tabla propia

RF-VEN-06 pide *"generar el comprobante de la venta registrada"*, y el esquema
no tiene tabla de comprobantes. **Es coherente:** el comprobante no agrega
información que la venta no tenga ya; la presenta con otro formato —numeración,
cliente o "Consumidor final", detalle y totales—.

Se implementó como proyección en `GET /api/ventas/:id/comprobante`, con el mismo
criterio que las alertas de stock de CU-INV-05: un dato derivado se calcula, no
se almacena.

---

### 6.2 Correcciones que conviene descartar

Las correcciones **#7** (renombrar *Verificar Disponibilidad de Stock*) y **#10**
(renombrar los "Gestionar X" a verbos de objetivo) de la tabla de la sección 5
se encarecieron al avanzar el desarrollo: el código y su suite de pruebas
nombran los casos de uso por su denominación actual, de modo que renombrarlos
obliga a tocar comentarios y nombres de prueba en todo el backend.

Ambas son de gravedad baja y **ninguna corrige un error**: son mejoras de
estilo. Se recomienda descartarlas, salvo pedido expreso del docente.

---

### 6.3 Segunda revisión — hallazgos posteriores a la producción al instante

Revisión hecha con el sistema ya completo, buscando deliberadamente lo que
funciona en las pruebas pero fallaría en un negocio real. Cada hallazgo cita el
archivo y la línea que lo respalda; ninguno es una sospecha.

---

#### H6 · Una orden finalizada muestra la receta de hoy, no la que se usó

**Evidencia.** `orden-produccion.service.ts`, función `aDTO`: los campos
`insumosRequeridos` y `costoEstimado` se **recalculan** en cada consulta a
partir de `orden.receta.detalle_receta` —la receta vigente— y de
`ingrediente.costo_unitario` —el costo de hoy—. Y `receta.service.ts` bloquea
el `eliminar` de una receta con órdenes registradas, pero **no** el
`actualizar`: `PUT /api/recetas/:id` reemplaza el detalle completo.

**Qué produce.** Si mañana alguien corrige la receta de las galletas —cambia
200 g de avena por 250 g—, las órdenes finalizadas el mes pasado pasarán a
declarar que consumieron 250 g. El historial de producción se reescribe solo,
en silencio, y con él el costo de todo lo producido.

**Lo grave es que el dato correcto ya existe.** Al finalizar, la orden generó
una nota de egreso con las cantidades **realmente** consumidas y quedó enlazada
en `orden_produccion.id_nota_egreso`. El servicio la ignora y prefiere
recalcular.

> **Cómo debería resolverse.** Para una orden **finalizada**, `insumosRequeridos`
> y el costo deben leerse de la nota de egreso enlazada; el cálculo desde la
> receta solo vale para órdenes *Pendiente* y *En proceso*, donde todavía es una
> previsión. Es la misma distinción que ya se aplicó en la venta, donde
> `detalle_venta.precio_unitario` congela el precio del momento en lugar de leer
> `producto.precio_venta`.

**Gravedad: alta.** No rompe ninguna prueba porque ninguna prueba edita una
receta con historial, que es exactamente por qué conviene señalarlo.

---

#### H7 · Ningún listado tiene paginación ni filtro por fecha

**Evidencia.** No hay una sola aparición de `take:` ni de `skip:` en
`src/models/`. `esquemaFiltroVentas` admite `tipo` y `cliente`, y nada más.

**Qué produce.** `GET /api/ventas` devuelve **todas** las ventas registradas
desde el primer día. Lo mismo `/api/pedidos`, `/api/ingresos`, `/api/egresos` y
`/api/ordenes`. Con los datos de prueba se ve instantáneo; a razón de cuarenta
ventas diarias, en un año son catorce mil filas —con su detalle, su cliente y su
empleado— viajando al navegador cada vez que alguien abre el historial.

Y no hay forma de pedir "las ventas de hoy", que es la consulta que realmente
hace un negocio: hay que traerlo todo y filtrar en el navegador.

**Contradice a RNF-REN-04**, el mismo requisito que motivó agregar los 31
índices de A3. Los índices resuelven la búsqueda; no resuelven el volumen de la
respuesta.

> **Cómo debería resolverse.** `?desde` y `?hasta` en los filtros —hay índices
> por fecha en las cinco tablas—, más `?pagina` y `?tamano` con un tope por
> omisión. El frontend ya centraliza las peticiones en `lib/api.ts`, de modo que
> el cambio se concentra.

**Gravedad: media, y creciente con el tiempo.**

---

#### H8 · El bloqueo por intentos fallidos es, sin límite por IP, una manera de apagar el negocio

**Evidencia.** CU-SEG-05 bloquea la cuenta a los 3 intentos fallidos
(`env.maxIntentosFallidos = 3`). `package.json` no incluye `express-rate-limit`
ni `helmet`, y `app.ts` monta solo `cors` y `express.json()`.

**Qué produce.** El mecanismo pensado para proteger las cuentas sirve para
inutilizarlas. Cualquiera que conozca —o adivine— los nombres de usuario del
personal puede bloquear todas las cuentas en menos de un minuto con tres
peticiones por cuenta. Solo el administrador desbloquea, y **su propia cuenta se
bloquea igual**: el sistema puede quedar sin nadie capaz de reabrirlo.

Esto no es hipotético en este proyecto: durante el desarrollo la cuenta de
administrador llegó a tener dos intentos fallidos acumulados y quedó a uno de
bloquearse, con la base de datos de desarrollo como único camino de vuelta.

> **Cómo debería resolverse.** Tres medidas, ninguna cara:
> 1. límite de peticiones por IP sobre `/api/auth/login` (`express-rate-limit`);
> 2. **desbloqueo automático** pasados unos minutos, en lugar de bloqueo
>    indefinido — el bloqueo permanente convierte un ataque de un minuto en una
>    interrupción de un día;
> 3. `helmet` para las cabeceras de seguridad, que RNF-SEG pide de forma
>    genérica y hoy no están.
>
> La medida 2 **cambia la ficha de CU-SEG-05**, que hoy describe un bloqueo sin
> salida automática. Es una decisión de negocio: conviene consultarla.

**Gravedad: alta.**

---

#### H9 · Bloquear o dar de baja a un usuario no lo expulsa del sistema

**Evidencia.** `auth.middleware.ts` verifica la firma del token y nada más.
`permiso.model.ts`, `permisosDeUsuario`, consulta `usuario_rol_permiso` sin
mirar `usuario.bloqueado` ni `usuario.activo`. `actor.service.ts` comprueba que
el usuario sea empleado o cliente, tampoco su estado. El token dura **8 horas**
(`env.ts`) y vive en `localStorage` (`frontend/src/lib/sesion.ts`).

**Qué produce.** Un empleado despedido a las 9 de la mañana sigue registrando
ventas hasta las 5 de la tarde. Bloquear la cuenta impide **iniciar sesión**,
no impide **seguir trabajando** con la sesión ya abierta. Cerrar sesión tampoco
revoca nada: solo borra el token del navegador.

Es el mismo punto que H8 visto desde el otro lado: el bloqueo es demasiado
fácil de provocar y demasiado débil una vez provocado.

> **Cómo debería resolverse.** Que `requiereAutenticacion` lea el estado del
> usuario y rechace con 401 si está bloqueado o inactivo. Es una consulta por
> petición sobre una clave primaria, ya indexada. Con eso, bloquear surte
> efecto en la petición siguiente y no en ocho horas.

**Gravedad: media-alta.** Contradice el propósito declarado de CU-SEG-05 y de
la baja lógica de usuarios.

---

#### H10 · La producción no admite mermas: sale exactamente lo que se planificó

**Evidencia.** `orden-produccion.service.ts`, `finalizar` e
`producirAlInstante`: la nota de ingreso se emite siempre por
`previa.cantidad`, la cantidad planificada. No hay un campo de cantidad
obtenida.

**Qué produce.** Si se hornean 20 galletas y 3 salen quemadas, el sistema cree
que hay 20. La corrección existe —un egreso con motivo *Merma*, que el esquema
admite— pero es un segundo trámite manual, desconectado de la orden, y nada
obliga a hacerlo.

> **Cómo debería resolverse.** Admitir una `cantidad_obtenida` al finalizar, con
> la planificada como valor por omisión. La diferencia se registra como merma
> **enlazada a la orden**, y el costo unitario se reparte entre lo realmente
> obtenido —que es lo que lo hace un dato de costos y no un adorno—.

**Gravedad: media.** No lo pide ningún requisito; sí lo pide la realidad de una
cocina.

---

#### H11 · Nada impide fijar un precio de venta por debajo del costo

**Evidencia.** `producto.dto.ts` valida que `precioVenta` sea positivo. El
sistema conoce el costo de la receta —lo calcula en cada orden— y no los
compara nunca.

**Qué produce.** Un error de tipeo al cargar un precio pasa sin aviso y el
negocio vende a pérdida hasta que alguien lo note.

> **Cómo debería resolverse.** No prohibirlo —una promoción a pérdida es una
> decisión legítima— sino **avisarlo** al guardar: "el costo de la receta activa
> es Bs 12,40 y el precio es Bs 9,00". La información ya está disponible.

**Gravedad: baja.** Es una observación, no un incumplimiento.

---

#### V7 · La producción al instante sí respeta los lotes y el FEFO

Verificación deliberada, porque era el punto donde A6 y la producción al
instante podían haberse contradicho.

`producirAlInstante` no descuenta insumos por su cuenta: delega en
`egreso.service.ts`, `registrarEnTransaccion`, que consume mediante
`loteService.consumir` —primero el lote que vence antes— y mantiene
`ingrediente_almacen` y `lote_almacen` sincronizados en la misma transacción.
No hay un segundo camino por el que el stock de insumos pueda moverse.

**Estado: correcto, sin cambios.**

---

#### V8 · La venta y la producción compiten por el mismo stock sin corromperlo

Dos cajas que venden el último producto a la vez, o una venta y una orden de
producción que reclaman el mismo insumo, no pueden dejar stock negativo: el
descuento repite la condición de suficiencia **dentro del propio `UPDATE`**
(`stock_actual >= cantidad` en el `WHERE`), y si no afecta ninguna fila la
transacción entera se revierte. La comprobación previa sirve para dar un buen
mensaje; la que decide es la del `UPDATE`.

**Estado: correcto, sin cambios.**

---

## 7. Auditoría de cobertura de requisitos

Contraste de los **42 requisitos funcionales y los 24 no funcionales** del
informe contra el sistema construido. A diferencia de la sección 6 —que recoge
lo aparecido al programar—, esta busca deliberadamente lo que **falta**.

### 7.1 Resumen

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| A1 | RF-SEG-03: la política de contraseñas no exigía mayúscula ni carácter especial | 🔴 Alta | ✅ Corregido |
| A2 | RF-WEB-02 y RF-WEB-03 sin implementar: temas visuales y contador de visitas | 🔴 Alta | ✅ Implementado |
| A3 | RNF-REN-04: 41 claves foráneas y un solo índice | 🟠 Media | ✅ Corregido |
| A4 | Cuatro RF de reportes con cero cobertura | 🟠 Media | ✅ Implementados los cuatro (§10) · consultar al docente si van al modelo |
| A5 | RNF-MAN-03: el esquema no se gestiona con migraciones versionadas | 🟠 Media | ⏳ Pendiente |
| A6 | Insumos perecederos sin lote ni fecha de vencimiento | 🟠 Media | ✅ Implementado |
| A7 | La venta no se puede anular: `venta` no tiene estado | 🟡 Baja | ✅ Corregido: `venta.estado_pago` con `Anulado` y reposición de stock |
| A8 | CU-PED-03 menciona una zona de cobertura que no existe en el modelo | 🟡 Baja | 🟡 Parcial: se publica (§11), no se valida |
| A9 | Carencias de negocio no exigidas por ningún requisito | 🔵 Informativa | — |

---

### A1 · RF-SEG-03 · La política de contraseñas estaba incumplida

**Qué exigía el informe.** *"El sistema debe validar que la contraseña tenga una
longitud mínima de 8 caracteres y una complejidad que incluya mayúsculas,
minúsculas, números y un carácter especial."*

**Qué validaba el código.**

```ts
.min(8, 'mínimo 8 caracteres')
.regex(/[A-Za-z]/, 'debe incluir una letra')   // no distinguía mayúscula de minúscula
.regex(/[0-9]/, 'debe incluir un número')      // no exigía carácter especial
```

Una contraseña como `passwor1` era aceptada. Es un requisito de seguridad
declarado y no cumplido, no una omisión estética.

**Corrección aplicada.** La política se extrajo a `dtos/contrasena.dto.ts` y
ahora exige los cuatro criterios. Vivía duplicada en dos controladores —el alta
por el administrador y el autorregistro del cliente—, y una regla de seguridad
duplicada acaba divergiendo.

Se añadieron **siete pruebas** que rechazan cada criterio por separado y
verifican que la política rige también en el autorregistro.

> **Cambio de credenciales.** Las contraseñas del seed pasan a
> `admin / Admin1234!` y `repartidor / Reparto1234!`.

---

### A2 · RF-WEB-02 y RF-WEB-03 no existían

Los tres requisitos del bloque **WEB** no tienen caso de uso asociado, y por eso
se cayeron del modelo sin que nadie lo advirtiera. Dos de ellos no estaban
implementados en absoluto:

| Requisito | Estado anterior |
|---|---|
| RF-WEB-01 · menú dinámico y estilo CSS único | Cumplido |
| RF-WEB-02 · tres temas visuales + modo día/noche automático | **Inexistente** |
| RF-WEB-03 · contador de visitas en el pie de cada página | **Inexistente** |

**RF-WEB-02 — implementado.** Tres temas seleccionables (niños, jóvenes,
adultos) y modo día/noche con opción automática según la hora del cliente.

La solución no escribe seis combinaciones: son **dos ejes ortogonales**. El
atributo `data-tema` redefine solo el acento de marca y `data-modo` solo las
superficies y la tinta, de modo que tres bloques más dos cubren las seis
apariencias. Todo el sistema de diseño se repinta solo porque cada componente
consume tokens en lugar de colores literales —los 21 usos que quedaban de un
color fijo se sustituyeron por el token `sobre-marca`—.

Con el modo automático, el sitio recalcula cada minuto: una sesión abierta al
anochecer cambia sola, que es lo que el requisito describe. Elegir día o noche
a mano desactiva la automática, porque una preferencia expresa debe ganarle a
una inferencia.

**RF-WEB-03 — implementado.** Requirió una **tabla nueva**, `visita`, que el
script de la sección 4.5.3 no contemplaba.

Se guarda una fila por visita en lugar de un contador único: ocupa poco, permite
responder además desde cuándo se acumula el total y no obliga a bloquear una
fila compartida en cada petición.

Se contabiliza **una visita por sesión de navegador**, no una por cada cambio de
pantalla: en una aplicación de una sola página el usuario navega decenas de
veces sin volver a entrar, y contar cada transición inflaría el número hasta
volverlo inútil como medida.

> **Pendiente en el `.docx`:** agregar la tabla `visita` a la sección 4.5.3.

---

### A3 · RNF-REN-04 · Cuarenta y una claves foráneas, un índice

> **Cifras al momento del hallazgo.** El esquema tenía entonces 30 tablas y 41
> claves foráneas. Tras las tablas agregadas después —`visita`, `lote`,
> `lote_almacen`, `configuracion`, `pago` y `evento_pago`— hoy son **36 tablas,
> 48 claves foráneas y 44 índices**. El criterio no cambió: cada clave foránea
> que no encabeza una primaria compuesta lleva su índice.

**Qué exigía el informe.** *"Las tablas de mayor volumen de consulta deben
contar con índices sobre sus campos de búsqueda y llaves foráneas."*

**Qué había.**

```
Claves foráneas declaradas:  41
Índices declarados:           1   (ux_receta_activa)
```

PostgreSQL indexa automáticamente las claves primarias y las únicas, pero **no
las foráneas**. Cada consulta de pedidos por cliente o de detalles por nota
recorría la tabla completa. Con datos de demostración no se nota; con volumen
real, sí.

**Corrección aplicada.** Se agregaron **31 índices** al final del script: las
claves foráneas que no encabezan ya una clave primaria compuesta, más los campos
de búsqueda y filtrado más frecuentes —nombre de producto e insumo en
minúsculas, estado y fecha de pedido, fecha de venta, estado de orden—.

No se indexaron las columnas que ya encabezan una primaria compuesta, como
`id_pedido` en `detalle_pedido`: ese índice ya las cubre.

> **Pendiente en el `.docx`:** copiar el bloque de índices a la sección 4.5.3.

---

### A4 · Cuatro requisitos de reportes sin ninguna cobertura

| Requisito | Qué pide |
|---|---|
| RF-VEN-07 | Reporte de ventas por rango de fechas y producto, PDF y correo |
| RF-PED-10 | Reporte de pedidos por fecha, estado y repartidor, con tiempo de entrega |
| RF-PRO-08 | Reporte de producción con insumos consumidos y costo por corrida |
| RF-INV-08 | Reporte de movimientos de inventario por ítem y rango de fechas |

**No existe un solo endpoint de reportes.** Esto viene de la decisión de quitar
los cuatro casos de uso *Reportes de X* del modelo (sección 3.5) — pero **los
requisitos se quedaron en el informe**.

**Decisión tomada.** Los reportes **sí se construyen en el software**, pero
**no se incorporan al modelo de casos de uso por ahora**. El modelo se mantiene
en 22 casos de uso.

Es una separación deliberada entre dos preguntas distintas:

| Pregunta | Respuesta |
|---|---|
| ¿El sistema debe generar reportes? | **Sí.** Los cuatro RF se cumplen |
| ¿Deben figurar como casos de uso en el informe? | **Pendiente de consultar al docente** |

**Por qué la separación es defendible.** Un requisito funcional y un caso de uso
no son lo mismo: el RF dice *qué* debe hacer el sistema, y el caso de uso
describe *una interacción completa de un actor con un objetivo*. Que los
reportes existan como funcionalidad no obliga a modelarlos como casos de uso
separados, del mismo modo que `Verificar Disponibilidad de Stock` existe como
comportamiento incluido y no como interacción autónoma.

**Qué preguntarle al docente.** La consulta concreta es:

> *"Los cuatro reportes están implementados y responden a RF-VEN-07, RF-PED-10,
> RF-PRO-08 y RF-INV-08. ¿Deben además aparecer como casos de uso en el modelo,
> o basta con que los requisitos funcionales queden cubiertos?"*

Según la respuesta:

- **Si dice que sí** → vuelven cuatro casos de uso, el modelo pasa de 22 a 26 y
  hay que redactar sus fichas y dibujar sus diagramas. El código ya estaría.
- **Si dice que no** → el modelo queda en 22 y basta con dejar constancia en la
  matriz de trazabilidad de que esos RF se cubren sin caso de uso propio.

**Alcance acordado para la implementación.** Consulta parametrizada en pantalla
con filtro por rango de fechas y los totales de cada reporte. La exportación a
PDF y el envío por correo quedan supeditados al servidor de correo de la VM, que
todavía no está configurado.

> ⏳ **Pendiente de construir.** Los datos y las pantallas base ya existen —el
> historial de ventas, los movimientos de inventario y las órdenes con su costo
> por corrida ya se listan y filtran—; falta el filtro por rango de fechas y las
> agregaciones.

---

### A5 · RNF-MAN-03 · Sin migraciones versionadas

**Qué exigía el informe.** *"Los cambios en el esquema de la base de datos deben
gestionarse mediante migraciones versionadas del ORM."*

La carpeta `prisma/migrations` no existe. El esquema se gestiona con
`schema.sql` como fuente de verdad más `prisma db pull`, y los dos cambios de
esquema de este desarrollo —`tipo_conservacion` y la tabla `visita`— se
aplicaron con sentencias `ALTER` y `CREATE` manuales.

Funciona y es trazable, pero no es lo que el informe declara. Cabe adoptar
migraciones o ajustar el RNF para describir el mecanismo real.

---

### A6 · Insumos perecederos sin lote ni vencimiento

**El hallazgo más de fondo.** El proyecto se define por la comida saludable y el
informe insiste en *"insumos frescos y perecederos"* y en *"elaboración diaria
bajo demanda"*. Sin embargo, **ninguna tabla del modelo registra lote ni fecha
de vencimiento**.

Consecuencias concretas:

- No hay forma de saber qué insumo vence primero.
- La merma por vencimiento se registra sin poder identificar qué se venció.
- El reparto de existencias entre almacenes toma del que tiene **más stock**.
  Para un perecedero eso es incorrecto: debería salir primero lo que vence
  antes. Está implementado así porque el modelo no ofrece con qué ordenar.

Es el mismo razonamiento que llevó a preguntarse por una tabla de precios, pero
aquí el dato **no existe en ninguna parte**, mientras que el precio histórico sí
se conserva en el detalle de cada venta y pedido (ver O1).

**Solución implementada.** Se añadieron dos tablas y una bandera:

```sql
ingrediente.controla_vencimiento BOOLEAN NOT NULL DEFAULT FALSE

CREATE TABLE lote (id_lote, codigo, fecha_vencimiento, id_ingrediente);
CREATE TABLE lote_almacen (id_lote, id_almacen, stock_actual);
```

**Solo los perecederos llevan lote.** Obligar a la harina o a la avena a
declarar vencimiento en cada ingreso encarece la operación sin aportar nada, de
modo que la bandera lo decide por insumo. En el catálogo de demostración quedan
marcados los cinco frescos: pechuga, lechuga, tomate, limón y yogur.

**Sobre las dos cifras de existencia.** `ingrediente_almacen.stock_actual` sigue
siendo el total consolidado —lo que consultan el control de stock y las
alertas— y `lote_almacen` lo descompone. Son dos representaciones del mismo
dato, que es justamente lo que se advirtió como riesgo al hablar de la tabla de
precios (ver O1).

Lo que evita que divergan es que **todo movimiento de un insumo pasa por un
único servicio**, `lote.service.ts`, que actualiza ambas dentro de la misma
transacción. Hay una prueba dedicada a comprobar que el total consolidado
siempre es igual a la suma de sus lotes.

**El reparto pasó a ser FEFO.** El consumo toma primero el lote que vence antes
—*first expired, first out*—, en lugar del almacén con más existencias. Ese
criterio anterior estaba mal para un perecedero y solo existía porque el modelo
no ofrecía con qué ordenar.

**Consulta añadida.** `GET /api/stock/vencimientos?dias=N` devuelve los lotes
con existencias ordenados por proximidad de vencimiento, indicando los días
restantes y si ya vencieron. El control de stock lo muestra en un panel con
horizonte de 30 días.

**12 pruebas** cubren el rechazo del ingreso sin vencimiento, el consumo FEFO
con lotes desordenados, la coherencia entre total y lotes, y el horizonte de la
consulta.

> **Pendiente en el `.docx`:** agregar `lote`, `lote_almacen` y la columna
> `controla_vencimiento` a la sección 4.5.3, y mencionar el criterio FEFO en la
> ficha CU-INV-04.

---

### A7 · Una venta registrada no se puede anular ✅

*Redactado cuando `venta` no declaraba columna de estado: un cobro mal
registrado solo podía deshacerse con una nota de egreso por merma, que ensucia
el inventario con un motivo falso.*

**Corregido.** `venta.estado_pago` admite `Pendiente`, `Pagado` y `Anulado`
(restricción `ck_venta_estado_pago`), y `venta.service.ts` expone `anular`, que
repone el stock en la misma transacción. Los reportes dejan fuera las anuladas:
siguen registradas, pero no son ingresos y sumarlas daría un total que no
corresponde con la caja.

---

### A8 · Una zona de cobertura que el modelo no puede sostener

CU-PED-03, excepciones: *"Si la dirección se encuentra fuera de la zona de
cobertura, el sistema informa que no es posible realizar la entrega."*

**No existe ningún dato de zona de cobertura** en el esquema: ni radio, ni
polígono, ni lista de zonas. Es exactamente el mismo caso que el tipo de
conservación antes de la corrección H3: una regla escrita que el modelo no
puede verificar.

Las salidas son las mismas: agregar el dato —por ejemplo, un radio en kilómetros
desde un punto de referencia, comparable contra las coordenadas que el cliente
ya puede capturar— o retirar la excepción de la ficha.

**Atendido a medias.** Con RF-PED-03 (§11) la zona de cobertura se **publica**
como parte de la información del negocio, editable por el administrador, y el
cliente la lee antes de armar el pedido, que es cuando le sirve. Lo que sigue
sin existir es la **verificación**: el sistema no rechaza una dirección por
estar fuera. Cerrar la excepción de la ficha exigiría un polígono o un radio y
un cálculo geográfico, que es otro trabajo. Mientras tanto, la ficha de
CU-PED-03 debería decir que la cobertura se informa, no que se valida.

---

### A9 · Carencias de negocio que ningún requisito menciona

No son incumplimientos: el informe no las promete. Se registran porque un
jurado puede preguntarlas y porque un negocio real las necesita.

| Carencia | Por qué importa |
|---|---|
| **El repartidor no tiene su propia vista** | El cargo existe y se le asignan pedidos, pero al entrar ve el tablero completo en lugar de "mis entregas" |
| **La cocina no tiene pantalla de preparación** | Existe el estado *En preparación* pero nadie ve la cola. Es lo que el docente llamó "control de preparación" |
| **El cliente reescribe su dirección en cada pedido** | `ubicacion` no tiene dueño, por diseño del informe. En la práctica el cliente pide casi siempre desde el mismo lugar |
| **No existe "pedir de nuevo"** | Es el gesto más frecuente en un servicio de entrega a domicilio |
| **Sin arqueo de caja ni cierre de turno** | Un punto de venta que no cuadra el efectivo al cerrar deja un hueco de control |
| **Sin registro de auditoría** | No queda rastro de quién cambió un precio o dio de baja a un usuario |

---

## 8. Producción al instante — extensión de CU-VEN-01

Esta sección documenta la decisión de negocio más importante tomada después de
terminar los seis módulos, y los cambios que produjo en el esquema, en la API y
en el punto de venta.

### 8.1 El problema: el sistema solo cubría uno de los dos escenarios

Un negocio de comida saludable produce de dos maneras distintas, y no son
intercambiables:

| Escenario | Cómo funciona | Ejemplo del negocio |
|---|---|---|
| **Producir con planificación** (*make to stock*) | Se decide de antemano cuánto elaborar, se registra la orden, se prepara y se guarda. La venta descuenta de lo guardado | Las galletas de avena que se hornean en la mañana para vender durante el día |
| **Producir al instante** (*make to order*) | El cliente pide algo que no está hecho, se prepara en el momento y se entrega | El jugo de gualele que se licúa cuando alguien lo pide |

Lo construido hasta ese punto cubría **solo el primero**. CU-PRO-02 exige
registrar la orden, iniciarla y finalizarla como tres actos separados, lo cual
es correcto para una hornada planificada y absurdo para un jugo: obligaba al
vendedor a abandonar el mostrador, ir al módulo de producción, crear una orden,
iniciarla, finalizarla eligiendo almacén, volver al punto de venta y recién
entonces cobrar. Siete pasos para servir un vaso.

El síntoma con el que apareció fue un mensaje del propio sistema: al vender un
producto sin existencias, la respuesta era **"stock insuficiente"** y nada más.
Técnicamente correcta, comercialmente inútil: el producto sí podía hacerse.

> **Criterio aplicado.** El caso de uso no cambia —sigue siendo *Gestionar
> Venta*—, cambia el camino que toma cuando falta producto. Eso es exactamente
> lo que Arlow describe como comportamiento **opcional y condicional**, es
> decir, un `extend`, no un caso de uso nuevo ni un paso obligatorio.

### 8.2 Lo que se decidió

1. **La venta y la producción ocurren en una sola transacción.** No se produce
   primero y se vende después: si la venta falla, la producción se revierte
   con ella. No puede quedar una orden finalizada sin la venta que la motivó.
2. **Se produce solo el faltante, no lo pedido.** Si piden 5 y hay 2 en
   existencias, se elaboran **3**. Es la regla que rompe las soluciones
   ingenuas, que producen las 5 y dejan 2 muertas en inventario.
3. **Se registra como orden de producción real**, marcada como instantánea, con
   su nota de egreso y su nota de ingreso. No es un descuento suelto de
   insumos: un egreso con motivo *Producción* sin orden que lo respalde
   quedaría huérfano, y el reporte de producción dejaría de ver estas
   elaboraciones.
4. **El vendedor ve qué se va a consumir antes de confirmar.** No se le pide
   que autorice a ciegas: la interfaz muestra los insumos, las cantidades y el
   costo de la corrida.
5. **Solo en el mostrador.** El portal del cliente no produce al instante (ver
   8.6).

### 8.3 Cambios en el modelo de datos

Dos columnas nuevas, ambas con valor por omisión, de modo que no rompen ningún
registro existente:

| Tabla | Columna | Tipo | Por qué existe |
|---|---|---|---|
| `receta` | `divisible` | `BOOLEAN NOT NULL DEFAULT TRUE` | Distingue lo que escala de forma continua de lo que solo se hace en corridas completas |
| `orden_produccion` | `instantanea` | `BOOLEAN NOT NULL DEFAULT FALSE` | Separa en los reportes lo elaborado a pedido de lo planificado |

**Por qué hace falta `divisible`.** Una bebida escala de forma continua: para
tres vasos se usa exactamente el triple de insumo. Una bandeja de horno no. Si
la receta rinde 4 unidades y faltan 3, se hornean **4** y una queda en
inventario; producir "tres cuartos de bandeja" no significa nada en la cocina.
Sin esta columna el sistema tendría que elegir un comportamiento único y estaría
equivocado en la mitad de los productos.

```
cantidadAProducir(receta, faltante):
    si receta.divisible  →  faltante
    si no                →  ceil(faltante / rendimiento) × rendimiento
```

**Por qué hace falta `instantanea`.** Sin ella, el reporte de producción
mezclaría la hornada planificada de la mañana con quince jugos servidos uno por
uno, y el indicador de cumplimiento de producción perdería sentido. Además
explica por qué esas órdenes nacen y se cierran en el mismo segundo, sin pasar
visiblemente por *Pendiente*.

### 8.4 El flujo, paso a paso

```
El vendedor agrega productos al ticket, incluso por encima de lo elaborado
        │
        ▼
POST /api/ventas/evaluacion          ← no modifica nada, solo informa
        │
        ├─ por cada línea: existencias, faltante, receta activa,
        │   cantidad a producir, insumos, costo, almacenes compatibles
        ▼
El panel «Se preparará al instante» muestra el detalle al vendedor
        │
        ▼
POST /api/ventas/con-produccion      ← una sola transacción
        │
        ├─ 1. recalcula el faltante DENTRO de la transacción
        ├─ 2. por cada producto faltante:
        │      · verifica insumos (Verificar Disponibilidad de Stock)
        │      · crea la orden en estado En proceso, marcada instantánea
        │      · nota de egreso  → insumos consumidos    (Gestionar Egreso)
        │      · nota de ingreso → producto terminado    (Gestionar Ingreso)
        │      · cierra la orden enlazando ambas notas
        ├─ 3. registra la venta, que ya ve el producto recién ingresado
        └─ 4. descuenta el stock vendido
        │
        ▼
Comprobante
```

El punto 1 no es una repetición del cálculo de la evaluación: entre que el
vendedor mira la pantalla y confirma, otra caja pudo haber vendido lo mismo.
Vale el recálculo de dentro de la transacción, no el de la pantalla.

### 8.5 Reglas que el sistema hace cumplir

| Regla | Qué ocurre si se incumple |
|---|---|
| El producto debe tener **receta activa** | Se rechaza con el motivo explícito: solo puede venderse de existencias |
| Los **insumos deben alcanzar** | Se rechaza nombrando el insumo, cuánto falta y cuánto hay |
| El **almacén de destino** debe admitir la conservación del producto | Se rechaza indicando la incompatibilidad |
| Si hay **más de un almacén compatible**, el sistema no elige | Se pide la elección; la evaluación ya la anticipa para que no aparezca recién al confirmar |
| Si algo falla, **no queda nada registrado** | La transacción se revierte entera: ni venta, ni orden, ni notas, ni consumo de insumos |

El destino se indica **por producto**, no para toda la venta: una misma venta
puede llevar un producto refrigerado y uno seco, y un único almacén no serviría
para ambos. Es un error que la primera versión de la API sí tenía y que se
corrigió antes de exponerla al frontend.

### 8.6 Lo que deliberadamente no hace

**El portal del cliente no produce al instante.** Un pedido a domicilio no es
un cliente frente al mostrador: nadie confirma en el momento que vale la pena
gastar los insumos, y un pedido puede cancelarse después de haberse preparado.
Mantener la producción a pedido dentro del mostrador conserva la decisión donde
hay una persona que puede tomarla.

**No sustituye a CU-PRO-02.** La orden planificada sigue existiendo y sigue
siendo la vía normal para la producción del día. La producción al instante es
la excepción atendida, no el modo de operar.

### 8.7 Efecto sobre el modelo de casos de uso — consultar al docente

La implementación sugiere un **sexto `extend`**:

```
Producir al Instante  ──«extend»──▶  Gestionar Venta
      condición: el producto solicitado no tiene existencias suficientes
                 y cuenta con receta activa
```

Cumple los tres criterios de Arlow para `extend`: es opcional, es condicional y
el caso base (*Gestionar Venta*) queda completo y con sentido sin él.

> **Estado: pendiente de consulta.** No se agrega al diagrama todavía. El
> conteo oficial sigue siendo **22 casos de uso, 7 `include` y 5 `extend`**. Si
> el docente lo acepta, pasaría a 23 casos de uso y 13 relaciones. Se consulta
> junto con la decisión de A4 sobre los reportes.

### 8.8 Ajustes pendientes en el `.docx`

| Documento | Qué agregar |
|---|---|
| Script de base de datos | `receta.divisible` y `orden_produccion.instantanea` |
| Diccionario de datos | Ambas columnas, con la explicación de 8.3 |
| Ficha de CU-VEN-01 | Variación: "si el producto no tiene existencias suficientes y cuenta con receta activa, el sistema ofrece prepararlo al instante" |
| Ficha de CU-PRO-02 | Nota: las órdenes marcadas como instantáneas nacen en *En proceso* y se cierran en el mismo acto |
| Diagrama de casos de uso | Solo si el docente acepta el sexto `extend` (8.7) |

### 8.9 Verificación

13 pruebas de integración específicas, dentro de las 210 del backend, y 6 de
interfaz dentro de las 24 del frontend. Cubren los casos que rompen las
soluciones ingenuas:

- sin existencias en absoluto;
- **existencias parciales** — piden 5, hay 2, se producen 3 y no 5;
- receta no divisible — piden 3, la receta rinde 4, se hornean 4 y queda 1;
- producto sin receta activa — se rechaza con el motivo;
- insumos insuficientes — se revierte todo: ni venta, ni orden, ni consumo;
- existencias suficientes — no se produce nada;
- almacén ambiguo, almacén incompatible y permisos del cliente.

---

## 9. Cobros en línea — RF-PED-04

El docente pidió que el sistema fuera **transaccional**: que se pueda pagar en
línea, por QR o tarjeta, y que el dinero llegue a la cuenta del negocio. Esta
sección documenta el estado en que se encontró el sistema, lo que se construyó
y lo que falta para mover dinero real.

### 9.1 El punto de partida: el pago era una etiqueta, no un hecho

Hasta esta etapa, `metodo_pago` era una columna que decía **cómo dijo alguien
que había pagado**. No había ninguna línea de código que hablara con un banco
ni con una pasarela: cero apariciones de `webhook`, `pasarela` o el nombre de
cualquier proveedor en todo el backend.

Y había algo peor. En `pedido.service.ts`:

```ts
function estadoDePago(metodoPago: MetodoPago): string {
  return metodoPago === 'Efectivo' ? 'Pendiente' : 'Pagado';
}
```

Combinado con un formulario donde **el propio cliente escribía a mano** la
referencia de la transacción, con la única validación de que tuviera cuatro
caracteres. Es decir: cualquier cliente registrado podía escribir `1234`,
elegir «QR», y obtener un pedido marcado como **pagado**, con el stock
descontado y la comida en preparación, sin que entrara un solo boliviano.

No era una vulnerabilidad exótica. Era el flujo normal de la aplicación.

> **Estado: corregido.** La referencia ya no se acepta del cliente y ningún
> método de pago da el pedido por pagado por sí solo.

### 9.2 Dos sentidos de "transaccional" — conviene aclararlo con el docente

| Sentido | Qué significa | Estado |
|---|---|---|
| **Transacción de base de datos** (ACID) | Que una operación ocurra completa o no ocurra | ✅ Ya estaba, y bien resuelto |
| **Transacción de dinero** | Que el cliente pague de verdad y el dinero llegue | ✅ Construido, a la espera de contrato con una pasarela |

Ambos están cubiertos, pero es útil saber cuál se está evaluando.

### 9.3 Modelo de datos: tres tablas nuevas

Un cobro no cabe en una columna de la venta. **Tiene vida propia**: se crea, se
envía a la pasarela, la pasarela responde minutos después, puede fallar, puede
vencer y puede reembolsarse.

| Tabla | Para qué |
|---|---|
| `configuracion` | Parámetros que el administrador cambia en caliente. Hoy guarda `MODO_COBRO`, con quién lo cambió y cuándo |
| `pago` | El cobro y su ciclo de vida completo |
| `evento_pago` | Bitácora de todo lo que le ocurrió al cobro, tal como llegó |

Y dos columnas más: `venta.estado_pago` —la venta no tenía dónde esperar— y el
estado `Pendiente de pago` en `pedido`.

**Tres decisiones del diseño que conviene poder defender:**

**`pago.modo` congela si el cobro fue simulado o real.** Sin esa columna,
después de activar el dinero real sería imposible separar la recaudación
verdadera de la de las demostraciones. Los cobros de prueba quedan marcados
como tales para siempre.

**El índice único parcial es lo que impide cobrar dos veces:**

```sql
CREATE UNIQUE INDEX ux_pago_transaccion_ext ON pago(pasarela, id_transaccion_ext)
    WHERE id_transaccion_ext IS NOT NULL;
```

Las pasarelas **reintentan sus avisos**. Si el mismo aviso llega tres veces y
no hay forma de reconocerlo, el pedido se marca como pagado tres veces.

**`ck_pago_origen` impide un cobro huérfano o ambiguo:**

```sql
CONSTRAINT ck_pago_origen CHECK ((id_venta IS NOT NULL) <> (id_pedido IS NOT NULL))
```

Un cobro paga una venta o un pedido, nunca los dos ni ninguno. Lo garantiza el
motor, no el código.

### 9.4 La capa de pasarelas: por qué el modo se cambia sin reiniciar

El requisito era que el administrador pudiera pasar de simulado a real **desde
su perfil**. Eso descarta una variable de entorno, que obligaría a reiniciar el
servidor.

La solución no es un `if` repartido por los servicios, sino un contrato:

```
                    interface PasarelaPago
                             │
              ┌──────────────┴──────────────┐
      PasarelaSimulada              PasarelaLibelula
      (no mueve dinero)             (adaptador real)
```

Los servicios reciben una `PasarelaPago` y **no saben** si detrás hay un banco
o una simulación. Cambiar de modo —o de proveedor— es cambiar qué objeto
devuelve `pasarelaPara()`.

**La pasarela simulada no confirma en el acto, y es a propósito.** Espera un
retardo configurable y recién entonces se da por pagada. Confirmar al instante
habría sido más cómodo, pero dejaría el camino asíncrono —el que espera, el que
reintenta, el que vence— sin ejecutarse nunca hasta el día en que se active el
dinero real. Se prefiere que el modo simulado recorra **exactamente el mismo
camino** que el real, para que el real no se estrene sin haberse probado.

**El código simulado avisa que no cobra.** Su contenido incluye la leyenda
`AVISO=Este codigo no cobra dinero real`. Un QR simulado que pareciera
auténtico sería una forma involuntaria de estafa.

### 9.5 El flujo completo

```
El cliente confirma (QR o tarjeta)
        │
        ▼
UNA transacción:  reserva el stock · crea el pedido en «Pendiente de pago»
                  · registra el cobro en «Pendiente»
        │
        ▼  (ya fuera de la transacción: hablar con la pasarela por HTTP
        │   dentro de una transacción bloquearía el stock por segundos)
Se abre el cobro en la pasarela → devuelve QR / enlace + vencimiento
        │
        ▼
El cliente ve el código con el MONTO YA CARGADO —no lo teclea—
        │
        ├──── aviso de la pasarela (webhook) ──┐
        │                                       ├──▶ se confirma el cobro
        └──── consulta periódica ───────────────┘     (idempotente)
                                                            │
                          ┌─────────────────────────────────┴──────────┐
                     Pagado                                    Vencido / Fallido
                          │                                            │
              pedido → «Recibido»                      pedido → «Cancelado»
              (entra a la cocina)                      y SE REPONE EL STOCK
```

**Dos ideas sostienen todo el diseño:**

**1. Idempotencia.** El cierre del cobro ocurre con un `UPDATE ... WHERE estado
= 'Pendiente'`. Si dos avisos llegan a la vez, el segundo no encuentra nada que
cambiar. La condición viaja dentro del `UPDATE`, no en un `if` previo, por la
misma razón que el descuento de stock: entre comprobar y escribir hay una
ventana.

**2. No confiar en que el aviso llegue.** Los avisos se pierden —el servidor
estaba caído, la red falló, nunca se enviaron—. Un cobro que solo se enterara
por aviso quedaría pendiente para siempre. Por eso **consultar un cobro
pendiente le pregunta a la pasarela** en lugar de esperar sentado. Es también
el mecanismo por el que confirma la pasarela simulada: no hay temporizadores
que un reinicio pueda perder.

### 9.6 Defensas del endpoint público

El aviso de la pasarela llega a una ruta que **tiene que ser pública**: la
llama un servidor ajeno que no puede iniciar sesión. Sus defensas:

| Defensa | Qué evita |
|---|---|
| **Firma HMAC-SHA256** sobre el cuerpo crudo | Que cualquiera marque pedidos como pagados con un `curl` |
| Comparación en **tiempo constante** | Que se pueda adivinar la firma midiendo cuánto tarda el rechazo |
| El cuerpo se recibe **sin interpretar** (`express.raw`) | Que reserializar el JSON cambie los bytes y toda firma legítima falle |
| **Contraste del monto** | Que un aviso diciendo «pagué Bs 1» salde una venta de Bs 120 |
| Aviso desconocido → 200 sin efecto | Que la pasarela reintente durante horas algo que nunca se va a procesar |

### 9.7 El modo de cobro, en el perfil del administrador

Nace en `Simulado`: un sistema recién instalado no debe poder mover dinero real
hasta que alguien lo decida de forma explícita. Volver a sembrar la base **no**
devuelve a simulado una instalación en producción.

Activar el dinero real se rechaza si la pasarela no tiene adaptador o le faltan
credenciales. Es preferible seguir en simulado y saberlo, a estar en real y
descubrirlo con un cliente esperando frente al mostrador.

### 9.8 Lo que falta para cobrar de verdad

Lo que está construido es **todo lo que no depende del proveedor**:
idempotencia, verificación de firma, contraste de monto, bitácora, vencimiento,
reposición de stock, consulta de respaldo y el interruptor del administrador.

Falta lo que sí depende de con quién se firme:

| Pendiente | Detalle |
|---|---|
| **Contrato con una pasarela** | Libélula, PagosNet o Todotix. Requiere **NIT y cuenta empresarial** |
| **Tres puntos marcados `AJUSTAR`** en `libelula.ts` | Nombres de campo y rutas, contra la documentación vigente del proveedor |
| **Credenciales** | `LIBELULA_URL_BASE`, `LIBELULA_API_KEY`, `LIBELULA_SECRETO_WEBHOOK` |
| **HTTPS** | Ninguna pasarela seria acepta un webhook por HTTP plano |

Los tres puntos `AJUSTAR` están marcados y **no rellenados con nombres
adivinados**: escribirlos al azar daría la falsa impresión de que la
integración está terminada, y el error aparecería recién con dinero real de por
medio.

> **Nunca se guardan datos de tarjeta** —ni el número, ni el CVV, ni
> cifrados—. Eso es PCI-DSS y queda fuera del alcance de un proyecto de
> semestre. Se usa siempre *checkout alojado*: el cliente paga en el sitio del
> proveedor y vuelve.

### 9.9 Nota económica: por qué conviene un monto mínimo

La comisión de una pasarela tiene una parte porcentual **y un cargo fijo**. El
fijo no distingue entre una venta de Bs 5 y una de Bs 500, de modo que en
productos baratos se lleva el margen entero. Con una comisión hipotética de
3,5 % + Bs 1:

| Venta | Comisión | Se lleva |
|---|---|---|
| Bs 5 | Bs 1,18 | **24 %** |
| Bs 25 | Bs 1,88 | 7,5 % |
| Bs 200 | Bs 8,00 | 4,0 % |

Un negocio que vende jugos y galletas debería fijar un **monto mínimo para el
pago en línea** y reservar el QR directo del banco —sin comisión— para el
mostrador, donde el cliente está presente. Es una decisión de negocio que el
sistema debería reflejar y que hoy no refleja.

### 9.10 Alcance legal — para mencionarlo antes de que lo pregunten

Un negocio que cobra en Bolivia está obligado a emitir **factura electrónica
del SIN** (Facturación en Línea). El sistema emite un *comprobante*, que es un
resumen interno y **no** un documento tributario.

No se implementa: excede el alcance del informe. Se registra porque
mencionarlo demuestra haber entendido el alcance real, y probablemente suma más
que implementarlo a medias.

### 9.11 Ajustes pendientes en el `.docx`

| Documento | Qué agregar |
|---|---|
| Script de base de datos | `configuracion`, `pago`, `evento_pago`, `venta.estado_pago`, `almacen.preferido`, el estado `Pendiente de pago` y los 8 índices nuevos |
| Diccionario de datos | Las tres tablas, con la justificación de `modo` y del índice único parcial |
| Ficha de CU-PED-04 | El flujo real: reserva, espera, confirmación por aviso o consulta, vencimiento con reposición de stock |
| Ficha de CU-VEN-01 | La venta en línea nace `Pendiente` y el comprobante se emite al acreditarse |
| Diagrama de clases | Las tres tablas y sus relaciones con `venta` y `pedido` |

### 9.12 Verificación

**15 pruebas de integración** en el backend, dentro de las 226, y **8 de
interfaz** en el frontend, dentro de las 37. Cubren:

- el sistema nace en simulado y solo el administrador puede cambiarlo;
- **no se puede activar el modo real sin credenciales** —y el modo no cambia;
- el efectivo se cobra en el acto; el QR abre un cobro y la venta queda pendiente;
- el monto viaja dentro del código: el cliente no lo teclea;
- el código simulado avisa que no cobra dinero real;
- consultar el cobro lo confirma y arrastra a la venta;
- **consultar dos veces no confirma dos veces** (idempotencia);
- **un aviso con monto menor al de la venta se rechaza**;
- un cobro anulado cancela el pedido **y devuelve el stock**;
- la referencia que envíe el cliente se ignora.

---

### 9.13 Decisiones D1 a D4 — coherencia del ciclo de cobro

Revisión posterior a la construcción, con cuatro huecos detectados y resueltos.

---

#### D1 · Una venta con cobro fallido no se podía anular

**El hueco.** La restricción `ck_venta_estado_pago` admitía `'Anulado'`, pero
**ningún código lo escribía nunca**: era un estado muerto. En la práctica, si
en el mostrador el pago se rechazaba, la venta quedaba `Pendiente` para
siempre, el stock no volvía y —con producción al instante— los insumos ya se
habían consumido. Los pedidos sí se resolvían solos; las ventas no.

**Lo implementado.** `POST /api/ventas/:id/anular` con motivo obligatorio.
Repone el stock **al mismo almacén del que salió cada unidad**, cierra el cobro
y marca la venta como anulada. Todo en una transacción, con relectura del
estado dentro de ella para que dos anulaciones simultáneas no repongan el stock
dos veces.

**La distinción que importa:** el sistema **registra** la devolución, no la
**entrega**.

| Estado del cobro | Qué pasa | Hay dinero que devolver |
|---|---|---|
| `Pendiente` | pasa a `Fallido` | No: nunca entró |
| `Pagado` | pasa a `Reembolsado` | **Sí**, y la respuesta lo avisa |

Reintegrar el dinero es un acto humano —efectivo desde la caja, o el panel de
la pasarela—. Marcarlo como devuelto sin devolverlo sería peor que no marcarlo.

---

#### D2 · Nada vencía los cobros abandonados

**El hueco.** `vencerPendientes()` existía pero solo corría si alguien llamaba
al endpoint. Un cliente que abría la pantalla de pago y cerraba la pestaña
dejaba el pedido en `Pendiente de pago` con el stock reservado
**indefinidamente**.

**Lo implementado.** Un middleware sobre `/api` que dispara el barrido como
mucho una vez por minuto y **sin esperarlo**: la petición sigue su curso y un
fallo del barrido no rompe ninguna pantalla.

> **Por qué no un temporizador.** Un `setInterval` muere con el proceso y se
> duplica si el servidor corre en varias instancias. Colgado del tránsito
> normal de la API, el barrido ocurre mientras haya alguien usando el sistema,
> que es cuando hace falta. En producción conviene **además** un proceso
> programado, para que el stock también se libere de madrugada; esto no lo
> reemplaza, lo cubre mientras no exista.

---

#### D3 · El segundo almacén obligaba a elegir destino en cada producción

**El hueco.** Con un almacén por tipo de conservación, el sistema deduce el
destino de lo producido. Al aparecer el segundo pierde esa capacidad —
correctamente: no es una elección que le corresponda— pero pasa a preguntarlo
**en cada producción**, lo que en el mostrador es fricción pura.

**Lo implementado.** Columna `almacen.preferido`, con índice parcial:

```sql
CREATE UNIQUE INDEX ux_almacen_preferido ON almacen(tipo_conservacion)
    WHERE preferido;
```

Solo puede haber **un preferido por tipo de conservación**: si hubiera dos, la
ambigüedad que la preferencia viene a resolver volvería por otro lado. Designar
uno desmarca al anterior en la misma operación —el orden importa, porque el
índice rechazaría tener dos a la vez—.

Cuando hay ambigüedad y ninguno está designado, el mensaje de error ahora dice
cómo evitarla en lugar de solo señalarla.

---

#### D4 · No se conocía el costo del producto terminado

**El hueco.** `producto_almacen` guarda cuánto hay, no cuánto costó. Producir
dos veces a costos distintos dejaba al sistema sin saber cuánto vale lo que
tiene en inventario.

**Lo implementado, y por qué así.** No se agregó una columna de costo: habría
que recalcularla en cada movimiento y el dato **ya existe**. Cada nota de
ingreso registró el costo unitario de lo que entró —sea compra o producción—,
de modo que el promedio ponderado se deduce al consultar.

Es el mismo criterio con el que el proyecto ya resuelve las alertas de stock
(V-CU-INV-05) y el comprobante de venta (V6): **dato derivado, calculado al
consultar, no almacenado**. Cero cambios de esquema.

Se calcula solo en la ficha individual del producto, no en el listado: ahí
sería una consulta por producto para un dato que no se muestra.

De paso cierra parte de **H11**: la ficha avisa cuando el precio de venta no
cubre el costo. No lo impide —una promoción a pérdida es una decisión
legítima— pero lo dice, que es lo que un error de tipeo necesita para no pasar
inadvertido.

---

#### Verificación

9 pruebas de integración nuevas y 6 de interfaz. Cubren: la reposición del
stock al anular; el aviso de devolución cuando la venta estaba cobrada; que un
cobro que nunca entró no genere devolución; que **no se anule dos veces** para
no reponer el stock dos veces; que el preferido devuelva la deducción del
destino; que designar uno desmarque al anterior; y el promedio ponderado con el
aviso de venta bajo costo.

---

### 9.14 Autoservicio de la cuenta propia

Revisión de los perfiles de usuario contra las buenas prácticas. Tres hallazgos,
uno de ellos serio.

---

#### El hueco serio: nadie podía cambiar su propia contraseña

**Evidencia.** No existía ninguna ruta de cambio de contraseña. Ni para el
personal ni para los clientes. RF-SEG-03 define una política —ocho caracteres,
mayúscula, minúscula, número y carácter especial— que solo se aplicaba **al
crear la cuenta**.

**Qué producía.** Un empleado que sospechara que alguien vio su contraseña no
tenía nada que hacer: solo un administrador podía intervenir, y ni siquiera
había una operación para eso. Una política que rige al crear la cuenta y no al
cambiarla no es una política; es un trámite de alta.

**Lo implementado.** `PUT /api/perfil/contrasena`, que exige la contraseña
actual aunque la sesión ya esté abierta. No es burocracia: es la diferencia
entre *quien tiene la sesión* y *quien sabe la contraseña*. Sin ella, una
computadora del mostrador que quedó sin bloquear alcanza para apropiarse de la
cuenta.

La nueva se valida con `esquemaContrasena`, **el mismo de RF-SEG-03 que usa el
registro**. Un solo lugar, una sola regla.

---

#### El desequilibrio: el cliente editaba su perfil, el personal no

El portal permitía al cliente corregir su nombre, correo y teléfono. El
escritorio del personal era **solo de lectura**: un vendedor que cambiaba de
número de teléfono tenía que pedírselo a un administrador.

Ahora ambos usan las mismas rutas y los mismos componentes.

---

#### La duplicación silenciosa: dos definiciones del mismo dato

**Evidencia.** Los cuatro campos personales estaban definidos dos veces:

| Dónde | Validación del nombre |
|---|---|
| `cliente.dto.ts` | `z.string().trim().min(1).max(100)` |
| `usuario.controller.ts` | `z.string().min(1).max(100)` |

**No eran iguales.** La del cliente recortaba espacios; la del personal no. El
mismo nombre se guardaba distinto según por qué pantalla se hubiera cargado —la
clase de diferencia que nadie nota hasta que dos listados no coinciden.

Ambos derivan ahora de `camposPersonales`, en `perfil.dto.ts`.

---

#### Lo que se agregó al perfil

| Dato | Por qué |
|---|---|
| **Último acceso** | Es la forma más simple de que el titular note un ingreso que no hizo él. Columna `usuario.ultimo_acceso`, sellada al iniciar sesión |
| **Cargo y fecha de ingreso** | Ya existían en `empleado` y no se mostraban en ninguna parte |
| **Fecha de registro** | Ídem, para el cliente |
| **Campos inmutables, con su motivo** | Ver 9.14.1 |

#### 9.14.1 Qué no se puede cambiar, y por qué se dice

Cuatro campos aparecen en el perfil **visibles pero no editables**, cada uno con
su explicación a un toque de distancia. Omitirlos daría a entender que no
existen; mostrarlos apagados y sin motivo deja al usuario preguntándose si es un
error de la aplicación.

| Campo | Motivo |
|---|---|
| `nombre_usuario` | Es la identidad de inicio de sesión y con la que quedan firmadas las ventas y las órdenes. Cambiarla rompería la lectura del historial |
| `rol` y permisos | Los asigna un administrador (CU-SEG-03, CU-SEG-04). Si el titular pudiera tocarlos, el control de acceso no controlaría nada |
| `activo` | Dar de baja una cuenta es decisión del personal, no del titular |
| `bloqueado` | Una cuenta que pudiera desbloquearse a sí misma no está bloqueada |

Las tres primeras ya estaban fuera del esquema de entrada; lo que faltaba era
**decirlo en la interfaz**.

#### 9.14.2 Cómo quedó estructurado

Un solo servicio (`perfil.service`) para empleados y clientes, porque la
operación es la misma: *el titular edita sus datos*. El modelo de clases declara
a Usuario como supertipo de Empleado y Cliente, y todo lo que se edita vive en
Usuario; lo que difiere entre subtipos se agrega **al leer**, no al escribir.

```
GET  /api/perfil              → datos + bloque laboral (empleado)
                                       o preferencias (cliente)
PUT  /api/perfil              → los cuatro campos personales
PUT  /api/perfil/contrasena   → exige la actual
PUT  /api/perfil/preferencias → solo clientes; al resto responde 403
```

Ninguna ruta recibe el identificador por la URL: siempre sale de la sesión. Es
lo que hace imposible editar la cuenta de otro cambiando un número en la
dirección.

En el frontend, los cuatro componentes —resumen, datos personales, contraseña y
preferencias— los comparten las dos pantallas. Lo único exclusivo del cliente
son las preferencias alimentarias.

**Verificación:** 16 pruebas de integración y 7 de interfaz. Entre ellas, que el
perfil **ignore** los campos que el titular no puede cambiar aunque los envíe a
mano.

---

## 10. Los cuatro reportes del sistema

Con RF-PED-10, RF-PRO-08 y RF-INV-08 implementados, el sistema tiene **cuatro
reportes parametrizados**, uno por subsistema:

| Requisito | Reporte | Filtros propios | Permiso |
|---|---|---|---|
| RF-VEN-07 | Ventas | producto | `VENTA_LEER` |
| RF-PED-10 | Pedidos | estado, repartidor | `PEDIDO_LEER` |
| RF-PRO-08 | Producción | producto | `ORDEN_PRODUCCION_GESTIONAR` |
| RF-INV-08 | Movimientos de inventario | insumo, producto | `STOCK_CONSULTAR` |

Los cuatro aceptan un rango de fechas, se ven en pantalla, se exportan a PDF y
se envían por correo con el PDF adjunto.

### 10.1 Por qué ninguno se almacena

**No hay tabla de reportes, y es coherente:** un reporte no agrega información,
la presenta. Se calcula al consultar, igual que las alertas de stock y el
comprobante de venta. Guardarlo obligaría a decidir cuándo se invalida —una
venta anulada cambia el reporte de ayer— y a mantener sincronizadas dos
versiones de la misma verdad.

Lo mismo vale para los datos que el reporte muestra pero el esquema no guarda:

- **El tiempo de entrega** (RF-PED-10) no es una columna. Sale de restar
  `pedido.fecha` a `pedido.fecha_entrega`. Por eso solo lo tienen los pedidos
  que de verdad llegaron, y el promedio es `null` —no cero— cuando ninguno se
  entregó: cero se leería como "se entregó al instante".
- **El costo de una corrida** (RF-PRO-08) tampoco. Se recalcula escalando la
  receta por la razón entre lo producido y su rendimiento, exactamente igual
  que lo hizo el servicio de producción al descontar los insumos. Así el
  reporte y el almacén cuentan lo mismo.
- **El costo de un egreso** (RF-INV-08) se deja en `null`. El esquema no lo
  guarda, y valorizar una salida exigiría fijar un criterio de costeo —PEPS,
  promedio ponderado— que el informe no define. Poner cero sería afirmar que
  salió gratis.

### 10.2 Un solo dibujo, una sola salida

Los cuatro reportes comparten estructura, así que lo común se escribió una vez:

| Archivo | Responsabilidad |
|---|---|
| `services/reporte-pdf.service.ts` | **Cómo se ve** un reporte: encabezado, cifras, tablas con salto de página y numeración al pie |
| `services/reporte-entrega.service.ts` | **Por dónde sale**: la descarga y el correo |
| `services/reporte.service.ts` | Qué mide el de ventas |
| `services/reporte-operaciones.service.ts` | Qué miden los otros tres |

Cada reporte describe un `DocumentoReporte` —título, alcance, cifras,
secciones— y el generador decide el resto. Sin esa separación habría cuatro
copias del mismo encabezado y corregir un margen obligaría a tocarlas todas.

El PDF se dibuja con **PDFKit y no con un navegador sin cabeza**: Puppeteer
arrastra una copia entera de Chromium, y en la máquina virtual del laboratorio
—4 GB compartidos con PostgreSQL y Apache— no entra.

En el controlador, los tres reportes de operaciones se declaran en una **tabla**
en lugar de nueve manejadores idénticos salvo por un nombre. Lo mismo en la
interfaz: `components/reportes/MarcoReporte.tsx` contiene el rango de fechas,
el botón de PDF y el diálogo de correo, y cada pantalla solo escribe qué mide.

### 10.3 El permiso es el del módulo, no uno propio

No se creó un permiso `REPORTE_LEER`. Cada reporte exige el permiso de lectura
de su subsistema: **quien puede consultar los pedidos puede resumirlos**. Un
permiso genérico abriría de golpe información de áreas que la persona no
administra.

Dos consecuencias que conviene tener presentes:

1. `PEDIDO_LEER` lo tiene también el rol **Cliente**, para ver sus propios
   pedidos. El servicio exige además `exigirEmpleado`: un cliente con ese
   permiso lee lo suyo, no el reporte del negocio. **El permiso y el subtipo
   son comprobaciones distintas y hacen falta las dos.**
2. Los permisos se conceden **por rol, no por cargo**. Un cocinero tiene rol
   Empleado y con él `STOCK_CONSULTAR`, así que sí consulta el reporte de
   inventario. Si se quisiera restringir por cargo habría que crear roles más
   finos, no cambiar la comprobación.

### 10.4 Dónde vive cada reporte en la interfaz

Siguiendo el reparto por módulo, cada reporte es una pestaña más de su
subsistema —`/ventas/reportes`, `/pedidos/reportes`, `/produccion/reportes`,
`/inventario/reportes`— en lugar de un módulo "Reportes" aparte. Quien trabaja
en un área encuentra su reporte donde ya está trabajando, y la navegación no
necesita un permiso que no existe.

Esto obligó a dar a Pedidos el mismo layout con pestañas que ya tenían Ventas,
Inventario y Producción: la lista pasó a `/pedidos/lista` y `/pedidos` redirige,
igual que hace `/inventario`.

### 10.5 Verificación

**32 pruebas de integración** (`tests/reportes-operaciones.test.ts`) y **11 de
interfaz** (`tests/MarcoReporte.test.tsx`), además de las 16 que ya cubrían el
reporte de ventas. Entre las que documentan una regla de negocio:

- El tiempo de entrega es `null` antes de entregar y deja de serlo después.
- Una orden **cancelada** no aparece en el reporte de producción: no consumió
  nada, así que no es producción.
- La suma de los insumos consumidos coincide con el costo total de las corridas.
- Los egresos llegan **sin costo**, y no con cero.
- Los filtros que van en el cuerpo del correo **sobreviven a la validación del
  destinatario**: si se recortaran, el PDF adjunto iría sin filtrar y nadie lo
  notaría hasta abrirlo.
- Un fallo del servidor de correo **no se anuncia como envío exitoso**.

Se cerró además una fuga que apareció al escribirlas: `detalle_ingreso_insumo`
no apunta a `ingrediente` sino a su fila de stock `ingrediente_almacen` —clave
compuesta insumo + almacén—, igual que el detalle de producto pasa por
`producto_almacen`. La consulta original nombraba una relación que no existe.

### 10.6 Pendiente de consultar con el docente

Los cuatro reportes **no figuran como casos de uso** en el diagrama. Son
consultas parametrizadas sobre datos que otros casos de uso ya registraron, y
elevarlas a caso de uso propio multiplicaría el diagrama por cuatro sin agregar
comportamiento nuevo. Queda por confirmar si el docente prefiere verlos
modelados —probablemente como un `CU-XXX-Consultar Reporte` por subsistema— o
documentados como aquí, junto a la operación que los alimenta.

---

## 11. Información del negocio y buscador del encabezado — RF-PED-03

Enunciado literal del informe:

> *"El sistema debe permitir buscar productos e información del negocio desde
> el encabezado de la página principal."*

Son **dos cosas**, y hasta ahora estaba media: el catálogo tenía su búsqueda,
pero dentro de la página, y la información del negocio no existía en ninguna
parte. Un cliente que quería saber a qué hora abren no tenía dónde mirarlo.

### 11.1 La información no está en el código

Los nueve datos del negocio —nombre, lema, quiénes somos, horario, cobertura,
dirección, teléfono, WhatsApp y correo— son filas `NEGOCIO_*` de la tabla
`configuracion`, la misma donde vive el modo de cobro, y por la misma razón:

> Un horario cambia y un teléfono cambia. Corregirlos no debería necesitar un
> programador, un despliegue ni un reinicio del servidor.

El administrador los edita desde su perfil, junto al modo de cobro, con el
permiso `CONFIGURACION_GESTIONAR`. **Cada fila deja constancia de quién la
cambió y cuándo**: la información pública es lo que el cliente lee antes de
comprar, y un cambio sin autor no se puede revisar después.

`src/config/negocio.ts` es la **fuente única** de qué campos existen, cómo se
llaman y qué dicen mientras nadie los edite. De esa lista salen tres cosas sin
escribirlas dos veces: el esquema de validación —`esquemaActualizarNegocio` se
construye recorriéndola—, el DTO que lee el portal, y qué campos entran en la
búsqueda. Agregar un dato del negocio es agregar una entrada.

**No se siembra en `seed.ts` a propósito.** El servicio cae a los valores por
omisión cuando la fila no existe, y `guardar` es un *upsert*. Sembrarlos
duplicaría la lista de valores en dos archivos que se desincronizarían al
primer cambio.

### 11.2 Una sola caja para dos búsquedas

El buscador vive en el encabezado del portal, presente en todas sus páginas, y
consulta `GET /api/negocio/buscar`. Devuelve productos e información **en una
sola lista**, cada resultado marcado con su `tipo`:

| Escribe el cliente | Encuentra |
|---|---|
| `avena` | los productos con avena, y la descripción del negocio si la menciona |
| `horario` | el campo Horario de atención, por su etiqueta |
| `domingo` | el mismo campo, por lo que **dice** |
| `telefono` | el campo Teléfono, aunque esté escrito con tilde |

Tres decisiones que sostienen eso:

1. **La comparación ignora tildes y mayúsculas.** El sistema está escrito en
   español; sin normalizar, "informacion" no encontraría "Información" y el
   buscador parecería roto en su propio idioma.
2. **Se busca por etiqueta y por contenido.** Quien escribe "horario" busca el
   campo; quien escribe "domingo" busca lo que el campo dice.
3. **La información se filtra en memoria, no en SQL.** Son nueve campos que ya
   están cargados y cacheados; llevarlo a un `LIKE` sobre la tabla de
   parámetros no ganaría nada.

En la interfaz, cada resultado lleva a donde corresponde: un producto abre el
catálogo filtrado por su nombre (`/portal?termino=…`), un dato del negocio abre
`/portal/nosotros`. El campo espera 300 ms antes de consultar —si no, cinco
letras serían cinco peticiones— y **cancela la consulta anterior** en cada
pulsación, para que una respuesta lenta no pise a otra más nueva.

### 11.3 Público, como el catálogo

`GET /api/negocio` y `GET /api/negocio/buscar` **no exigen sesión**, igual que
CU-PED-01. Un visitante tiene que poder ver el horario, la dirección y qué se
vende antes de crearse una cuenta; exigir sesión para eso convertiría la página
principal en un formulario de registro.

Editar sí exige sesión y permiso. Está probado que un cliente y un empleado sin
`CONFIGURACION_GESTIONAR` reciben 403.

### 11.4 Dónde se nota

| Pantalla | Qué cambió |
|---|---|
| Encabezado del portal | Buscador de productos e información, en todas las páginas |
| `/portal/nosotros` | Quiénes somos, horario, cobertura, contacto y el local en el mapa |
| Pie del portal | El nombre y el lema salen de la configuración, no del código |
| `/perfil` del administrador | Panel para editar los nueve datos y mover el punto del local |

El pie **dejó de tener el nombre escrito a mano**. Estaba duplicado con lo que
ahora es configurable, y una copia así se desincroniza en cuanto el
administrador edita el original.

El mapa de `/portal/nosotros` es el mismo componente que usa el cliente al
elegir su dirección, **sin `onCambiar`**: sin esa prop el mapa es de solo
lectura. Aquí se mira; en el panel del administrador, con la prop, se elige.

### 11.5 Lo que resuelve del hallazgo A8

A8 señalaba que CU-PED-03 menciona una zona de cobertura que el modelo no
tiene. Ahora la cobertura **se publica** y el cliente la lee antes de armar el
pedido, que es cuando le sirve.

Sigue sin **validarse**: el sistema no rechaza una dirección por estar fuera.
Hacerlo exigiría un polígono o un radio y un cálculo geográfico. La ficha de
CU-PED-03 debería decir que la cobertura se informa, no que se verifica —o
conservar la excepción y aceptar que describe algo que el sistema no hace.

### 11.6 Verificación

**18 pruebas de integración** (`tests/negocio.test.ts`) y **10 de interfaz**
(`tests/BuscadorSitio.test.tsx`). Entre las que documentan una decisión:

- La información se consulta **sin sesión**, y se edita **solo** con el permiso.
- Sin ninguna fila en `configuracion`, la página se ve igual de completa.
- Guardar el teléfono **no borra** el horario: se escribe solo lo que llega.
- Una latitud sin su longitud se rechaza: media coordenada no ubica nada.
- El buscador encuentra información por su contenido y sin tildes.
- Escribir ocho letras dispara **una** consulta, no ocho.
- Un fallo del buscador no rompe la navegación del portal.

Una decisión de contrato quedó registrada al escribirlas: el buscador **no
reutiliza** `esquemaBusqueda` del catálogo aunque se parezca. Allí omitir el
término significa *«todos los productos»*; aquí un campo vacío significa
*«todavía no busqué nada»*, y vaciar la caja no es un error del usuario. Dos
reglas distintas para dos preguntas distintas.

---

## 12. Paginación de los listados — hallazgo H7

Antes de esto, **ningún listado tenía paginación ni filtro por fecha**. Cada
uno traía su tabla entera: con cinco mil ventas registradas, el historial las
cargaba todas para mostrar veinte. El problema no es la pantalla —es la
consulta, el JSON y la memoria del navegador, los tres creciendo sin techo
mientras el negocio funciona.

Es el hallazgo que un jurado técnico nota en la demostración, y el que rompe
RNF-REN-01 en cuanto el sistema acumula historia.

### 12.1 Un contrato, siete listados

`src/dtos/paginacion.dto.ts` define la forma **única** que devuelven todos:

```json
{ "datos": [...], "pagina": 1, "porPagina": 20, "total": 4831, "paginas": 242 }
```

Un formato distinto por módulo obligaría a que cada pantalla aprendiera el
suyo. Los siete listados que crecen sin techo lo usan:

| Endpoint | Filtros propios |
|---|---|
| `/api/ventas` | tipo de venta, cliente, rango de fechas |
| `/api/gestion/pedidos` | estado, rango de fechas |
| `/api/ingresos` · `/api/egresos` | motivo, rango de fechas |
| `/api/ordenes` | estado, rango de fechas |
| `/api/clientes` | término de búsqueda, incluir inactivos |
| `/api/usuarios` | — |

Los **catálogos acotados** —productos, insumos, almacenes, roles, cargos— no se
paginaron: su tamaño lo fija el negocio, no el tiempo, y paginarlos solo
complicaría los selectores que los consumen.

Cuatro decisiones que sostienen el contrato:

1. **El tope vive en el servidor.** Sin `POR_PAGINA_MAXIMO`, un
   `?porPagina=999999` devuelve la tabla entera y la paginación deja de
   proteger nada.
2. **`total` cuenta todo lo que cumple el filtro**, no lo que vino en la
   página. Confundirlos haría que el historial dijera «20 ventas» tenga el
   negocio veinte o veinte mil.
3. **La página y el conteo van en la misma transacción** (`$transaction`). Si
   fueran consultas sueltas, una venta registrada entre ambas descuadraría la
   última página.
4. **`paginas` lo calcula el servidor.** Si cada pantalla lo dedujera del
   total, una redondearía distinto que otra y la última página aparecería o
   desaparecería según dónde se mire.

### 12.2 El filtro por fecha es la otra mitad

H7 nombraba las dos cosas juntas, y es correcto: **la página acota cuánto se
trae; la fecha acota qué se trae**. Sin la segunda, buscar una venta de marzo
obliga a recorrer páginas hasta marzo.

Los límites se construyen en **hora local**. `new Date('2026-09-07')` es
medianoche UTC, y en Bolivia eso dejaría fuera lo ocurrido en las últimas
cuatro horas del día —que es el turno de la noche—. Es la misma corrección que
ya estaba en los reportes (§10), ahora compartida.

### 12.3 Lo que cambió en las pantallas

Paginar obligó a mover al servidor lo que antes se resolvía en el navegador,
porque **filtrar una página deja fuera lo que está en las otras**:

| Pantalla | Antes | Ahora |
|---|---|---|
| Historial de ventas | filtraba por tipo en el navegador | el filtro va al servidor |
| Tablero de pedidos | filtraba por estado en el navegador | el estado va al servidor; la búsqueda por texto afina dentro de la página |
| Órdenes de producción | filtraba por estado en el navegador | el estado va al servidor |
| Clientes | buscaba en el navegador | la búsqueda va al servidor |
| Movimientos | mezclaba ingresos y egresos | las dos fuentes avanzan en paralelo |

**Los tableros necesitaron una consulta propia.** El tablero de pedidos vive de
sus recuentos por estado, y contarlos sobre la página visible los volvería
falsos: «3 en camino» pasaría a significar «3 de los 20 que caben en
pantalla». Por eso hay `GET /api/gestion/pedidos/resumen` y
`GET /api/ordenes/resumen`, que agrupan **en la base** con `groupBy`. Traer
todos los pedidos para contarlos en memoria sería exactamente lo que la
paginación vino a evitar.

Son dos preguntas distintas —«¿cómo está el día?» y «¿qué pedidos veo
ahora?»— y merecían dos consultas.

### 12.4 Cifras que dejaron de mentir

Tres pantallas mostraban tarjetas de resumen calculadas sumando el array
completo. Con páginas, esas mismas sumas pasarían a describir «lo que se ve»
con la etiqueta de «el negocio». Se corrigieron:

- **Historial de ventas.** «Ventas registradas» ahora usa el total del
  servidor. «Total recaudado» dice explícitamente *«en esta página»*, porque
  sumar una página y llamarlo recaudación sería falso. Las cifras del período
  viven en **Reportes** (§10), que es la pantalla que existe para eso.
- **Clientes.** «Clientes activos» y «Fichas registradas» salen de los totales
  que informa el servidor.
- **Chips de filtro.** En ventas se quitaron las cantidades: contarlas exigiría
  una consulta por chip, y un número que solo cuenta la página confunde más que
  ayuda. En pedidos y órdenes sí las hay, porque ahí el resumen las provee.

### 12.5 Dos concesiones, dichas en voz alta

1. **La búsqueda por texto del tablero de pedidos sigue en el navegador** y
   afina dentro de la página. Llevarla al servidor pediría un índice de texto
   sobre tres campos de tablas distintas. El estado —que es como el personal
   filtra de verdad— sí lo aplica el servidor.
2. **La vista combinada de movimientos avanza las dos fuentes en paralelo.** La
   página N trae la N de ingresos y la N de egresos, ordenadas entre sí. El
   orden es exacto dentro de cada página y aproximado entre páginas, pero **no
   se pierde ninguna nota**, que es lo que importa en un registro de
   inventario. La vista estrictamente cronológica de todo el período es el
   reporte de movimientos (RF-INV-08).

También quedó fuera el **punto de venta**, que pide `?porPagina=100` para su
selector de clientes. Si el negocio supera ese número, el paso siguiente es
buscar por nombre contra el servidor, no subir el tope.

### 12.6 Verificación

**35 pruebas de integración** (`tests/paginacion.test.ts`) y **6 de interfaz**
(`tests/Paginacion.test.tsx`). Las que documentan una regla:

- Los siete listados responden **una página, no un arreglo**, con el mismo
  formato.
- Los siete rechazan `porPagina` por encima del máximo y una página que no sea
  un entero positivo.
- Una página más allá del final devuelve la lista vacía: es una respuesta
  válida, no un error.
- El total **no** es el tamaño de la página, y `paginas` redondea hacia arriba.
- La segunda página no repite elementos de la primera.
- Un período sin actividad devuelve cero, no todo.
- El recuento del tablero cuenta más allá de la página visible.
- `/api/ordenes/resumen` no lo captura la ruta `/:id`.
- El control no se dibuja con una sola página, y sus flechas no llevan a
  páginas que no existen.

Al escribirlas apareció una carencia aparte: dos controladores —pedidos de
gestión y clientes— descartaban el mensaje de Zod y respondían *«Filtro
inválido»*. Quien recibía ese 400 no sabía qué corregir. Ahora propagan el
detalle, como el resto.

---

## 13. Lo que la corrida dejó registrado — H5, H6 y H10

Tres hallazgos con **una sola causa**: la orden de producción guardaba lo que
se había *planificado*, nunca lo que *ocurrió*.

| # | Síntoma | De dónde salía el dato |
|---|---|---|
| H5 | El costo se recalculaba en cada consulta | `ingrediente.costo_unitario` de hoy |
| H6 | Una orden finalizada declaraba los insumos de la receta vigente | `receta.detalle_receta`, editable |
| H10 | Entraba al almacén siempre lo planificado | `orden.cantidad` |

Vistos juntos son el mismo problema que ya estaba resuelto en la venta, donde
`detalle_venta.precio_unitario` congela el precio del momento en lugar de leer
`producto.precio_venta`. La producción no tenía su equivalente.

### 13.1 Dos columnas, y el resto ya existía

`orden_produccion` gana:

```sql
cantidad_obtenida   INT,            -- lo que salió de verdad (H10)
costo_total         NUMERIC(10,2),  -- el costo real de la corrida (H5)
CONSTRAINT ck_ordprod_obtenida CHECK (cantidad_obtenida IS NULL OR cantidad_obtenida >= 0),
CONSTRAINT ck_ordprod_costo    CHECK (costo_total IS NULL OR costo_total >= 0)
```

Ambas nulas hasta finalizar: antes de ejecutar no hay nada que registrar, y un
cero significaría algo distinto de «todavía no».

**H6 no necesitó columna.** El dato correcto ya existía: al finalizar, la orden
genera una nota de egreso con las cantidades realmente consumidas y queda
enlazada en `orden_produccion.id_nota_egreso`. El servicio la ignoraba y
prefería recalcular. Ahora, para una orden **finalizada**, los insumos se leen
de ahí; el cálculo desde la receta solo vale para las órdenes *Pendiente* y *En
proceso*, donde todavía es una previsión.

Lo mismo con el almacén de destino (H4): estaba en
`detalle_ingreso_producto.id_almacen` desde siempre, sin que nadie lo leyera.
Ahora el DTO lo expone.

### 13.2 La merma, sin un segundo trámite

El caso que motivó H10: se hornean veinte galletas, tres salen quemadas, y el
sistema cree que hay veinte. La corrección existía —un egreso con motivo
*Merma*— pero era un trámite aparte, desconectado de la orden, y nada obligaba
a hacerlo.

Ahora `POST /api/ordenes/:id/finalizar` acepta `cantidadObtenida`:

- **Si se omite, se asume lo planificado.** El caso corriente no debe estorbar:
  quien no tuvo merma confirma sin tocar nada.
- **Lo que ingresa al almacén es lo obtenido**, no lo previsto.
- **Obtener de más no es merma negativa.** Es un rendimiento mejor, y llamarlo
  merma confundiría el dato. La merma es `max(0, planificado − obtenido)`.
- **Cero es válido.** Un lote entero puede perderse. En ese caso **no se emite
  nota de ingreso** —no entró nada— pero el egreso de insumos queda igual, que
  es justamente lo que hace visible la pérdida en lugar de esconderla.

### 13.3 El costo se reparte entre lo que salió

```
costo_unitario = costo_total_de_los_insumos / cantidad_obtenida
```

No entre lo planificado. Si se perdieron dos de cuatro barras, las dos que
quedaron cargan con el costo de las cuatro. **Eso es lo que convierte el dato
en información de costos y no en un adorno**: un negocio que produce con merma
tiene un costo unitario más alto, y el sistema debe decirlo.

Con pérdida total el costo unitario es `null`, no cero: no hay unidades entre
las cuales repartir, y un cero se leería como «salió gratis».

### 13.4 El reporte dejó de recalcular

RF-PRO-08 ahora lee `orden.costo_total` en lugar de escalar la receta, cuenta
**unidades obtenidas** y tiene una cifra propia de **merma** del período. En la
tabla de corridas, las que no tuvieron merma muestran un guion y no un cero:
una columna de ceros esconde las que sí la tuvieron.

Se conserva el cálculo desde la receta como respaldo para las órdenes anteriores
al cambio, que no tienen `costo_total`. No es una rama muerta: es lo que evita
que el reporte histórico quede en blanco.

### 13.5 Lo que ve el cocinero

El diálogo de finalización pide **una cosa más, y solo cuando hace falta**: un
campo «Porciones obtenidas» que viene rellenado con lo planificado. Al bajarlo,
aparece el aviso de cuánta merma se registrará y qué consecuencia tiene sobre el
costo. Al ponerlo en cero, el selector de almacén desaparece —no entra nada— y
el texto pasa a anunciar la pérdida total.

En la tarjeta de la orden, el título del bloque de insumos cambia según el
estado: **«Insumos requeridos»** antes de ejecutar, **«Insumos consumidos»**
después. No son el mismo dato y la pantalla no debería sugerir que sí.

### 13.6 Verificación

**14 pruebas de integración** (`tests/produccion-historial.test.ts`) y **7 de
interfaz** (`tests/DialogoFinalizar.test.tsx`). Las dos que cierran los
hallazgos de raíz:

- **Editar una receta ya no reescribe las órdenes finalizadas.** La prueba
  duplica la cantidad de cada insumo de la receta y comprueba que la orden ya
  cerrada sigue declarando lo que consumió.
- **Duplicar el costo de un insumo no altera el costo de lo ya producido.**

Y las que documentan la merma: lo que entra al almacén es lo obtenido; la merma
encarece cada unidad que sí salió; obtener de más no se llama merma; un lote
perdido por completo no ingresa nada pero sí consume.

### 13.7 Lo que sigue sin resolverse

El costo unitario del **ingrediente** que muestra una orden finalizada es el de
hoy, no el del día de la corrida: `detalle_egreso_insumo` no guarda costo —una
salida no tiene costo propio, como se explicó en §10—. Eso **no afecta al costo
del historial**, que quedó congelado en `costo_total`; solo al desglose línea
por línea. Guardarlo exigiría decidir un criterio de costeo —PEPS, promedio
ponderado— que el informe no define.

**Pendiente en el `.docx`**, ficha CU-PRO-02:

> *"Al registrar la finalización, el sistema solicita la cantidad efectivamente
> obtenida, que por omisión es la planificada. Ingresa al almacén la cantidad
> obtenida y registra la diferencia como merma de la corrida. El costo de la
> corrida se calcula como la suma del costo de los insumos consumidos y se
> distribuye entre las porciones obtenidas."*

---

## 14. Revisión de seguridad y consistencia

Repaso posterior a los cambios de las secciones 10 a 13, con el sistema
corriendo contra la base de desarrollo y no solo contra las pruebas. Encontró
tres problemas; los tres estaban **entre** piezas correctas, que es donde una
suite verde no mira.

### 14.1 H12 · El bloqueo de cuentas servía para expulsar a su dueño

**Qué se observó.** H8 hizo que el bloqueo por intentos fallidos **caduque**
solo. H9 hizo que cada petición **contraste** la sesión con el estado de la
cuenta. Las dos correcciones son buenas y, juntas, abrieron un agujero: la
regla de caducidad se escribió únicamente en el inicio de sesión, y el
middleware leía la bandera `bloqueado` sin saber que expira.

**Qué producía.** Comprobado contra el servidor real:

| Momento | Lo que ocurría |
|---|---|
| Un desconocido falla 3 veces con el nombre de usuario del administrador | La cuenta se bloquea |
| El administrador, trabajando con su sesión abierta | Recibe **401 en cada petición** |
| Vence el plazo de bloqueo | **Sigue recibiendo 401**: la bandera no se apaga sola |
| Alguien intenta iniciar sesión | Recién ahí se desbloquea |

Es decir: **cualquiera que supiera un nombre de usuario podía expulsar de su
sesión a quien sí sabía la contraseña**, sin adivinarla, y de forma repetible.
El bloqueo protegía la contraseña y a la vez servía para echar a su dueño —que
es exactamente el ataque de denegación de servicio que H8 quiso cerrar, entrando
por la puerta que H9 acababa de abrir.

**Solución.** La regla vive ahora en `src/services/bloqueo.service.ts`
—`estadoDelBloqueo` y `mensajeDeBloqueo`— y **la usan los dos caminos**: el
login, que decide si deja entrar, y el middleware, que decide si deja seguir
trabajando. Cumplido el plazo, el middleware apaga la bandera en la base, de
modo que el estado real y el registrado coinciden.

**Gravedad: alta.** No la detectaba ninguna prueba porque las de H8 miran el
login y las de H9 miran el middleware, y ninguna cruzaba las dos reglas. Hay
dos pruebas nuevas que sí lo hacen (`tests/seguridad.test.ts`): que la sesión
abierta vuelva a funcionar sola cumplido el plazo, y que la bandera quede
apagada en la base.

### 14.2 H13 · Tres listados se paginaban sin índice por fecha

**Qué se observó.** La paginación de §12 ordena por `fecha DESC` y filtra por
rango en siete listados. Tres de las tablas no tenían índice por fecha:
`nota_ingreso`, `nota_egreso` y `orden_produccion`.

**Qué producía.** Cada página recorría la tabla entera y la ordenaba en
memoria: el costo que la paginación venía a evitar, trasladado del navegador a
la base. Contradice RNF-REN-04, el mismo requisito que motivó los índices de A3.

**Solución.** Tres índices nuevos —`ix_notaing_fecha`, `ix_notaegr_fecha`,
`ix_ordprod_fecha`—, que llevan el esquema a **45**.

**Gravedad: media, y creciente.** Invisible con datos de prueba, que es
precisamente por qué conviene señalarlo.

### 14.3 H14 · La regla de la hora local estaba triplicada

**Qué se observó.** La conversión de una fecha `AAAA-MM-DD` a los límites del
día **en hora local** —la que evita que un reporte "del 7" pierda las últimas
cuatro horas del 7 en Bolivia— aparecía escrita tres veces: en
`paginacion.dto.ts`, en `reporte.service.ts` y en `reporte-operaciones.service.ts`.

Peor: §12 de este documento ya la describía como *"compartida"*, y no lo estaba.

**Qué producía.** Nada todavía. Es deuda: corregir el criterio en una copia
dejaría las otras dos desfasadas sin que ninguna prueba lo delate, y el síntoma
—cuatro horas de ventas que aparecen en el día equivocado— es de los que se
descubren tarde y se explican mal.

**Solución.** `src/utils/fechas.ts` es el único lugar donde se decide qué es
"el día del negocio". `paginacion.dto.ts` lo reexporta para que los modelos lo
reciban junto al resto del contrato. Se unificó también `dosDecimales`, que
estaba en cuatro servicios, en `src/utils/dinero.ts`: el criterio de redondeo
del sistema es uno solo.

### 14.4 Lo que se verificó y está bien

Con el sistema corriendo, no contra mocks:

| Qué | Resultado |
|---|---|
| Los siete listados paginados | Responden el contrato correcto contra datos reales |
| Los dos resúmenes de tablero | `groupBy` correcto, y las rutas no las captura `/:id` |
| Órdenes **anteriores** al cambio de esquema | No se rompen: campos nuevos en `null`, y el reporte recalcula |
| Producción con merma, extremo a extremo | 8 planificadas, 5 obtenidas, 3 de merma, costo 19,76 → 3,95 por unidad |
| PDF de reportes | 200, `application/pdf`, cabecera `%PDF` |
| Buscador e información del negocio, sin sesión | Correcto |
| 60 peticiones concurrentes a un listado | 60 × 200 en 2,5 s: el `$transaction` no agota el pool |
| Las 21 rutas que consume el frontend | Todas responden |
| Las 14 páginas del frontend en `dev` | Todas 200, sin errores en consola |
| Reglas de capas | Ningún controlador toca Prisma, ningún modelo importa un servicio, ningún `try/catch` en controladores, ningún `fetch` directo en componentes |
| Valores de dominio duplicados | Los estados del backend y del frontend coinciden |

### 14.5 Observación abierta

Cada petición autenticada cuesta **dos consultas**: el estado de la cuenta
(H9) y los permisos (RNF-SEG-04). Es deliberado —revocar un acceso surte efecto
en la petición siguiente y no en ocho horas— y la medición dice que aguanta,
pero es el primer sitio donde mirar si algún día el sistema va lento. La salida
natural sería una caché muy breve, del mismo estilo que la del modo de cobro,
aceptando que revocar tarde esos segundos en surtir efecto.

---

## 15. Anexo: la pregunta del docente

### 15.1 "¿Es de alto nivel o general?"

La dificultad está en que los dos autores de referencia usan el término "alto nivel" con sentidos **opuestos**:

| Autor | Qué llama "caso de uso de alto nivel" | Valoración |
|---|---|---|
| **Larman** | Un **formato de redacción breve**: nombre, actores, propósito, resumen, tipo, referencias cruzadas | ✅ Buena práctica |
| **Arlow** (§5.7.3) | Un **caso de uso paraguas** que luego se desglosa en casos de uso menores | 🔴 Anti-patrón (*descomposición funcional*) |

> **Arlow, §5.7.3:** *"Un error común en el análisis de caso de uso es crear un conjunto de casos de uso de 'alto nivel' y luego desglosarlos en un conjunto de casos de uso de bajo nivel… Este enfoque al diseño de software se conoce como descomposición funcional y es erróneo cuando se aplica al modelado de casos de uso."*

### 15.2 El criterio del docente

El docente añadió después que **un diagrama sin `include` ni `extend` es más un diagrama de alto nivel que uno general**:

| | Qué muestra |
|---|---|
| **Diagrama de alto nivel** | Solo actores + casos de uso + asociaciones. El **qué** hace el sistema |
| **Diagrama general** | Todo lo anterior **más** la estructura interna: `include` y `extend` |

Cuando revisó el documento, el diagrama tenía **3 `include` y 1 `extend`** para 21 casos de uso — prácticamente sin estructura. De ahí la observación.

### 15.3 Respuesta sugerida para la defensa

> *"Son artefactos distintos y hay que precisar de qué autor hablamos. En Larman, un caso de uso de alto nivel es un formato de redacción breve —nombre, actores, propósito, resumen— y lo uso en mi sección 2.4.4; el formato expandido, con flujo de eventos y cursos alternos, está en la sección 3.2.*
>
> *Pero en Arlow, §5.7.3, 'caso de uso de alto nivel' significa otra cosa: un caso de uso paraguas que se desglosa en casos de uso menores. Eso es descomposición funcional y es un anti-patrón, porque el modelo pasa a describir funciones anidadas en vez de objetivos del actor.*
>
> *El diagrama general de casos de uso no es ninguna de las dos: es la vista gráfica del modelo completo, con el límite del sistema, los actores fuera, los casos de uso dentro y las relaciones `include` y `extend` que muestran su estructura interna."*

### 15.4 Si pregunta por los nombres "Gestionar"

> *"Reconozco que el nombre sugiere el patrón que Arlow advierte, y por eso los renombré. Pero mi modelo no es una descomposición funcional: es plano, no parte de un caso de uso único, no tiene jerarquía de más de un nivel y cada caso de uso tiene su propia especificación con flujo de eventos. El problema estaba en el nombre, no en la estructura."*

### 15.5 Si pregunta por qué tantos `include` y `extend`

> *"Cada `include` corresponde a un paso que aparece literalmente en el flujo de eventos de la sección 3.2, y cada `extend` sale de la sección 'Variaciones y Extensiones' del caso de uso base. No agregué ninguno para estructurar artificialmente el modelo."*

---

## Referencias

- **Arlow, J. & Neustadt, I.** *UML 2 y el Proceso Unificado: Análisis y Diseño Orientado a Objetos.*
  - §4.2 — Componentes del modelo de caso de uso
  - §4.3 — Límite del sistema (el sujeto), actores y casos de uso
  - §4.3.3 — Identificar casos de uso y convención de nombres
  - §5.4 — `«include»`
  - §5.5 — `«extend»`
  - §5.6 — Cuándo utilizar características avanzadas
  - §5.7.3 — Evite descomposición funcional
- **Larman, C.** *UML y Patrones.* Formatos de caso de uso de alto nivel y expandido.
