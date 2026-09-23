import QRCode from 'qrcode';
import { prisma } from '../config/prisma.js';
import * as pagoModel from '../models/pago.model.js';
import * as ventaModel from '../models/venta.model.js';
import * as pedidoModel from '../models/pedido.model.js';
import * as repartoService from './reparto.service.js';
import type { PagoConsultado } from '../models/pago.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { reponerAsignaciones } from './stock.service.js';
import { modoCobro } from './configuracion.service.js';
import { exigirEmpleado } from './actor.service.js';
import { pasarelaPara } from '../pagos/index.js';
import {
  esPagoFinal,
  requiereCobroEnLinea,
  type EstadoPago,
  type MetodoPago,
  type ModoCobro,
} from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * RF-PED-04 — Cobro de ventas y pedidos.
 *
 * Este servicio es el **único** lugar donde un cobro cambia de estado, y de él
 * dependen la venta y el pedido, nunca al revés. Por eso importa
 * `pedidoModel` y no `pedido.service`: la regla de dependencia del proyecto
 * (routes → controllers → services → models) prohíbe que dos servicios se
 * llamen en círculo, y `pedido.service` sí necesita llamar a este.
 *
 * Todo el diseño gira sobre dos ideas:
 *
 * 1. **Idempotencia.** Las pasarelas reintentan sus avisos. Confirmar dos
 *    veces el mismo cobro marcaría un pedido como pagado dos veces. El cierre
 *    ocurre con un `UPDATE ... WHERE estado = 'Pendiente'`, de modo que el
 *    segundo aviso no encuentra nada que cambiar.
 * 2. **No confiar en que el aviso llegue.** Los avisos se pierden. Por eso la
 *    consulta de un cobro pendiente le pregunta a la pasarela en lugar de
 *    esperar sentada.
 */

const MONEDA = 'BOB';

/** Diferencia tolerada al contrastar el monto de la pasarela con el nuestro. */
const TOLERANCIA_MONTO = 0.01;

export interface PagoDTO {
  id: number;
  monto: number;
  moneda: string;
  metodo: MetodoPago;
  estado: EstadoPago;
  modo: ModoCobro;
  pasarela: string;
  /** Identificador del lado de la pasarela: es lo que se cita en un reclamo. */
  referenciaExterna: string | null;
  /** Contenido del QR o dirección del checkout. Nulo mientras no se haya abierto. */
  datosCobro: string | null;
  tipoDatos: 'qr' | 'url' | null;
  /**
   * El código ya dibujado, listo para `<img src>`.
   *
   * Se genera en el servidor y no en el navegador porque una pasarela real
   * puede devolver la imagen ya hecha o el texto a codificar, y esa diferencia
   * no debe llegar hasta la interfaz.
   */
  qrImagen?: string;
  expiraEn: string | null;
  confirmadoEn: string | null;
  idVenta: number | null;
  idPedido: number | null;
  /**
   * Por qué falló, cuando falló.
   *
   * Sin esto, «El cobro no se completó» obliga a mirar los registros del
   * servidor para saber si fue la pasarela, la red o una variable sin
   * configurar —y eso no está al alcance de quien atiende el mostrador—.
   */
  motivo?: string | null;
  /** Atajo para que la interfaz avise, sin ambigüedad, que no se movió dinero. */
  simulado: boolean;
}

/** Respaldo para los cobros abiertos antes de que se guardara el tipo. */
function tipoSegunElContenido(datos: string | null): 'qr' | 'url' | null {
  if (datos === null) return null;
  return datos.startsWith('http') ? 'url' : 'qr';
}

