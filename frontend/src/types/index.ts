/** Contratos que devuelve la API. Espejo de los DTO del backend. */

export interface UsuarioSesion {
  id: number;
  nombre: string;
  apellido: string;
  nombreUsuario: string;
  email: string;
  rol: string;
  /**
   * Cargo del empleado; nulo para un cliente. Opcional porque una sesión
   * guardada antes de que existiera no lo trae: en ese caso se decide solo
   * por permisos, como antes.
   */
  cargo?: string | null;
}

export interface Sesion {
  token: string;
  usuario: UsuarioSesion;
  permisos: string[];
}

export interface UsuarioLista {
  id: number;
  nombreCompleto: string;
  nombreUsuario: string;
  email: string;
  rol: string;
  activo: boolean;
  bloqueado: boolean;
}

/** Cuántas cuentas hay en cada estado; los tres suman el total. */
export interface ResumenUsuarios {
  total: number;
  activos: number;
  bloqueados: number;
  bajas: number;
}

export interface UsuarioDetalle extends UsuarioLista {
  nombre: string;
  apellido: string;
  telefono: string | null;
  fechaRegistro: string;
  intentosFallidos: number;
  cargo: string | null;
  fechaIngreso: string | null;
  preferenciaAlimentaria: string | null;
  restriccionDietetica: string | null;
}

export interface Cargo {
  id: number;
  nombre: string;
  salarioBase: number;
}

export interface Permiso {
  id: number;
  nombre: string;
}

export interface Rol {
  id: number;
  nombre: string;
  permisos: Permiso[];
  cantidadUsuarios: number;
}

export interface PermisoUsuario {
  idRolPermiso: number;
  permiso: string;
  habilitado: boolean;
}

/* ------------------------------------------------------------------ */
/* Etapa 1 — CU-PED-02, tablero del personal                           */
/* ------------------------------------------------------------------ */

export type EstadoPedido =
  /** Reserva el stock mientras se espera la confirmación del cobro. */
  | 'Pendiente de pago'
  | 'Recibido'
  | 'En preparacion'
  | 'En camino'
  | 'Entregado'
  | 'Cancelado';

export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'QR';

/** Por qué terminó cancelado un pedido. Espejo de `MOTIVOS_CANCELACION`. */
export type MotivoCancelacion = 'Cliente' | 'No entregado' | 'Sin pago';

