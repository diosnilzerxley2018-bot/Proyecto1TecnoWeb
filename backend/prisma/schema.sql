CREATE TABLE rol (
    id_rol      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE permiso (
    id_permiso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE rol_permiso (
    id_rol_permiso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_rol          INT NOT NULL,
    id_permiso      INT NOT NULL,
    CONSTRAINT uq_rol_permiso UNIQUE (id_rol, id_permiso),
    CONSTRAINT fk_rol_permiso_rol     FOREIGN KEY (id_rol)     REFERENCES rol(id_rol),
    CONSTRAINT fk_rol_permiso_permiso FOREIGN KEY (id_permiso) REFERENCES permiso(id_permiso)
);

CREATE TABLE usuario (
    id_usuario          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    telefono            VARCHAR(20),
    nombre_usuario      VARCHAR(50)  NOT NULL UNIQUE,
    contrasena_hash     VARCHAR(255) NOT NULL,
    intentos_fallidos   INT     NOT NULL DEFAULT 0,
    bloqueado           BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_bloqueo       TIMESTAMP,
    -- Cuantas veces se bloqueo esta cuenta desde el ultimo acceso correcto.
    -- Es lo que hace que el bloqueo escale: el primero dura un minuto, el
    -- segundo cinco y el tercero ya no caduca (CU-SEG-05). Entrar bien lo
    -- devuelve a cero: quien demuestra ser el dueno no arrastra la escalada.
    veces_bloqueado     INT     NOT NULL DEFAULT 0,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ultimo inicio de sesion correcto. Se le muestra al titular en su perfil:
    -- es la forma mas simple de que note un acceso que no hizo el. Nulo
    -- mientras la cuenta nunca haya iniciado sesion.
    ultimo_acceso       TIMESTAMP,
    id_rol              INT NOT NULL,
    CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
);

CREATE TABLE usuario_rol_permiso (
    id_usuario_rol_permiso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario              INT NOT NULL,
    id_rol_permiso          INT NOT NULL,
    CONSTRAINT uq_usuario_rol_permiso UNIQUE (id_usuario, id_rol_permiso),
    CONSTRAINT fk_urp_usuario     FOREIGN KEY (id_usuario)     REFERENCES usuario(id_usuario),
    CONSTRAINT fk_urp_rol_permiso FOREIGN KEY (id_rol_permiso) REFERENCES rol_permiso(id_rol_permiso)
);

CREATE TABLE cargo (
    id_cargo        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE,
    salario_base    NUMERIC(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT ck_cargo_salario CHECK (salario_base >= 0)
);

CREATE TABLE empleado (
    id_empleado     INT PRIMARY KEY,
    fecha_ingreso   DATE NOT NULL DEFAULT CURRENT_DATE,
    -- De turno o no. Solo tiene sentido para el cargo Repartidor: es lo que
    -- impide que el reparto automatico le asigne una entrega a quien esta de
    -- franco. Nace en falso: estar de turno se declara, no se supone.
    disponible      BOOLEAN NOT NULL DEFAULT FALSE,
    id_cargo        INT NOT NULL,
    CONSTRAINT fk_empleado_usuario FOREIGN KEY (id_empleado) REFERENCES usuario(id_usuario),
    CONSTRAINT fk_empleado_cargo   FOREIGN KEY (id_cargo)    REFERENCES cargo(id_cargo)
);

CREATE TABLE cliente (
    id_cliente              INT PRIMARY KEY,
    preferencia_alimentaria VARCHAR(100),
    restriccion_dietetica   VARCHAR(100),
    CONSTRAINT fk_cliente_usuario FOREIGN KEY (id_cliente) REFERENCES usuario(id_usuario)
);

-- Direcciones de entrega. Un cliente tiene varias: su casa, su oficina, la
-- casa de un familiar. Antes la tabla no tenia dueno y cada pedido creaba una
-- fila suelta, de modo que el cliente reescribia su direccion cada vez.
--
-- LAS FILAS NO SE EDITAN, SE REEMPLAZAN. Si el cliente corrige "Casa" y esa
-- misma fila la apunta un pedido de hace tres meses, ese pedido pasaria a
-- decir que se entrego en la direccion nueva: el historial se reescribiria
-- solo. Por eso editar crea una fila nueva y marca la anterior como
-- archivada. Es el mismo criterio con el que detalle_venta guarda su propia
-- copia del precio.
CREATE TABLE ubicacion (
    id_ubicacion    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    calle           VARCHAR(150) NOT NULL,
    numero          VARCHAR(20),
    referencia      VARCHAR(150),
    latitud         NUMERIC(8,6),
    longitud        NUMERIC(9,6),
    -- Nombre con el que el cliente la reconoce: "Casa", "Oficina".
    etiqueta        VARCHAR(50),
    -- Dueno. Es anulable porque las direcciones registradas antes de esta
    -- columna no lo tienen, y siguen siendo validas para sus pedidos.
    id_cliente      INT,
    -- Falso cuando fue reemplazada por una version corregida. Deja de
    -- ofrecerse al pedir, pero los pedidos que la usaron la conservan.
    vigente         BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ubicacion_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
    CONSTRAINT ck_ubicacion_lat CHECK (latitud  IS NULL OR latitud  BETWEEN  -90 AND  90),
    CONSTRAINT ck_ubicacion_lon CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180)
);

CREATE TABLE categoria (
    id_categoria    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE unidad_medida (
    id_unidad       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(20) NOT NULL UNIQUE,
    abreviatura     VARCHAR(5)  NOT NULL
);

CREATE TABLE almacen (
    id_almacen          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(50) NOT NULL UNIQUE,
    tipo_conservacion   VARCHAR(20) NOT NULL,
    ubicacion_fisica    VARCHAR(150),
    -- Destino por omision de lo que se produce con esta conservacion.
    -- Con un solo almacen por tipo el sistema deduce el destino solo; al
    -- aparecer el segundo deja de poder hacerlo y lo pide en cada produccion.
    -- Marcar uno como preferido devuelve esa deduccion sin quitar la
    -- posibilidad de elegir otro cuando haga falta.
    preferido           BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_almacen_tipo CHECK (tipo_conservacion IN ('Seco','Refrigerado'))
);

CREATE TABLE producto (
    id_producto         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         VARCHAR(250),
    precio_venta        NUMERIC(10,2) NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    tipo_conservacion   VARCHAR(20) NOT NULL DEFAULT 'Seco',
    id_categoria        INT NOT NULL,
    -- La foto del producto vive en la misma fila, no en el disco del
    -- servidor: Railway lo reinicia en cada despliegue y una imagen guardada
    -- ahí desaparecería con el siguiente `git push`. Así viaja con el resto
    -- del producto y con las mismas copias de seguridad de la base.
    imagen               BYTEA,
    imagen_tipo          VARCHAR(20),
    imagen_actualizada_en TIMESTAMPTZ,
    CONSTRAINT fk_producto_categoria FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria),
    CONSTRAINT ck_producto_precio CHECK (precio_venta >= 0),
    CONSTRAINT ck_producto_conservacion CHECK (tipo_conservacion IN ('Seco','Refrigerado')),
    -- El tipo declarado lo decide el servidor tras mirar los primeros bytes
    -- del archivo, nunca lo que dice el cliente (RNF-SEG-04).
    CONSTRAINT ck_producto_imagen_tipo CHECK (imagen_tipo IS NULL OR imagen_tipo IN ('image/jpeg','image/png','image/webp')),
    CONSTRAINT ck_producto_imagen_completa CHECK ((imagen IS NULL) = (imagen_tipo IS NULL))
);

CREATE TABLE valor_nutricional (
    id_producto     INT PRIMARY KEY,
    calorias        INT NOT NULL,
    proteinas_g     NUMERIC(6,2) NOT NULL,
    carbohidratos_g NUMERIC(6,2) NOT NULL,
    grasas_g        NUMERIC(6,2) NOT NULL,
    fibra_g         NUMERIC(6,2),
    CONSTRAINT fk_valnut_producto FOREIGN KEY (id_producto)
        REFERENCES producto(id_producto) ON DELETE CASCADE
);

CREATE TABLE ingrediente (
    id_ingrediente      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    stock_minimo        NUMERIC(10,2) NOT NULL DEFAULT 0,
    costo_unitario      NUMERIC(10,2) NOT NULL DEFAULT 0,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    tipo_conservacion   VARCHAR(20) NOT NULL DEFAULT 'Seco',
    controla_vencimiento BOOLEAN NOT NULL DEFAULT FALSE,
    id_unidad           INT NOT NULL,
    CONSTRAINT fk_ingrediente_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_medida(id_unidad),
    CONSTRAINT ck_ingrediente_conservacion CHECK (tipo_conservacion IN ('Seco','Refrigerado')),
    CONSTRAINT ck_ingrediente_costo  CHECK (costo_unitario >= 0),
    CONSTRAINT ck_ingrediente_minimo CHECK (stock_minimo >= 0)
);

CREATE TABLE receta (
    id_receta                   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                      VARCHAR(100) NOT NULL,
    rendimiento                 INT NOT NULL DEFAULT 1,
    tiempo_preparacion_minutos  INT NOT NULL,
    instrucciones               VARCHAR(500),
    activa                      BOOLEAN NOT NULL DEFAULT TRUE,
    -- Una bebida escala de forma continua; una bandeja de horno, no. Cuando la
    -- receta no es divisible, producir de menos obliga a hacer la corrida
    -- completa y el excedente queda en inventario.
    divisible                   BOOLEAN NOT NULL DEFAULT TRUE,
    id_producto                 INT NOT NULL,
    CONSTRAINT fk_receta_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
    CONSTRAINT ck_receta_rendimiento CHECK (rendimiento > 0)
);

CREATE UNIQUE INDEX ux_receta_activa
    ON receta (id_producto) WHERE activa;

CREATE TABLE detalle_receta (
    id_receta           INT NOT NULL,
    id_ingrediente      INT NOT NULL,
    cantidad_requerida  NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_receta, id_ingrediente),
    CONSTRAINT fk_detreceta_receta      FOREIGN KEY (id_receta)      REFERENCES receta(id_receta),
    CONSTRAINT fk_detreceta_ingrediente FOREIGN KEY (id_ingrediente) REFERENCES ingrediente(id_ingrediente),
    CONSTRAINT ck_detreceta_cantidad CHECK (cantidad_requerida > 0)
);

CREATE TABLE ingrediente_almacen (
    id_ingrediente  INT NOT NULL,
    id_almacen      INT NOT NULL,
    stock_actual    NUMERIC(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_ingrediente, id_almacen),
    CONSTRAINT fk_ingalm_ingrediente FOREIGN KEY (id_ingrediente) REFERENCES ingrediente(id_ingrediente),
    CONSTRAINT fk_ingalm_almacen     FOREIGN KEY (id_almacen)     REFERENCES almacen(id_almacen),
    CONSTRAINT ck_ingalm_stock CHECK (stock_actual >= 0)
);

CREATE TABLE producto_almacen (
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    stock_actual    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id_producto, id_almacen),
    CONSTRAINT fk_prodalm_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
    CONSTRAINT fk_prodalm_almacen  FOREIGN KEY (id_almacen)  REFERENCES almacen(id_almacen),
    CONSTRAINT ck_prodalm_stock CHECK (stock_actual >= 0)
);