function aDTO(pago: PagoConsultado): PagoDTO {
  const datos = pago.datos_cobro;
  return {
    id: pago.id_pago,
    monto: Number(pago.monto),
    moneda: pago.moneda,
    metodo: pago.metodo as MetodoPago,
    estado: pago.estado as EstadoPago,
    modo: pago.modo as ModoCobro,
    pasarela: pago.pasarela,
    referenciaExterna: pago.id_transaccion_ext,
    datosCobro: datos,
    /*
     * Lo dice la pasarela al abrir el cobro y aquí solo se repite.
     *
     * Antes se deducía de la forma del contenido —«¿empieza por http?»— y esa
     * suposición no se sostiene: la pasarela simulada devuelve siempre el
     * mismo texto con tuberías, así que un cobro con Tarjeta, que nace como
     * `url`, terminaba dibujado como QR. El respaldo solo cubre los cobros
     * anteriores a que la columna existiera.
     */
    tipoDatos: (pago.tipo_datos as 'qr' | 'url' | null) ?? tipoSegunElContenido(datos),
    expiraEn: pago.fecha_expiracion?.toISOString() ?? null,
    confirmadoEn: pago.fecha_confirmacion?.toISOString() ?? null,
    idVenta: pago.id_venta,
    idPedido: pago.id_pedido,
    simulado: pago.modo === 'Simulado',
    // Solo cuando falló: en un cobro que salió bien, el último evento es la
    // confirmación y repetirla como «motivo» confundiría.
    motivo:
      pago.estado === 'Fallido' ? (pago.evento_pago[0]?.cuerpo ?? null) : null,
  };
}

/** Añade el código dibujado, cuando lo hay. */
/**
 * Expuesto solo para las pruebas.
 *
 * La distinción entre «texto a codificar» y «código ya dibujado» es donde se
 * escondió un fallo silencioso, y probarla a través de una venta completa
 * exigiría una pasarela que devuelva imágenes.
 */
export const conQRParaPruebas = (dto: Partial<PagoDTO>) => conQR(dto as PagoDTO);

async function conQR(dto: PagoDTO): Promise<PagoDTO> {
  if (dto.tipoDatos !== 'qr' || !dto.datosCobro) return dto;

  /*
   * Una pasarela puede devolver dos cosas distintas y ambas llegan por
   * `datosCobro`: el **texto** a codificar —la simulada— o el **código ya
   * dibujado** —Libélula, en `qr_simple_base64`—.
   *
   * Distinguirlas importa: intentar codificar una imagen de diez mil
   * caracteres excede de largo la capacidad de un QR (unos 4.300), la
   * librería lanza, el `catch` se lo traga y la pantalla se queda esperando
   * un código que nunca llega.
   */
  if (dto.datosCobro.startsWith('data:image/')) {
    dto.qrImagen = dto.datosCobro;
    return dto;
  }

  try {
    dto.qrImagen = await QRCode.toDataURL(dto.datosCobro, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
    });
  } catch {
    // Sin imagen la interfaz muestra el texto: es peor, pero no bloquea el cobro.
  }
  return dto;
}

async function exigirPago(id: number): Promise<PagoConsultado> {
  const pago = await pagoModel.buscarPorId(id);
  if (!pago) throw new ErrorApp(404, 'El cobro no existe');
  return pago;
}

/* ------------------------------------------------------------------ */
/* Alta del cobro                                                      */
/* ------------------------------------------------------------------ */

/**
 * Registra el cobro dentro de la transacción que crea la venta o el pedido.
 *
 * Deliberadamente **no** habla con la pasarela: una llamada HTTP dentro de una
 * transacción mantendría abierta la conexión de base de datos durante segundos
 * y, si la pasarela tarda, bloquearía el stock de toda la venta. La pasarela
 * se contacta después de confirmar, en `abrirCobro`.
 *
 * El efectivo no pasa por pasarela: nace pagado, porque el dinero ya está en
 * el mostrador. Aun así se registra, para que `pago` sea la única respuesta a
 * "cuánto entró hoy y por qué medio".
 */
