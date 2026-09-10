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

CREATE INDEX IF NOT EXISTS ix_pago_venta   ON pago(id_venta);
CREATE INDEX IF NOT EXISTS ix_pago_pedido  ON pago(id_pedido);
CREATE INDEX IF NOT EXISTS ix_pago_estado  ON pago(estado);
CREATE INDEX IF NOT EXISTS ix_pago_fecha   ON pago(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS ix_evento_pago  ON evento_pago(id_pago);
CREATE INDEX IF NOT EXISTS ix_config_usuario ON configuracion(id_usuario);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pago_transaccion_ext ON pago(pasarela, id_transaccion_ext)
    WHERE id_transaccion_ext IS NOT NULL;

ALTER TABLE venta ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) NOT NULL DEFAULT 'Pagado';
ALTER TABLE venta DROP CONSTRAINT IF EXISTS ck_venta_estado_pago;
ALTER TABLE venta ADD CONSTRAINT ck_venta_estado_pago
    CHECK (estado_pago IN ('Pendiente','Pagado','Anulado'));

ALTER TABLE pedido DROP CONSTRAINT IF EXISTS ck_pedido_estado;
ALTER TABLE pedido ADD CONSTRAINT ck_pedido_estado
    CHECK (estado_pedido IN ('Pendiente de pago','Recibido','En preparacion','En camino','Entregado','Cancelado'));

ALTER TABLE pedido DROP CONSTRAINT IF EXISTS ck_pedido_pago;
ALTER TABLE pedido ADD CONSTRAINT ck_pedido_pago
    CHECK (estado_pago IN ('Pendiente','Pagado','Vencido'));