CREATE TABLE nota_ingreso (
    id_nota_ingreso     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo              VARCHAR(20) NOT NULL DEFAULT 'Compra',
    proveedor           VARCHAR(150),
    numero_documento    VARCHAR(50),
    total               NUMERIC(12,2) NOT NULL DEFAULT 0,
    id_empleado         INT NOT NULL,
    CONSTRAINT fk_notaing_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
    CONSTRAINT ck_notaing_motivo CHECK (motivo IN ('Compra','Produccion','Ajuste','Devolucion'))
);

CREATE TABLE detalle_ingreso_insumo (
    id_nota_ingreso INT NOT NULL,
    id_ingrediente  INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        NUMERIC(10,2) NOT NULL,
    costo_unitario  NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_nota_ingreso, id_ingrediente, id_almacen),
    CONSTRAINT fk_detingins_nota FOREIGN KEY (id_nota_ingreso) REFERENCES nota_ingreso(id_nota_ingreso),
    CONSTRAINT fk_detingins_stock FOREIGN KEY (id_ingrediente, id_almacen)
        REFERENCES ingrediente_almacen(id_ingrediente, id_almacen),
    CONSTRAINT ck_detingins_cant CHECK (cantidad > 0)
);

CREATE TABLE detalle_ingreso_producto (
    id_nota_ingreso INT NOT NULL,
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        INT NOT NULL,
    costo_unitario  NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_nota_ingreso, id_producto, id_almacen),
    CONSTRAINT fk_detingprod_nota FOREIGN KEY (id_nota_ingreso) REFERENCES nota_ingreso(id_nota_ingreso),
    CONSTRAINT fk_detingprod_stock FOREIGN KEY (id_producto, id_almacen)
        REFERENCES producto_almacen(id_producto, id_almacen),
    CONSTRAINT ck_detingprod_cant CHECK (cantidad > 0)
);