export interface LineaPedido {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/**
 * Dirección guardada del cliente (CU-PED-03).
 *
 * `vigente` es falso cuando fue reemplazada por una versión corregida: deja de
 * ofrecerse al pedir, pero los pedidos que la usaron la conservan.
 */
export interface Direccion {
  id: number;
  etiqueta: string | null;
  calle: string;
  numero: string | null;
  referencia: string;
  latitud: number | null;
  longitud: number | null;
  vigente: boolean;
}

/**
 * Destino de un pedido: una dirección guardada o una escrita en el momento.
 *
 * Con `etiqueta` la dirección escrita queda guardada para la próxima vez; sin
 * ella sirve solo para este pedido.
 */
export type DestinoPedido =
  | { idUbicacion: number }
  | {
      calle: string;
      numero?: string | null;
      referencia: string;
      latitud?: number | null;
      longitud?: number | null;
      etiqueta?: string | null;
    };

export interface UbicacionEntrega {
  calle: string;
  numero: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
}

/** Quien lleva el pedido. Ya fue elegido: no es un candidato. */
/** Turno declarado del empleado (RF-PED-07). */
export interface Disponibilidad {
  disponible: boolean;
}

export interface Repartidor {
  id: number;
  nombreCompleto: string;
}

/** Candidato a llevar un pedido, con lo que hace falta para elegir (RF-PED-07). */
export interface CandidatoRepartidor {
  id: number;
  nombreCompleto: string;
  telefono: string | null;
  /** De turno o de franco. Solo se sugiere a quien está de turno. */
  disponible: boolean;
  /** Pedidos en preparación o en camino que ya tiene a su nombre. */
  entregasEnCurso: number;
}

/**
 * Lo que el sistema propone. **Sugiere, no asigna**: la decisión sigue siendo
 * de quien gestiona, que puede saber algo que el sistema no.
 */
export interface SugerenciaRepartidor {
  /** Nulo cuando no hay nadie de turno. No es un error. */
  sugerido: CandidatoRepartidor | null;
  motivo: string;
  candidatos: CandidatoRepartidor[];
}

export interface PedidoGestion {
  id: number;
  fecha: string;
  estadoPedido: EstadoPedido;
  estadoPago: string;
  metodoPago: MetodoPago;
  total: number;
  fechaEntrega: string | null;
  cancelable: boolean;
  /** Solo en los cancelados; nulo en los que se cancelaron antes de guardarlo. */
  motivoCancelacion: MotivoCancelacion | null;
  referenciaPago: string | null;
  ubicacion: UbicacionEntrega;
  items: LineaPedido[];
  cliente: { id: number; nombreCompleto: string; telefono: string | null };
  repartidor: Repartidor | null;
  transicionesPosibles: EstadoPedido[];
}

/* ------------------------------------------------------------------ */
/* Etapa 2 — CU-INV-01 y CU-INV-02                                     */
/* ------------------------------------------------------------------ */

export type TipoConservacion = 'Seco' | 'Refrigerado';

export interface Almacen {
  id: number;
  nombre: string;
  tipoConservacion: TipoConservacion;
  ubicacionFisica: string | null;
  /**
   * Destino por omisión de lo que se produce con esta conservación.
   * Devuelve la deducción automática cuando hay más de un almacén compatible.
   */
  preferido: boolean;
}

export interface UnidadMedida {
  id: number;
  nombre: string;
  abreviatura: string;
}

export interface Existencia {
  idAlmacen: number;
  almacen: string;
  stock: number;
}

export interface Insumo {
  id: number;
  nombre: string;
  unidad: UnidadMedida;
  costoUnitario: number;
  stockMinimo: number;
  activo: boolean;
  tipoConservacion: TipoConservacion;
  /** Los perecederos exigen lote y vencimiento en cada ingreso (hallazgo A6). */
  controlaVencimiento: boolean;
  stockTotal: number;
  existencias: Existencia[];
}

/* ------------------------------------------------------------------ */
/* Etapa 3 — CU-PRO-01 y CU-PRO-03                                     */
/* ------------------------------------------------------------------ */

export interface Categoria {
  id: number;
  nombre: string;
}

export interface ValorNutricional {
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  fibra: number | null;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  tipoConservacion: TipoConservacion;
  categoria: Categoria;
  valorNutricional: ValorNutricional | null;
  stockTotal: number;
  existencias: Existencia[];
  /** Promedio ponderado deducido de las notas de ingreso. Nulo si nunca ingresó. */
  costoPromedio: number | null;
  /** Verdadero cuando el precio de venta no cubre ese costo. */
  vendeBajoCosto: boolean;
  /** `null` sin foto; si no, la fecha con la que se arma la URL de la imagen. */
  imagenActualizadaEn: string | null;
}

export interface LineaReceta {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  insumoActivo: boolean;
}

export interface Receta {
  id: number;
  nombre: string;
  producto: { id: number; nombre: string };
  rendimiento: number;
  tiempoPreparacionMinutos: number;
  instrucciones: string | null;
  activa: boolean;
  /**
   * Una bebida escala de forma continua; una bandeja de horno no. Si no es
   * divisible, producir 3 de una receta que rinde 4 hornea 4 y deja 1 en stock.
   */
  divisible: boolean;
  insumos: LineaReceta[];
}

/* ------------------------------------------------------------------ */
/* Etapa 4 — CU-INV-03, CU-INV-04 y CU-INV-05                          */
/* ------------------------------------------------------------------ */

export type MotivoIngreso = 'Compra' | 'Produccion' | 'Ajuste' | 'Devolucion';
export type MotivoEgreso = 'Produccion' | 'Merma' | 'Ajuste';
export type TipoItem = 'insumo' | 'producto';

export interface LineaMovimiento {
  tipo: TipoItem;
  id: number;
  nombre: string;
  unidad: string;
  idAlmacen: number;
  almacen: string;
  cantidad: number;
  costoUnitario: number | null;
  subtotal: number | null;
}

interface NotaBase {
  id: number;
  fecha: string;
  registradoPor: { id: number; nombreCompleto: string };
  lineas: LineaMovimiento[];
}

export interface NotaIngreso extends NotaBase {
  motivo: MotivoIngreso;
  proveedor: string | null;
  numeroDocumento: string | null;
  total: number;
}

export interface NotaEgreso extends NotaBase {
  motivo: MotivoEgreso;
  observacion: string | null;
}

export interface AlertaStock {
  id: number;
  nombre: string;
  unidad: string;
  stockTotal: number;
  stockMinimo: number;
}

export interface ResultadoEgreso {
  nota: NotaEgreso;
  alertas: AlertaStock[];
}

export interface ExistenciaStock {
  tipo: TipoItem;
  id: number;
  nombre: string;
  unidad: string;
  /** Lo que hay en el almacén consultado; sin filtro, en todos. */
  stockTotal: number;
  /** Lo que hay sumando todos los almacenes: contra esto se decide la reposición. */
  stockGeneral: number;
  /** Solo los insumos declaran stock mínimo en el esquema. */
  stockMinimo: number | null;
  bajoMinimo: boolean;
  /** Solo las del almacén consultado; sin filtro, todas. */
  existencias: Existencia[];
}

/* ------------------------------------------------------------------ */
/* Etapa 5 — CU-PRO-02 y CU-PRO-04                                     */
/* ------------------------------------------------------------------ */

export type EstadoOrden = 'Pendiente' | 'En proceso' | 'Finalizada' | 'Cancelada';

export interface InsumoRequerido {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  costoUnitario: number;
}

export interface OrdenProduccion {
  id: number;
  fecha: string;
  estado: EstadoOrden;
  cantidad: number;
  fechaFinalizacion: string | null;
  transicionesPosibles: EstadoOrden[];
  cancelable: boolean;
  receta: { id: number; nombre: string; rendimiento: number };
  producto: { id: number; nombre: string; tipoConservacion: TipoConservacion };
  registradoPor: { id: number; nombreCompleto: string };
  /**
   * Los insumos de la corrida.
   *
   * Antes de finalizar son una **previsión** calculada desde la receta
   * vigente; después son el **hecho** que registró la nota de egreso. Editar
   * la receta ya no reescribe el historial (hallazgo H6).
   */
  insumosRequeridos: InsumoRequerido[];
  /** Previsión antes de ejecutar; el costo real de la corrida después. */
  costoEstimado: number;
  /** Cuántas salieron de verdad. Nulo mientras la orden no se finaliza (H10). */
  cantidadObtenida: number | null;
  /** Planificado menos obtenido, cuando salió de menos. */
  merma: number | null;
  /** El costo repartido entre lo obtenido, no entre lo planificado. */
  costoUnitario: number | null;
  /** A qué almacén fue el producto terminado (hallazgo H4). */
  almacenDestino: { id: number; nombre: string } | null;
  notas: { egreso: number | null; ingreso: number | null };
}

/* ------------------------------------------------------------------ */
/* Etapa 6 — CU-VEN-01 y CU-VEN-02                                     */
/* ------------------------------------------------------------------ */

export type TipoVenta = 'Mesa' | 'Llevar';

export interface LineaVenta {
  idProducto: number;
  nombre: string;
  almacen: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Venta {
  id: number;
  fecha: string;
  tipoVenta: TipoVenta;
  metodoPago: MetodoPago;
  /** Pendiente mientras el cobro en línea no se haya confirmado. */
  estadoPago: 'Pendiente' | 'Pagado' | 'Anulado';
  total: number;
  cliente: { id: number; nombreCompleto: string } | null;
  atendidoPor: { id: number; nombreCompleto: string };
  items: LineaVenta[];
  cobro?: Pago | null;
}

export interface AnulacionVenta {
  venta: Venta;
  /** Verdadero cuando la venta estaba cobrada y hay dinero que devolver. */
  requiereDevolucion: boolean;
  aviso?: string;
}

export interface Comprobante {
  numero: string;
  fecha: string;
  tipoVenta: TipoVenta;
  metodoPago: MetodoPago;
  cliente: string;
  atendidoPor: string;
  detalle: LineaVenta[];
  cantidadItems: number;
  total: number;
}

/* --- Cobros (RF-PED-04) --- */

export type ModoCobro = 'Simulado' | 'Real';

export type EstadoPago = 'Pendiente' | 'Pagado' | 'Fallido' | 'Vencido' | 'Reembolsado';

export interface Pago {
  id: number;
  monto: number;
  moneda: string;
  metodo: MetodoPago;
  estado: EstadoPago;
  modo: ModoCobro;
  pasarela: string;
  referenciaExterna: string | null;
  /** Contenido del QR o dirección del checkout. */
  datosCobro: string | null;
  tipoDatos: 'qr' | 'url' | null;
  /** El código ya dibujado, listo para usar como `src` de una imagen. */
  qrImagen?: string;
  expiraEn: string | null;
  confirmadoEn: string | null;
  idVenta: number | null;
  idPedido: number | null;
  /** Verdadero cuando no se movió dinero real. */
  simulado: boolean;
}

export interface EstadoCobro {
  modo: ModoCobro;
  /** Pasarela en uso ahora. En modo simulado es «Simulada». */
  pasarela: string;
  /** Pasarela que se usaría al activar el dinero real. */
  pasarelaReal: string;
  /** Falso cuando el modo es Real pero la pasarela no puede operar todavía. */
  operativa: boolean;
  advertencia?: string;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
  pasarelasDisponibles: string[];
}

/* --- Producción al instante (extensión de CU-VEN-01) --- */

export interface InsumoAConsumir {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  costoUnitario: number;
}

export interface InsumoFaltante {
  nombre: string;
  unidad: string;
  requerido: number;
  disponible: number;
}

export interface LineaEvaluacion {
  idProducto: number;
  nombre: string;
  solicitado: number;
  enStock: number;
  faltante: number;
  requiereProduccion: boolean;
  producible: boolean;
  motivo?: string;
  cantidadAProducir: number;
  excedente: number;
  insumos: InsumoAConsumir[];
  costoProduccion: number;
  almacenesCompatibles: { id: number; nombre: string }[];
  requiereElegirAlmacen: boolean;
  /** Insumos que no alcanzan para esta línea por sí sola. */
  insumosFaltantes: InsumoFaltante[];
}

export interface EvaluacionVenta {
  lineas: LineaEvaluacion[];
  requiereProduccion: boolean;
  puedeVenderse: boolean;
  /**
   * Insumos que no alcanzan para el conjunto. No es la suma de los faltantes
   * de cada línea: dos productos pueden compartir un insumo y ser producibles
   * por separado pero no juntos.
   */
  insumosFaltantes: InsumoFaltante[];
}

export interface ProduccionRealizada {
  idOrden: number;
  idProducto: number;
  cantidadProducida: number;
  excedente: number;
  costoUnitario: number;
}

export interface VentaConProduccion {
  venta: Venta;
  producciones: ProduccionRealizada[];
}

/* --- Cuenta propia (autoservicio) --- */

export interface DatosLaborales {
  cargo: string;
  fechaIngreso: string;
}

export interface Preferencias {
  preferenciaAlimentaria: string | null;
  restriccionDietetica: string | null;
}

/**
 * Perfil del usuario autenticado, sea empleado o cliente.
 *
 * `laboral` y `preferencias` son excluyentes: llega uno u otro en nulo según
 * el tipo de cuenta, de modo que la interfaz recibe siempre la misma forma.
 */
export interface Perfil {
  id: number;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  /** Inmutable: identidad de inicio de sesión y firma del historial. */
  nombreUsuario: string;
  /** Inmutable para el titular: lo asigna un administrador. */
  rol: string;
  fechaRegistro: string;
  ultimoAcceso: string | null;
  laboral: DatosLaborales | null;
  preferencias: Preferencias | null;
}

/* --- Reportes (RF-VEN-07) --- */

export interface LineaProductoReporte {
  idProducto: number;
  nombre: string;
  unidades: number;
  importe: number;
  /** Porcentaje del importe total: responde "qué se vende". */
  participacion: number;
}

export interface ResumenReporte {
  cantidadVentas: number;
  unidades: number;
  total: number;
  /** Promedio por venta. Dice más del negocio que el total solo. */
  ticketPromedio: number;
}

export interface ReporteVentas {
  desde: string;
  hasta: string;
  /** Nulo cuando el reporte abarca todos los productos. */
  producto: string | null;
  generadoEn: string;
  resumen: ResumenReporte;
  porProducto: LineaProductoReporte[];
  porMetodoPago: { metodo: string; cantidadVentas: number; total: number }[];
  porDia: { dia: string; cantidadVentas: number; total: number }[];
}

/* --- Paginación de los listados (hallazgo H7) --- */

/**
 * Una página de resultados.
 *
 * Es el contrato de **todos** los listados que crecen sin techo: ventas,
 * pedidos, movimientos, órdenes, clientes y usuarios. Uno solo, para que cada
 * pantalla no tenga que aprender un formato distinto.
 */
export interface Pagina<T> {
  datos: T[];
  pagina: number;
  porPagina: number;
  /** Cuántos hay en total con los filtros aplicados, no cuántos vinieron. */
  total: number;
  paginas: number;
}

/* --- Información del negocio (RF-PED-03) --- */

export interface Negocio {
  nombre: string;
  lema: string;
  descripcion: string;
  horario: string;
  telefono: string;
  whatsapp: string;
  correo: string;
  direccion: string;
  /** Hasta dónde se entrega. Se publica; no se valida contra la dirección. */
  cobertura: string;
  ubicacion: { latitud: number; longitud: number };
  /** Nulo mientras nadie haya editado la información. */
  actualizadoEn: string | null;
}

/** Un resultado del buscador del encabezado: producto o dato del negocio. */
export interface ResultadoBusqueda {
  tipo: 'producto' | 'informacion';
  titulo: string;
  detalle: string;
  idProducto: number | null;
}

export interface BusquedaSitio {
  termino: string;
  resultados: ResultadoBusqueda[];
}

/* --- Reportes de operaciones (RF-PED-10, RF-PRO-08, RF-INV-08) --- */

export interface ReportePedidos {
  desde: string;
  hasta: string;
  /** Nulos cuando el reporte no filtra por ese criterio. */
  estado: string | null;
  repartidor: string | null;
  generadoEn: string;
  resumen: {
    cantidadPedidos: number;
    entregados: number;
    cancelados: number;
    total: number;
    /** Promedio de los entregados. Nulo si ninguno llegó todavía. */
    minutosPromedio: number | null;
  };
  porEstado: { estado: string; cantidad: number; total: number }[];
  porRepartidor: {
    repartidor: string;
    /** Todos los que tuvo asignados, se hayan entregado o no. */
    asignados: number;
    /** Solo los que llegó a entregar. */
    entregas: number;
    minutosPromedio: number | null;
  }[];
  pedidos: {
    id: number;
    fecha: string;
    estado: string;
    metodoPago: string;
    total: number;
    repartidor: string | null;
    minutosDeEntrega: number | null;
  }[];
}

export interface ReporteProduccion {
  desde: string;
  hasta: string;
  producto: string | null;
  generadoEn: string;
  resumen: {
    corridas: number;
    /** Unidades obtenidas, no planificadas. */
    unidades: number;
    /** Unidades perdidas en el período (hallazgo H10). */
    merma: number;
    costoTotal: number;
    costoUnitarioPromedio: number;
  };
  porProducto: { producto: string; corridas: number; unidades: number; costo: number }[];
  insumosConsumidos: { insumo: string; unidad: string; cantidad: number; costo: number }[];
  corridas: {
    idOrden: number;
    fecha: string;
    producto: string;
    receta: string;
    /** Lo obtenido, que es lo que de verdad entró al almacén. */
    cantidad: number;
    /** Planificado menos obtenido, cuando salió de menos. */
    merma: number;
    /** Verdadero si se produjo al instante para una venta de mostrador. */
    instantanea: boolean;
    costo: number;
    costoUnitario: number;
  }[];
}

export interface ReporteInventario {
  desde: string;
  hasta: string;
  /** Texto del filtro aplicado, para encabezar el reporte. */
  filtro: string | null;
  generadoEn: string;
  /** Cantidad de líneas de entrada y de salida, no de mercadería. */
  resumen: { ingresos: number; egresos: number; costoIngresado: number };
  porItem: {
    tipo: TipoItemReporte;
    item: string;
    unidad: string;
    entradas: number;
    salidas: number;
    /**
     * Entradas menos salidas **en el período**. No es la existencia: negativo
     * dice que salió más de lo que entró, no que el stock sea negativo.
     */
    neto: number;
    /** Lo que hay hoy en todos los almacenes. */
    existencia: number;
  }[];
  movimientos: {
    fecha: string;
    tipo: 'Ingreso' | 'Egreso';
    motivo: string;
    tipoItem: TipoItemReporte;
    item: string;
    unidad: string;
    cantidad: number;
    /** Nulo en los egresos: una salida no tiene costo propio. */
    costo: number | null;
    /** Proveedor y documento, u orden de producción y lo que se elaboró. */
    referencia: string | null;
  }[];
}

export type TipoItemReporte = 'Insumo' | 'Producto';

export interface Cliente {
  id: number;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  nombreUsuario: string;
  activo: boolean;
  fechaRegistro: string;
  preferenciaAlimentaria: string | null;
  restriccionDietetica: string | null;
  cantidadPedidos: number;
  cantidadVentas: number;
}

/* ------------------------------------------------------------------ */
/* Portal del cliente — CU-PED-01 a CU-PED-05                          */
/* ------------------------------------------------------------------ */

export interface ProductoCatalogo {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: Categoria;
  stockDisponible: number;
  disponible: boolean;
  valorNutricional: ValorNutricional | null;
  /** `null` sin foto; si no, la fecha con la que se arma la URL de la imagen. */
  imagenActualizadaEn: string | null;
}

export interface PedidoCliente {
  id: number;
  fecha: string;
  estadoPedido: EstadoPedido;
  estadoPago: string;
  metodoPago: MetodoPago;
  total: number;
  fechaEntrega: string | null;
  cancelable: boolean;
  /** Solo en los cancelados; nulo en los que se cancelaron antes de guardarlo. */
  motivoCancelacion: MotivoCancelacion | null;
  referenciaPago: string | null;
  cobro?: Pago | null;
  ubicacion: UbicacionEntrega;
  items: LineaPedido[];
}

/** Lote con existencias y su proximidad de vencimiento (hallazgo A6). */
export interface LoteVigente {
  idLote: number;
  codigo: string | null;
  insumo: string;
  unidad: string;
  idAlmacen: number;
  almacen: string;
  stock: number;
  fechaVencimiento: string;
  /** Días que faltan; negativo si el lote ya está vencido. */
  diasParaVencer: number;
  vencido: boolean;
}

/* ------------------------------------------------------------------ */
/* Buscador general del personal                                        */
/* ------------------------------------------------------------------ */

export type TipoResultado =
  | 'pedido'
  | 'venta'
  | 'orden'
  | 'cliente'
  | 'producto'
  | 'insumo'
  | 'almacen'
  | 'usuario';

export interface ResultadoGeneral {
  tipo: TipoResultado;
  id: number;
  titulo: string;
  /** Una línea de contexto: el cliente, la categoría, el rol, la existencia… */
  detalle: string;
  /** Estado del pedido, de la venta o de la orden, tal como lo guarda la base. */
  estado: string | null;
  monto: number | null;
  /** ISO 8601. */
  fecha: string | null;
  /** Lo que lo distingue en su pantalla (usuario, correo, nombre), para abrirla filtrada. */
  referencia: string | null;
}

export interface BusquedaGeneral {
  termino: string;
  resultados: ResultadoGeneral[];
}

/* ------------------------------------------------------------------ */
/* Seguimiento del repartidor en vivo                                   */
/* ------------------------------------------------------------------ */

export interface PosicionRepartidor {
  latitud: number;
  longitud: number;
  /** Radio de incertidumbre en metros, según el teléfono. */
  precision: number | null;
  actualizadaEn: string;
  /** Segundos desde el último envío, medidos por el servidor. */
  antiguedadSegundos: number;
}

export interface SeguimientoPedido {
  /** El pedido está en camino: hay algo que seguir. */
  enCamino: boolean;
  /** Nombre de pila de quien lo lleva. */
  repartidor: string | null;
  /** Última posición conocida; `null` si todavía no compartió ninguna. */
  posicion: PosicionRepartidor | null;
}