export async function registrarCobroEnTransaccion(
  tx: ClientePrisma,
  datos: {
    monto: number;
    metodo: MetodoPago;
    modo: ModoCobro;
    idVenta?: number;
    idPedido?: number;
  },
): Promise<number> {
  const enLinea = requiereCobroEnLinea(datos.metodo);
  const pasarela = enLinea ? pasarelaPara(datos.modo).nombre : 'Mostrador';

  /**
   * El efectivo de una venta ya está cobrado; el de un pedido, no.
   *
   * En el mostrador «no es en línea» significa *el cliente acaba de pagar, lo
   * tengo delante*. En un pedido a domicilio significa *me van a pagar en la
   * puerta*, que puede no ocurrir nunca. Tratarlos igual hacía que el cobro
   * naciera Pagado y el pedido dijera «Pago pendiente»: los dos registros se
   * contradecían desde el primer momento, y un pedido en efectivo que se
   * cancelaba quedaba contado como dinero recaudado.
   */
  const cobradoAlCrearse = !enLinea && datos.idPedido === undefined;

  const pago = await pagoModel.crear(tx, {
    monto: datos.monto,
    moneda: MONEDA,
    metodo: datos.metodo,
    estado: cobradoAlCrearse ? 'Pagado' : 'Pendiente',
    modo: datos.modo,
    pasarela,
    idVenta: datos.idVenta ?? null,
    idPedido: datos.idPedido ?? null,
    fechaConfirmacion: cobradoAlCrearse ? new Date() : null,
  });

  await pagoModel.registrarEvento(tx, {
    idPago: pago.id_pago,
    tipo: cobradoAlCrearse ? 'Cobrado en mostrador' : enLinea ? 'Creado' : 'A cobrar contra entrega',
    origen: 'Sistema',
    cuerpo: JSON.stringify({ monto: datos.monto, metodo: datos.metodo, modo: datos.modo }),
  });

  return pago.id_pago;
}

/**
 * Cierra el cobro de un pedido **dentro de la transacción que lo mueve**.
 *
 * El desenlace del cobro contra entrega y el del pedido son el mismo hecho: el
 * repartidor recibió la plata, o no entregó. Resolverlos en dos transacciones
 * dejaría la ventana en la que el pedido ya está entregado y el cobro todavía
 * pendiente, que es justo la contradicción que se quiso eliminar.
 *
 * No toca un cobro que ya tenga desenlace —el pedido pagado en línea llega
 * aquí con el suyo cerrado— ni un pedido sin cobro registrado.
 *
 * Al fallar **no** se marca el pedido como «Vencido»: nunca se cobró, así que
 * su pago sigue siendo «Pendiente» y lo que cuenta la historia es el estado
 * Cancelado del pedido.
 */
export async function cerrarCobroDePedidoEnTransaccion(
  tx: ClientePrisma,
  idPedido: number,
  estado: Extract<EstadoPago, 'Pagado' | 'Fallido'>,
  detalle: string,
): Promise<void> {
  const pago = await pagoModel.buscarDePedido(idPedido, tx);
  if (!pago || pago.estado !== 'Pendiente') return;

  const aplicado = await pagoModel.cerrarSiPendiente(
    tx,
    pago.id_pago,
    estado,
    estado === 'Pagado' ? new Date() : null,
  );
  if (!aplicado) return;

  await pagoModel.registrarEvento(tx, {
    idPago: pago.id_pago,
    tipo: `Cerrado: ${estado}`,
    origen: 'Empleado',
    cuerpo: detalle,
  });

  if (estado === 'Pagado') {
    await pedidoModel.marcarEstadoPago(tx, idPedido, 'Pagado');
  }
}

/**
 * Abre el cobro en la pasarela y devuelve lo que hay que mostrarle al cliente.
 *
 * Se llama **después** de que la transacción haya confirmado. Si la pasarela
 * falla, el cobro queda como Fallido y la venta o el pedido siguen existiendo
 * sin pagar: es un estado recuperable —se puede reintentar o anular— y es
 * preferible a perder el registro de que el intento existió.
 */