CREATE TABLE nota_egreso (
    id_nota_egreso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo          VARCHAR(20) NOT NULL,
    observacion     VARCHAR(200),
    id_empleado     INT NOT NULL,
    CONSTRAINT fk_notaegr_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
    CONSTRAINT ck_notaegr_motivo CHECK (motivo IN ('Produccion','Merma','Ajuste'))
);

CREATE TABLE detalle_egreso_insumo (
    id_nota_egreso  INT NOT NULL,
    id_ingrediente  INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_nota_egreso, id_ingrediente, id_almacen),
    CONSTRAINT fk_detegrins_nota FOREIGN KEY (id_nota_egreso) REFERENCES nota_egreso(id_nota_egreso),
    CONSTRAINT fk_detegrins_stock FOREIGN KEY (id_ingrediente, id_almacen)
        REFERENCES ingrediente_almacen(id_ingrediente, id_almacen),
    CONSTRAINT ck_detegrins_cant CHECK (cantidad > 0)
);

CREATE TABLE detalle_egreso_producto (
    id_nota_egreso  INT NOT NULL,
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        INT NOT NULL,
    PRIMARY KEY (id_nota_egreso, id_producto, id_almacen),
    CONSTRAINT fk_detegrprod_nota FOREIGN KEY (id_nota_egreso) REFERENCES nota_egreso(id_nota_egreso),
    CONSTRAINT fk_detegrprod_stock FOREIGN KEY (id_producto, id_almacen)
        REFERENCES producto_almacen(id_producto, id_almacen),
    CONSTRAINT ck_detegrprod_cant CHECK (cantidad > 0)
);

