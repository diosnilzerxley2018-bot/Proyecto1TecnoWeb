import { z } from 'zod';

/**
 * CU-PED-03 — Gestionar Ubicación.
 *
 * Los seis decimales de latitud y longitud son los que admite el esquema
 * (`NUMERIC(8,6)` y `NUMERIC(9,6)`): alcanzan para distinguir una casa de la
 * de al lado, y más dígitos los rechazaría el motor.
 */

const coordenada = (limite: number) =>
  z
    .number()
    .min(-limite)
    .max(limite)
    .transform((v) => Math.round(v * 1_000_000) / 1_000_000);

export const camposUbicacion = {
  calle: z.string().trim().min(3, 'indique la calle').max(150),
  numero: z.string().trim().max(20).nullable().optional(),
  referencia: z.string().trim().min(3, 'una referencia ayuda a encontrar la puerta').max(150),
  latitud: coordenada(90).nullable().optional(),
  longitud: coordenada(180).nullable().optional(),
} as const;

/**
 * Alta de una dirección del cliente.
 *
 * La etiqueta es obligatoria aquí y no en el esquema: sin nombre, una lista de
 * tres direcciones parecidas es indistinguible para quien va a elegir.
 */
export const esquemaCrearUbicacion = z.object({
  ...camposUbicacion,
  etiqueta: z.string().trim().min(2, 'póngale un nombre, por ejemplo Casa').max(50),
});

/**
 * Dirección de un pedido.
 *
 * Se acepta **una de dos formas**, nunca las dos: una dirección guardada por
 * su identificador, o una escrita en el momento. Es lo que permite que el
 * cliente que vuelve confirme en dos clics y el que pide por primera vez no
 * tenga que guardar nada antes.
 */
export const esquemaDestinoPedido = z
  .object({
    /** Dirección ya guardada. Si viene, lo demás se ignora. */
    idUbicacion: z.number().int().positive().optional(),
    calle: camposUbicacion.calle.optional(),
    numero: camposUbicacion.numero,
    referencia: camposUbicacion.referencia.optional(),
    latitud: camposUbicacion.latitud,
    longitud: camposUbicacion.longitud,
    /** Si viene, la dirección queda guardada para la próxima vez. */
    etiqueta: z.string().trim().min(2).max(50).nullable().optional(),
  })
  .superRefine((datos, ctx) => {
    // Una dirección guardada no necesita nada más: el servicio la resuelve.
    if (datos.idUbicacion !== undefined) return;

    // Se comprueba campo por campo, y no con una unión, para que el error
    // diga *cuál* falta. Una unión de Zod responde "entrada inválida" sin
    // nombrar el campo, y quien está llenando el formulario queda a ciegas.
    if (!datos.calle) {
      ctx.addIssue({ code: 'custom', path: ['calle'], message: 'indique la calle' });
    }
    if (!datos.referencia) {
      ctx.addIssue({
        code: 'custom',
        path: ['referencia'],
        message: 'una referencia ayuda a encontrar la puerta',
      });
    }
  });

export type DatosCrearUbicacion = z.infer<typeof esquemaCrearUbicacion>;
export type DatosDestinoPedido = z.infer<typeof esquemaDestinoPedido>;

export interface UbicacionDTO {
  id: number;
  etiqueta: string | null;
  calle: string;
  numero: string | null;
  referencia: string;
  latitud: number | null;
  longitud: number | null;
  /** Falso cuando fue reemplazada; los pedidos que la usaron la conservan. */
  vigente: boolean;
}