export async function abrirCobro(
  idPago: number,
  contexto: { descripcion: string; referenciaInterna: string; cliente?: { nombre: string; email?: string } },
): Promise<PagoDTO> {
  const pago = await exigirPago(idPago);

  if (pago.estado !== 'Pendiente') return conQR(aDTO(pago));
  if (pago.id_transaccion_ext) return conQR(aDTO(pago));

  const pasarela = pasarelaPara(pago.modo as ModoCobro);

  try {
    const cobro = await pasarela.crearCobro({
      monto: Number(pago.monto),
      moneda: pago.moneda,
      metodo: pago.metodo as MetodoPago,
      descripcion: contexto.descripcion,
      referenciaInterna: contexto.referenciaInterna,
      cliente: contexto.cliente,
    });

    const actualizado = await prisma.$transaction(async (tx: ClientePrisma) => {
      const fila = await pagoModel.registrarTransaccionExterna(
        idPago,
        {
          idTransaccionExterna: cobro.idTransaccionExterna,
          datosCobro: cobro.datosCobro,
          tipoDatos: cobro.tipoDatos,
          expiraEn: cobro.expiraEn,
        },
        tx,
      );
      await pagoModel.registrarEvento(tx, {
        idPago,
        tipo: 'Abierto en pasarela',
        origen: 'Sistema',
        cuerpo: JSON.stringify({ idTransaccion: cobro.idTransaccionExterna }),
      });
      return fila;
    });

    return conQR(aDTO(actualizado));
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'error desconocido';

    await prisma.$transaction(async (tx: ClientePrisma) => {
      await pagoModel.cerrarSiPendiente(tx, idPago, 'Fallido', null);
      await pagoModel.registrarEvento(tx, {
        idPago,
        tipo: 'Fallo al abrir',
        origen: 'Sistema',
        cuerpo: motivo,
      });
    });

    throw error instanceof ErrorApp
      ? error
      : new ErrorApp(502, `No se pudo abrir el cobro en la pasarela: ${motivo}`);
  }
}

/* ------------------------------------------------------------------ */
/* Consulta y desenlace                                                */
/* ------------------------------------------------------------------ */

/**
 * Devuelve el cobro, preguntando a la pasarela si todavía está pendiente.
 *
 * Es la red de seguridad del diseño: si el aviso de la pasarela nunca llegó
 * —se perdió, el servidor estaba caído, nunca se envió—, un cobro que solo
 * esperara quedaría pendiente para siempre. Aquí, cada vez que alguien mira el
 * cobro, el sistema pregunta.
 *
 * Es también el mecanismo por el que la pasarela simulada confirma: no hay
 * temporizadores que un reinicio pueda perder, solo una pregunta que se
 * responde según el tiempo transcurrido.
 */
export async function obtener(idPago: number): Promise<PagoDTO> {
  const pago = await exigirPago(idPago);
  if (pago.estado !== 'Pendiente') return conQR(aDTO(pago));

  /*
   * Se pregunta **antes** de mirar el plazo, y el orden no es un detalle.
   *
   * Nuestro plazo (PAGO_MINUTOS_EXPIRACION, 15 minutos) es mucho más corto que
   * el del QR que entrega la pasarela, que dura días. Con el vencimiento
   * primero, un cliente que pagaba pasado ese cuarto de hora veía su pedido
   * cancelado y el stock devuelto **con el dinero ya cobrado**. Preguntar
   * primero cuesta una llamada y evita repudiar un pago recibido.
   */
  const estado = await estadoSegunLaPasarela(pago);
  if (estado && estado !== 'Pendiente') {
    return aplicarResultado(idPago, estado, 'Pasarela', 'Consulta directa de estado');
  }

  if (pago.fecha_expiracion && pago.fecha_expiracion < new Date()) {
    return aplicarResultado(idPago, 'Vencido', 'Sistema', 'Expiró el plazo del cobro');
  }

  return conQR(aDTO(pago));
}