CREATE TABLE orden_produccion (
    id_orden_produccion INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_receta           INT NOT NULL,
    cantidad            INT NOT NULL,
    estado              VARCHAR(15) NOT NULL DEFAULT 'Pendiente',
    fecha_finalizacion  TIMESTAMP,
    id_empleado         INT NOT NULL,
    id_nota_egreso      INT,
    id_nota_ingreso     INT,
    -- Producción al instante: la orden nace y se cierra en la misma operación
    -- de venta, sin pasar por la planificación.
    instantanea         BOOLEAN NOT NULL DEFAULT FALSE,
    -- Hallazgo H10: lo que salio de verdad del horno, que no siempre es lo
    -- planificado. Nulo mientras la orden no se finaliza. Cero es valido: un
    -- lote entero puede perderse, y los insumos ya se consumieron igual.
    cantidad_obtenida   INT,
    -- Hallazgo H5 y H6: el costo real de la corrida, congelado al finalizar.
    -- Recalcularlo desde la receta haria que corregir un precio de insumo
    -- reescribiera el costo de todo lo ya producido.
    costo_total         NUMERIC(10,2),
    CONSTRAINT fk_ordprod_receta   FOREIGN KEY (id_receta)       REFERENCES receta(id_receta),
    CONSTRAINT fk_ordprod_empleado FOREIGN KEY (id_empleado)     REFERENCES empleado(id_empleado),
    CONSTRAINT fk_ordprod_egreso   FOREIGN KEY (id_nota_egreso)  REFERENCES nota_egreso(id_nota_egreso),
    CONSTRAINT fk_ordprod_ingreso  FOREIGN KEY (id_nota_ingreso) REFERENCES nota_ingreso(id_nota_ingreso),
    CONSTRAINT ck_ordprod_estado   CHECK (estado IN ('Pendiente','En proceso','Finalizada','Cancelada')),
    CONSTRAINT ck_ordprod_cantidad CHECK (cantidad > 0),
    CONSTRAINT ck_ordprod_obtenida CHECK (cantidad_obtenida IS NULL OR cantidad_obtenida >= 0),
    CONSTRAINT ck_ordprod_costo    CHECK (costo_total IS NULL OR costo_total >= 0)
);

