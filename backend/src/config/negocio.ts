/**
 * Información pública del negocio (RF-PED-03).
 *
 * *"El sistema debe permitir buscar productos e información del negocio desde
 * el encabezado de la página principal."*
 *
 * Vive en la tabla `configuracion`, no en el código ni en el entorno, por la
 * misma razón que el modo de cobro: un horario cambia, un teléfono cambia, y
 * el dueño no debería necesitar un programador ni un reinicio del servidor
 * para corregirlos. Cada campo es una fila `NEGOCIO_*`.
 *
 * Este archivo es la **fuente única** de qué campos existen, cómo se llaman en
 * la pantalla y qué dicen mientras nadie los haya editado. Agregar un dato del
 * negocio es agregar una entrada aquí; no hay una segunda lista que mantener.
 */

export interface CampoNegocio {
  /** Nombre en el DTO y en el formulario. */
  nombre: string;
  /** Clave de la fila en `configuracion`. */
  clave: string;
  etiqueta: string;
  /** Qué se muestra mientras nadie lo haya editado. */
  porOmision: string;
  /** Largo máximo. La columna `valor` admite 200 caracteres. */
  maximo: number;
  /**
   * Si el campo entra en la búsqueda del encabezado.
   *
   * Las coordenadas no: nadie busca «-17.78».
   */
  buscable: boolean;
}

export const CAMPOS_NEGOCIO: CampoNegocio[] = [
  {
    nombre: 'nombre',
    clave: 'NEGOCIO_NOMBRE',
    etiqueta: 'Nombre del negocio',
    porOmision: 'NutriExpress',
    maximo: 100,
    buscable: true,
  },
  {
    nombre: 'lema',
    clave: 'NEGOCIO_LEMA',
    etiqueta: 'Lema',
    porOmision: 'Comida saludable a domicilio en Santa Cruz de la Sierra',
    maximo: 150,
    buscable: true,
  },
  {
    nombre: 'descripcion',
    clave: 'NEGOCIO_DESCRIPCION',
    etiqueta: 'Quiénes somos',
    porOmision:
      'Preparamos comida saludable con insumos frescos y la llevamos hasta su puerta. ' +
      'Cada producto lleva su información nutricional para que usted sepa exactamente qué come.',
    maximo: 200,
    buscable: true,
  },
  {
    nombre: 'horario',
    clave: 'NEGOCIO_HORARIO',
    etiqueta: 'Horario de atención',
    porOmision: 'Lunes a sábado de 08:00 a 20:00 · Domingos de 09:00 a 14:00',
    maximo: 150,
    buscable: true,
  },
  {
    nombre: 'telefono',
    clave: 'NEGOCIO_TELEFONO',
    etiqueta: 'Teléfono',
    porOmision: '+591 3 000000',
    maximo: 30,
    buscable: true,
  },
  {
    nombre: 'whatsapp',
    clave: 'NEGOCIO_WHATSAPP',
    etiqueta: 'WhatsApp',
    porOmision: '+591 70000000',
    maximo: 30,
    buscable: true,
  },
  {
    nombre: 'correo',
    clave: 'NEGOCIO_CORREO',
    etiqueta: 'Correo de contacto',
    porOmision: 'contacto@nutriexpress.bo',
    maximo: 100,
    buscable: true,
  },
  {
    nombre: 'direccion',
    clave: 'NEGOCIO_DIRECCION',
    etiqueta: 'Dirección',
    porOmision: 'Av. Banzer, 3er anillo · Santa Cruz de la Sierra, Bolivia',
    maximo: 150,
    buscable: true,
  },
  {
    /**
     * Hallazgo A8: CU-PED-03 menciona una zona de cobertura que el modelo no
     * tiene. Publicarla aquí la hace visible para el cliente **antes** de que
     * arme el pedido, que es cuando sirve. No la valida: rechazar una
     * dirección por estar fuera exigiría un polígono y un cálculo geográfico,
     * que es otro trabajo.
     */
    nombre: 'cobertura',
    clave: 'NEGOCIO_COBERTURA',
    etiqueta: 'Zona de cobertura',
    porOmision: 'Entregamos dentro del cuarto anillo de Santa Cruz de la Sierra.',
    maximo: 200,
    buscable: true,
  },
];

/** Coordenadas del local, para el mapa de la página de información. */
export const CLAVE_LATITUD = 'NEGOCIO_LATITUD';
export const CLAVE_LONGITUD = 'NEGOCIO_LONGITUD';

/** El mismo centro de reparto que usa el portal al elegir una dirección. */
export const UBICACION_POR_OMISION = { latitud: -17.783327, longitud: -63.18214 };