/**
 * Le pregunta a la pasarela en qué quedó el cobro.
 *
 * Devuelve `null` cuando no se pudo saber —la pasarela no respondió, el cobro
 * nunca llegó a abrirse, la respuesta no se entendió—, que es distinto de
 * «sigue pendiente»: quien llama no debe tomar el silencio por una respuesta.
 *
 * **El fallo se registra.** Antes se descartaba sin dejar rastro, y por eso una
 * consulta que fallaba en todas y cada una de las llamadas —el parámetro que
 * se le enviaba no era el que la pasarela espera— se veía en la pantalla como
 * un cobro que simplemente no terminaba de confirmarse. Un cobro que nunca se
 * resuelve y un error que nadie ve son el mismo síntoma; el registro es lo
 * único que los separa.
 */
async function estadoSegunLaPasarela(pago: PagoConsultado): Promise<EstadoPago | null> {
  if (!pago.id_transaccion_ext) return null;

  try {
    return await pasarelaPara(pago.modo as ModoCobro).consultarEstado(pago.id_transaccion_ext);
  } catch (error) {
    console.error(
      `[pagos] No se pudo consultar el cobro ${pago.id_pago} ` +
        `(transacción ${pago.id_transaccion_ext}) en ${pago.pasarela}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Cierra el cobro y arrastra la venta o el pedido al estado que corresponde.
 *
 * Idempotente por construcción: `cerrarSiPendiente` solo escribe si el cobro
 * seguía pendiente, de modo que un aviso repetido —o un aviso que se cruza con
 * la consulta directa— no aplica nada dos veces.
 */
export async function aplicarResultado(
  idPago: number,
  estado: EstadoPago,
  origen: 'Pasarela' | 'Sistema' | 'Empleado',
  detalle: string,
): Promise<PagoDTO> {
  if (!esPagoFinal(estado)) {
    throw new ErrorApp(400, `"${estado}" no es un desenlace válido para un cobro`);
  }

  let idPedidoResuelto: number | null = null;

  await prisma.$transaction(async (tx: ClientePrisma) => {
    const pago = await pagoModel.buscarPorId(idPago, tx);
    if (!pago) throw new ErrorApp(404, 'El cobro no existe');

    const aplicado = await pagoModel.cerrarSiPendiente(
      tx,
      idPago,
      estado,
      estado === 'Pagado' ? new Date() : null,
    );

    await pagoModel.registrarEvento(tx, {
      idPago,
      tipo: aplicado ? `Cerrado: ${estado}` : `Aviso repetido: ${estado}`,
      origen,
      cuerpo: detalle,
    });

    // Otro llegó primero: el cobro ya tiene desenlace y no se toca nada más.
    if (!aplicado) return;

    if (pago.id_venta !== null) await resolverVenta(tx, pago.id_venta, estado);
    if (pago.id_pedido !== null) await resolverPedido(tx, pago.id_pedido, estado);
    idPedidoResuelto = pago.id_pedido;
  });

  /*
   * El pedido pagado en línea entra recién ahora a la cola de reparto, así que
   * es acá donde se le busca repartidor (RF-PED-07). Va **fuera** de la
   * transacción: asignar es una comodidad y no debe poder deshacer un cobro ya
   * confirmado si algo sale mal.
   */
  if (estado === 'Pagado' && idPedidoResuelto !== null) {
    await repartoService.asignarSinRomper(idPedidoResuelto);
  }

  return conQR(aDTO(await exigirPago(idPago)));
}

/**
 * La venta no se anula sola al fallar el cobro.
 *
 * En el mostrador el cliente está presente: si el pago no entra, se reintenta
 * con otro medio o se cobra en efectivo. Dejar la venta Pendiente conserva esa
 * posibilidad; anularla obligaría a rehacer el ticket entero.
 */
async function resolverVenta(tx: ClientePrisma, idVenta: number, estado: EstadoPago) {
  if (estado === 'Pagado') {
    await ventaModel.marcarEstadoPago(tx, idVenta, 'Pagado');
  }
}

/**
 * El pedido sí se resuelve solo, porque nadie está esperando frente al local.
 *
 * Pagado    → entra a la cola de preparación.
 * No pagado → se cancela y **se repone el stock** que la confirmación había
 *             descontado. Sin esto, cada pedido abandonado en la pantalla de
 *             pago congelaría comida en el inventario para siempre.
 */
async function resolverPedido(tx: ClientePrisma, idPedido: number, estado: EstadoPago) {
  const pedido = await pedidoModel.buscarConDetalle(idPedido, tx);
  if (!pedido) return;

  if (estado === 'Pagado') {
    await pedidoModel.marcarEstadoPago(tx, idPedido, 'Pagado');
    if (pedido.estado_pedido === 'Pendiente de pago') {
      await pedidoModel.cambiarEstado(tx, idPedido, 'Recibido');
    }
    return;
  }

  await pedidoModel.marcarEstadoPago(tx, idPedido, 'Vencido');

  if (pedido.estado_pedido === 'Pendiente de pago') {
    await reponerAsignaciones(
      pedido.detalle_pedido.map((d) => ({
        idProducto: d.id_producto,
        idAlmacen: d.id_almacen,
        cantidad: d.cantidad,
      })),
      tx,
    );
    await pedidoModel.cambiarEstado(tx, idPedido, 'Cancelado');
  }
}

/* ------------------------------------------------------------------ */
/* Avisos de la pasarela                                               */
/* ------------------------------------------------------------------ */

/**
 * Procesa el aviso de la pasarela (webhook).
 *
 * El endpoint que lo recibe es público por necesidad: lo llama un servidor
 * ajeno que no puede iniciar sesión. La única defensa es la firma, y por eso
 * se verifica **antes** de mirar el contenido.
 *
 * Se contrasta además el monto: un aviso que dice haber cobrado menos de lo
 * que vale la venta no la paga. Sin esta comprobación, manipular el monto
 * sería la forma evidente de llevarse el producto por menos dinero.
 */
/** Cuerpo del aviso, o vacío si no trae ninguno. Nunca lanza. */
function analizarCuerpo(cuerpoCrudo: string): Record<string, unknown> {
  if (!cuerpoCrudo.trim()) return {};
  try {
    const cuerpo: unknown = JSON.parse(cuerpoCrudo);
    return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Encuentra el cobro del que habla un aviso.
 *
 * Se busca primero por el identificador de la pasarela, que es lo esperable.
 * Pero Libélula **no devuelve el suyo**: en `transaction_id` repite la
 * referencia que le dimos al registrar la deuda —`PEDIDO-16`—, así que buscar
 * solo por su UUID no encontraba nada y el aviso se descartaba como «de otro
 * ambiente». El pago estaba hecho, el aviso llegaba, y el pedido seguía sin
 * cobrarse.
 *
 * Usar la referencia es seguro: el testigo que autentica el aviso se deriva de
 * ella, así que para cuando se llega aquí ya está comprobada.
 */
async function cobroDelAviso(
  pasarela: string,
  aviso: { idTransaccionExterna: string },
  referencia: string | undefined,
) {
  const porTransaccion = await pagoModel.buscarPorTransaccionExterna(
    pasarela,
    aviso.idTransaccionExterna,
  );
  if (porTransaccion) return porTransaccion;

  // La referencia puede venir en la dirección o, como hace Libélula, repetida
  // dentro del propio aviso.
  for (const candidata of [referencia, aviso.idTransaccionExterna]) {
    const partes = /^(PEDIDO|VENTA)-(\d+)$/.exec(candidata ?? '');
    if (!partes) continue;

    const id = Number(partes[2]);
    const encontrado =
      partes[1] === 'PEDIDO'
        ? await pagoModel.buscarDePedido(id)
        : await pagoModel.buscarDeVenta(id);

    if (encontrado) return encontrado;
  }

  return null;
}

export async function procesarAviso(
  cuerpoCrudo: string,
  cabeceras: Record<string, string | undefined>,
  parametros: Record<string, unknown> = {},
): Promise<{ procesado: boolean }> {
  const modo = await modoCobro();
  const pasarela = pasarelaPara(modo);

  if (!pasarela.verificarFirma(cuerpoCrudo, cabeceras)) {
    throw new ErrorApp(401, 'La firma del aviso no es válida');
  }

  /**
   * El aviso puede venir en el cuerpo, en la dirección, o repartido.
   *
   * Libélula llama a la `callback_url` con los datos **en la dirección** y sin
   * cuerpo: exigir JSON válido rechazaba con 400 todo aviso suyo antes de
   * mirarlo. Los del cuerpo pesan más que los de la dirección porque un
   * cuerpo firmado es más difícil de manipular que una URL.
   */
  const cuerpo = { ...parametros, ...analizarCuerpo(cuerpoCrudo) };

  const aviso = pasarela.interpretarAviso(cuerpo);
  const pago = await cobroDelAviso(pasarela.nombre, aviso, cabeceras['x-referencia-pago']);

  // Un aviso sobre un cobro desconocido no es un error del emisor: puede ser
  // de otro ambiente. Se responde que se recibió y no se hace nada.
  if (!pago) return { procesado: false };

  if (
    aviso.estado === 'Pagado' &&
    aviso.monto !== undefined &&
    Number(pago.monto) - aviso.monto > TOLERANCIA_MONTO
  ) {
    await prisma.$transaction((tx: ClientePrisma) =>
      pagoModel.registrarEvento(tx, {
        idPago: pago.id_pago,
        tipo: 'Monto no coincide',
        origen: 'Pasarela',
        cuerpo: `Esperado ${String(pago.monto)}, informado ${aviso.monto}`,
      }),
    );
    throw new ErrorApp(409, 'El monto informado no corresponde al del cobro');
  }

  if (aviso.estado === 'Pendiente') return { procesado: false };

  await aplicarResultado(pago.id_pago, aviso.estado, 'Pasarela', cuerpoCrudo);
  return { procesado: true };
}

/**
 * Confirmación manual por un empleado.
 *
 * Es el camino del QR estático: el negocio muestra su propio código, el
 * cliente paga y alguien verifica en la aplicación del banco que el dinero
 * llegó. No es automático, pero es exactamente lo que hacen hoy la mayoría de
 * los negocios pequeños, y no exige contrato con ninguna pasarela.
 *
 * Queda registrado quién confirmó: es dinero, y la responsabilidad tiene que
 * tener nombre.
 */
export async function confirmarManual(idUsuario: number, idPago: number): Promise<PagoDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'confirmar cobros');
  const pago = await exigirPago(idPago);

  if (pago.estado !== 'Pendiente') {
    throw new ErrorApp(409, `El cobro ya está ${pago.estado.toLowerCase()}`);
  }

  return aplicarResultado(
    idPago,
    'Pagado',
    'Empleado',
    `Confirmado manualmente por el empleado ${idEmpleado}`,
  );
}

/**
 * Cierra el cobro que acompaña a una venta anulada.
 *
 * Se llama desde la anulación de la venta, ya dentro de su transacción, y por
 * eso no vuelve a tocar el estado de la venta: quien anula ya lo hizo.
 *
 * Un cobro pendiente pasa a `Fallido` —nunca entró el dinero—. Uno ya pagado
 * pasa a `Reembolsado`, que **registra la deuda, no la salda**: devolver el
 * dinero al cliente es un acto aparte, en efectivo desde la caja o desde el
 * panel de la pasarela.
 */
export async function cerrarPorAnulacionDeVenta(
  tx: ClientePrisma,
  idVenta: number,
  detalle: string,
): Promise<{ requiereDevolucion: boolean } | null> {
  const pago = await pagoModel.buscarDeVenta(idVenta, tx);
  if (!pago) return null;

  const estado = pago.estado as EstadoPago;

  if (estado === 'Pendiente') {
    await pagoModel.cerrarSiPendiente(tx, pago.id_pago, 'Fallido', null);
    await pagoModel.registrarEvento(tx, {
      idPago: pago.id_pago,
      tipo: 'Cerrado: Fallido',
      origen: 'Empleado',
      cuerpo: detalle,
    });
    return { requiereDevolucion: false };
  }

  if (estado === 'Pagado') {
    await pagoModel.marcarReembolsado(tx, pago.id_pago);
    await pagoModel.registrarEvento(tx, {
      idPago: pago.id_pago,
      tipo: 'Reembolso pendiente de entrega',
      origen: 'Empleado',
      cuerpo: detalle,
    });
    return { requiereDevolucion: true };
  }

  return { requiereDevolucion: false };
}

export async function anular(idUsuario: number, idPago: number): Promise<PagoDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'anular cobros');
  const pago = await exigirPago(idPago);

  if (pago.estado !== 'Pendiente') {
    throw new ErrorApp(409, `El cobro ya está ${pago.estado.toLowerCase()}`);
  }

  return aplicarResultado(idPago, 'Fallido', 'Empleado', `Anulado por el empleado ${idEmpleado}`);
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export async function listar(
  idUsuario: number,
  filtro: { estado?: string; modo?: string },
): Promise<PagoDTO[]> {
  await exigirEmpleado(idUsuario, 'consultar los cobros');
  const pagos = await pagoModel.listar(filtro);
  return pagos.map(aDTO);
}

export async function deVenta(idVenta: number): Promise<PagoDTO | null> {
  const pago = await pagoModel.buscarDeVenta(idVenta);
  return pago ? conQR(aDTO(pago)) : null;
}

export async function dePedido(idPedido: number): Promise<PagoDTO | null> {
  const pago = await pagoModel.buscarDePedido(idPedido);
  return pago ? conQR(aDTO(pago)) : null;
}

/**
 * Vence los cobros cuyo plazo expiró.
 *
 * Existe para que el stock de un pedido abandonado vuelva al inventario aunque
 * nadie vuelva a abrir esa pantalla. Está pensada para ejecutarse de forma
 * periódica; hoy se invoca desde la consulta de cobros pendientes.
 */
export async function vencerPendientes(): Promise<number> {
  const vencidos = await pagoModel.pendientesVencidos();
  let cerrados = 0;

  for (const pago of vencidos) {
    /*
     * También aquí se pregunta antes de vencer, por la misma razón que en
     * `obtener` y con más motivo: este barrido corre solo, colgado del
     * tránsito de la API, sin que nadie esté mirando. Vencer a ciegas
     * cancelaba pedidos ya pagados —el plazo propio es de minutos y el del QR
     * de la pasarela, de días— y devolvía al inventario comida que el cliente
     * había comprado.
     */
    const estado = await estadoSegunLaPasarela(pago);

    if (estado && estado !== 'Pendiente') {
      await aplicarResultado(pago.id_pago, estado, 'Pasarela', 'Consulta al vencer el plazo');
      cerrados++;
      continue;
    }

    /*
     * Si la pasarela no contesta, el cobro **no se vence**: se deja pendiente
     * y se reintenta en el barrido siguiente. Es preferible un pedido que
     * tarda en resolverse a uno cancelado por una caída ajena.
     */
    if (estado === null && pago.id_transaccion_ext) continue;

    await aplicarResultado(pago.id_pago, 'Vencido', 'Sistema', 'Expiró el plazo del cobro');
    cerrados++;
  }

  return cerrados;
}