CREATE TABLE venta (
    id_venta        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo_venta      VARCHAR(10) NOT NULL DEFAULT 'Mesa',
    metodo_pago     VARCHAR(20) NOT NULL,
    -- El efectivo se cobra en el acto; el pago en linea espera a la
    -- pasarela, y hasta que confirme la venta queda Pendiente.
    estado_pago     VARCHAR(20) NOT NULL DEFAULT 'Pagado',
    total           NUMERIC(12,2) NOT NULL,
    id_cliente      INT,
    id_empleado     INT NOT NULL,
    CONSTRAINT fk_venta_cliente  FOREIGN KEY (id_cliente)  REFERENCES cliente(id_cliente),
    CONSTRAINT fk_venta_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
    CONSTRAINT ck_venta_tipo CHECK (tipo_venta  IN ('Mesa','Llevar')),
    CONSTRAINT ck_venta_pago CHECK (metodo_pago IN ('Efectivo','Tarjeta','QR')),
    CONSTRAINT ck_venta_estado_pago CHECK (estado_pago IN ('Pendiente','Pagado','Anulado'))
);

CREATE TABLE detalle_venta (
    id_venta        INT NOT NULL,
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        INT NOT NULL,
    precio_unitario NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_venta, id_producto, id_almacen),
    CONSTRAINT fk_detventa_venta FOREIGN KEY (id_venta) REFERENCES venta(id_venta),
    CONSTRAINT fk_detventa_stock FOREIGN KEY (id_producto, id_almacen)
        REFERENCES producto_almacen(id_producto, id_almacen),
    CONSTRAINT ck_detventa_cant CHECK (cantidad > 0)
);

CREATE TABLE pedido (
    id_pedido           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_pedido       VARCHAR(20) NOT NULL DEFAULT 'Recibido',
    estado_pago         VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    metodo_pago         VARCHAR(20) NOT NULL,
    referencia_pago     VARCHAR(100),
    total               NUMERIC(12,2) NOT NULL,
    fecha_entrega       TIMESTAMP,
    id_cliente          INT NOT NULL,
    id_ubicacion        INT NOT NULL,
    id_repartidor       INT,
    CONSTRAINT fk_pedido_cliente    FOREIGN KEY (id_cliente)    REFERENCES cliente(id_cliente),
    CONSTRAINT fk_pedido_ubicacion  FOREIGN KEY (id_ubicacion)  REFERENCES ubicacion(id_ubicacion),
    CONSTRAINT fk_pedido_repartidor FOREIGN KEY (id_repartidor) REFERENCES empleado(id_empleado),
    CONSTRAINT ck_pedido_estado CHECK (estado_pedido IN ('Pendiente de pago','Recibido','En preparacion','En camino','Entregado','Cancelado')),
    CONSTRAINT ck_pedido_pago   CHECK (estado_pago  IN ('Pendiente','Pagado','Vencido')),
    CONSTRAINT ck_pedido_metodo CHECK (metodo_pago  IN ('Efectivo','Tarjeta','QR'))
);

CREATE TABLE detalle_pedido (
    id_pedido       INT NOT NULL,
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        INT NOT NULL,
    precio_unitario NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_pedido, id_producto, id_almacen),
    CONSTRAINT fk_detpedido_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido),
    CONSTRAINT fk_detpedido_stock  FOREIGN KEY (id_producto, id_almacen)
        REFERENCES producto_almacen(id_producto, id_almacen),
    CONSTRAINT ck_detpedido_cant CHECK (cantidad > 0)
);




-- =====================================================================
-- Trazabilidad de lotes y vencimiento (hallazgo A6)
-- =====================================================================
-- El negocio se define por insumos frescos y perecederos, pero el modelo no
-- permitia saber que vence primero. Un lote agrupa lo recibido en una misma
-- entrada con una misma fecha de vencimiento.
--
-- Solo se exige lote a los insumos con `controla_vencimiento`: obligar a la
-- harina o a la avena a llevar lote encarece cada ingreso sin aportar nada.
--
-- `ingrediente_almacen.stock_actual` sigue siendo la existencia consolidada y
-- es la cifra que consultan el control de stock y las alertas. `lote_almacen`
-- la descompone por lote. Ambas se actualizan en la misma transaccion y por
-- las mismas funciones del modelo, que es lo que impide que divergan.

CREATE TABLE lote (
    id_lote             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo              VARCHAR(50),
    fecha_vencimiento   DATE NOT NULL,
    fecha_registro      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_ingrediente      INT NOT NULL,
    CONSTRAINT fk_lote_ingrediente FOREIGN KEY (id_ingrediente)
        REFERENCES ingrediente(id_ingrediente)
);

CREATE TABLE lote_almacen (
    id_lote         INT NOT NULL,
    id_almacen      INT NOT NULL,
    stock_actual    NUMERIC(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_lote, id_almacen),
    CONSTRAINT fk_lotealm_lote    FOREIGN KEY (id_lote)    REFERENCES lote(id_lote),
    CONSTRAINT fk_lotealm_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT ck_lotealm_stock CHECK (stock_actual >= 0)
);

-- =====================================================================
-- Contador de visitas del sitio (RF-WEB-03)
-- =====================================================================
-- "Cada página debe mostrar en su pie el número de visitas acumuladas."
-- Se guarda una fila por visita en lugar de un contador único: ocupa poco,
-- permite responder ademas desde cuando se acumula y no obliga a bloquear
-- una fila compartida en cada peticion.

CREATE TABLE visita (
    id_visita   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ruta        VARCHAR(200)
);

-- =====================================================================
-- Cobros en linea (RF-PED-04)
-- =====================================================================
-- Hasta aqui el pago era una etiqueta: una columna `metodo_pago` que
-- decia como dijo alguien que habia pagado, y un `estado_pago` que el
-- propio navegador del cliente decidia. Estas tablas convierten el cobro
-- en un hecho verificable.
--
-- Un cobro tiene vida propia: se crea, se envia a la pasarela, la
-- pasarela responde minutos despues, puede fallar, puede vencer y puede
-- reembolsarse. Nada de eso cabe en una columna de la venta.

CREATE TABLE configuracion (
    clave           VARCHAR(50) PRIMARY KEY,
    valor           VARCHAR(200) NOT NULL,
    descripcion     VARCHAR(200),
    actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Quien hizo el ultimo cambio. Importa sobre todo para el modo de
    -- cobro: pasar a dinero real debe quedar con nombre y fecha.
    id_usuario      INT,
    CONSTRAINT fk_config_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);

CREATE TABLE pago (
    id_pago             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    monto               NUMERIC(12,2) NOT NULL,
    moneda              CHAR(3)      NOT NULL DEFAULT 'BOB',
    metodo              VARCHAR(20)  NOT NULL,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'Pendiente',
    -- Congela si el cobro fue simulado o con dinero real. Sin esta
    -- columna, despues de activar el modo real seria imposible separar
    -- la recaudacion verdadera de la de las demostraciones.
    modo                VARCHAR(10)  NOT NULL,
    pasarela            VARCHAR(30)  NOT NULL,
    -- Identificador del lado de la pasarela. Es la clave de la
    -- idempotencia: las pasarelas reintentan sus avisos.
    id_transaccion_ext  VARCHAR(100),
    -- Lo que hay que mostrarle al cliente: el contenido del QR o la URL
    -- del checkout alojado, segun lo devuelva la pasarela.
    datos_cobro         TEXT,
    -- Como hay que mostrar `datos_cobro`. Lo dice la pasarela al abrir el
    -- cobro y por eso se guarda: adivinarlo por la forma del texto daba un
    -- QR a quien habia elegido Tarjeta. Nulo mientras el cobro no se abrio.
    tipo_datos          VARCHAR(4),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion    TIMESTAMP,
    fecha_confirmacion  TIMESTAMP,
    id_venta            INT,
    id_pedido           INT,
    CONSTRAINT fk_pago_venta  FOREIGN KEY (id_venta)  REFERENCES venta(id_venta),
    CONSTRAINT fk_pago_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido),
    CONSTRAINT ck_pago_monto  CHECK (monto > 0),
    CONSTRAINT ck_pago_metodo CHECK (metodo IN ('Efectivo','Tarjeta','QR')),
    CONSTRAINT ck_pago_estado CHECK (estado IN ('Pendiente','Pagado','Fallido','Vencido','Reembolsado')),
    CONSTRAINT ck_pago_modo   CHECK (modo   IN ('Simulado','Real')),
    CONSTRAINT ck_pago_tipo_datos CHECK (tipo_datos IS NULL OR tipo_datos IN ('qr','url')),
    -- Un cobro paga una venta o un pedido, nunca los dos ni ninguno.
    CONSTRAINT ck_pago_origen CHECK ((id_venta IS NOT NULL) <> (id_pedido IS NOT NULL))
);

-- Bitacora de todo lo que le ocurrio al cobro, tal como llego. Es lo
-- unico que permite reconstruir un reclamo de "yo pague y no me llego".
CREATE TABLE evento_pago (
    id_evento    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pago      INT NOT NULL,
    tipo         VARCHAR(30)  NOT NULL,
    origen       VARCHAR(20)  NOT NULL,
    cuerpo       TEXT         NOT NULL,
    recibido_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evento_pago FOREIGN KEY (id_pago) REFERENCES pago(id_pago),
    CONSTRAINT ck_evento_origen CHECK (origen IN ('Pasarela','Sistema','Empleado'))
);

-- =====================================================================
-- Índices (RNF-REN-04)
-- =====================================================================
-- PostgreSQL indexa automáticamente las claves primarias y las únicas,
-- pero NO las claves foráneas. Sin estos índices, cada consulta por el
-- lado "muchos" de una relación recorre la tabla completa.
--
-- No se listan las claves foráneas que ya encabezan una clave primaria
-- compuesta —como `id_pedido` en `detalle_pedido`— porque el índice de
-- esa primaria ya las cubre. Sí se indexan las columnas que quedan en
-- segunda posición, que ese índice no alcanza.

-- Seguridad
CREATE INDEX ix_usuario_rol              ON usuario(id_rol);
CREATE INDEX ix_rolpermiso_permiso       ON rol_permiso(id_permiso);
CREATE INDEX ix_usuariorolpermiso_rp     ON usuario_rol_permiso(id_rol_permiso);
CREATE INDEX ix_empleado_cargo           ON empleado(id_cargo);

-- Catálogo y recetas
CREATE INDEX ix_producto_categoria       ON producto(id_categoria);
CREATE INDEX ix_ingrediente_unidad       ON ingrediente(id_unidad);
CREATE INDEX ix_receta_producto          ON receta(id_producto);
CREATE INDEX ix_detreceta_ingrediente    ON detalle_receta(id_ingrediente);

-- Existencias: el almacén queda en segunda posición de la clave primaria
CREATE INDEX ix_ingalm_almacen           ON ingrediente_almacen(id_almacen);
CREATE INDEX ix_prodalm_almacen          ON producto_almacen(id_almacen);

-- Movimientos de inventario
CREATE INDEX ix_notaing_empleado         ON nota_ingreso(id_empleado);
CREATE INDEX ix_notaegr_empleado         ON nota_egreso(id_empleado);
CREATE INDEX ix_detingins_stock          ON detalle_ingreso_insumo(id_ingrediente, id_almacen);
CREATE INDEX ix_detingprod_stock         ON detalle_ingreso_producto(id_producto, id_almacen);
CREATE INDEX ix_detegrins_stock          ON detalle_egreso_insumo(id_ingrediente, id_almacen);
CREATE INDEX ix_detegrprod_stock         ON detalle_egreso_producto(id_producto, id_almacen);

-- Producción
CREATE INDEX ix_ordprod_receta           ON orden_produccion(id_receta);
CREATE INDEX ix_ordprod_empleado         ON orden_produccion(id_empleado);

-- Ventas y pedidos
CREATE INDEX ix_venta_cliente            ON venta(id_cliente);
CREATE INDEX ix_venta_empleado           ON venta(id_empleado);
CREATE INDEX ix_detventa_stock           ON detalle_venta(id_producto, id_almacen);
CREATE INDEX ix_pedido_cliente           ON pedido(id_cliente);
CREATE INDEX ix_pedido_ubicacion         ON pedido(id_ubicacion);
-- Las direcciones que se le ofrecen al cliente al pedir.
CREATE INDEX ix_ubicacion_cliente        ON ubicacion(id_cliente) WHERE vigente;
CREATE INDEX ix_pedido_repartidor        ON pedido(id_repartidor);
CREATE INDEX ix_detpedido_stock          ON detalle_pedido(id_producto, id_almacen);

-- Campos de búsqueda y filtrado más frecuentes
CREATE INDEX ix_producto_nombre          ON producto(lower(nombre));
CREATE INDEX ix_ingrediente_nombre       ON ingrediente(lower(nombre));
CREATE INDEX ix_pedido_estado            ON pedido(estado_pedido);
CREATE INDEX ix_pedido_fecha             ON pedido(fecha DESC);
CREATE INDEX ix_venta_fecha              ON venta(fecha DESC);
CREATE INDEX ix_ordprod_estado           ON orden_produccion(estado);
-- Hallazgo H7: los listados se ordenan y filtran por fecha. Sin estos indices
-- cada pagina recorre la tabla entera y la ordena, que es justo el costo que
-- la paginacion vino a evitar.
CREATE INDEX ix_ordprod_fecha           ON orden_produccion(fecha DESC);
CREATE INDEX ix_notaing_fecha           ON nota_ingreso(fecha DESC);
CREATE INDEX ix_notaegr_fecha           ON nota_egreso(fecha DESC);
CREATE INDEX ix_visita_fecha             ON visita(fecha DESC);

-- Lotes: la consulta clave es "que vence primero" dentro de un almacen
CREATE INDEX ix_lote_ingrediente          ON lote(id_ingrediente);
CREATE INDEX ix_lote_vencimiento          ON lote(fecha_vencimiento);
CREATE INDEX ix_lotealm_almacen           ON lote_almacen(id_almacen);

-- Un solo almacen preferido por tipo de conservacion: si hubiera dos, la
-- ambiguedad que la preferencia viene a resolver volveria por otro lado.
CREATE UNIQUE INDEX ux_almacen_preferido  ON almacen(tipo_conservacion)
    WHERE preferido;

-- Cobros
CREATE INDEX ix_pago_venta                ON pago(id_venta);
CREATE INDEX ix_pago_pedido               ON pago(id_pedido);
CREATE INDEX ix_pago_estado               ON pago(estado);
CREATE INDEX ix_pago_fecha                ON pago(fecha_creacion DESC);
CREATE INDEX ix_evento_pago               ON evento_pago(id_pago);
CREATE INDEX ix_config_usuario            ON configuracion(id_usuario);

-- Idempotencia: una pasarela reintenta sus avisos, y sin esta unica el
-- mismo cobro podria confirmarse varias veces.
CREATE UNIQUE INDEX ux_pago_transaccion_ext ON pago(pasarela, id_transaccion_ext)
    WHERE id_transaccion_ext IS NOT NULL;
