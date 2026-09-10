import 'dotenv/config';

function requerido(clave: string): string {
  const valor = process.env[clave];
  if (!valor) throw new Error(`Falta la variable de entorno ${clave}`);
  return valor;
}

export const env = {
  databaseUrl: requerido('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: requerido('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  maxIntentosFallidos: Number(process.env.MAX_INTENTOS_FALLIDOS ?? 3),
  /**
   * Orígenes autorizados, separados por coma.
   *
   * Es una lista y no un valor único porque un despliegue en Vercel tiene más
   * de una dirección: el dominio de producción y uno distinto por cada
   * previsualización. Con un solo origen, las previsualizaciones quedan
   * bloqueadas por CORS y parecen un fallo del backend.
   */
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Cobros. El modo (simulado o real) NO vive aquí: lo cambia el
   * administrador desde la aplicación y se guarda en `configuracion`. Aquí
   * solo están las credenciales y los parámetros que no se tocan en caliente.
   */
  /**
   * Defensas del inicio de sesión.
   *
   * El bloqueo por intentos (CU-SEG-05) protege una cuenta y a la vez permite
   * inutilizarla: estos dos valores son los que impiden que esa defensa se
   * convierta en el ataque.
   */
  seguridad: {
    /** Intentos fallidos tolerados por dirección IP dentro de la ventana. */
    maxIntentosPorIp: Number(process.env.MAX_INTENTOS_POR_IP ?? 10),
    ventanaIntentosMs: Number(process.env.VENTANA_INTENTOS_MS ?? 15 * 60_000),
    /**
     * Minutos que dura el bloqueo de una cuenta antes de liberarse sola.
     *
     * Un bloqueo sin salida convierte un ataque de un minuto en una
     * interrupción de un día, y obliga a intervenir la base de datos cuando le
     * toca al administrador. En 0 el bloqueo es permanente, como antes.
     */
    minutosDeBloqueo: Number(process.env.MINUTOS_DE_BLOQUEO ?? 15),
  },

  /**
   * Correo saliente.
   *
   * El modo vive aquí y no en la base —a diferencia del cobro— porque no es
   * una decisión de negocio que el administrador tome en caliente: depende de
   * si el servidor tiene un relay al que entregar. En el laboratorio de la
   * materia, `TecnoCorreo` lo provee en `localhost:25`.
   */
  correo: {
    /**
     * Con qué se envía:
     *
     * - `simulado` guarda en memoria y no envía nada. Es el valor por omisión
     *   y el que usan las pruebas.
     * - `smtp` (o `real`) entrega por un servidor SMTP. Es lo que se usa en el
     *   laboratorio, contra el Postfix de la VM.
     * - `brevo` entrega por la API HTTPS de Brevo. Es lo que hace falta en una
     *   plataforma gestionada, donde el puerto SMTP suele estar bloqueado.
     */
    modo: process.env.CORREO_MODO ?? 'simulado',
    servidor: process.env.CORREO_SERVIDOR ?? 'localhost',
    puerto: Number(process.env.CORREO_PUERTO ?? 25),
    /**
     * Remitente. Debe ser del propio dominio: un servidor de correo rechaza
     * los mensajes que dicen venir de un dominio ajeno.
     */
    remitente: process.env.CORREO_REMITENTE ?? 'nutriexpress@tecnologia.web',
    /** Postfix en `mynetworks` no pide credenciales; una nube sí. */
    usuario: process.env.CORREO_USUARIO ?? '',
    contrasena: process.env.CORREO_CONTRASENA ?? '',
    /** Clave de la API de Brevo. Solo hace falta con `CORREO_MODO=brevo`. */
    brevoApiKey: process.env.BREVO_API_KEY ?? '',
  },

  pago: {
    /**
     * Cuánto tarda la pasarela simulada en dar el cobro por pagado. No es
     * un adorno: obliga a que el mismo camino asíncrono del modo real se
     * ejercite también en simulado, en vez de quedar sin probar hasta el día
     * que se active el dinero de verdad. Las pruebas lo ponen en 0.
     */
    retardoSimuladoMs: Number(process.env.PAGO_SIMULADO_RETARDO_MS ?? 2000),
    /** Vida del QR o del enlace de pago antes de darse por vencido. */
    minutosExpiracion: Number(process.env.PAGO_MINUTOS_EXPIRACION ?? 15),
    /** Pasarela a usar cuando el modo es Real. */
    pasarelaReal: process.env.PAGO_PASARELA_REAL ?? 'Libelula',
    /**
     * Dirección pública del servidor, con esquema.
     *
     * La pasarela avisa del pago llamando a una dirección nuestra desde su
     * propio servidor, de modo que `localhost` no sirve: no es alcanzable
     * desde fuera. En desarrollo se resuelve con un túnel.
     */
    urlPublica: process.env.PAGO_URL_PUBLICA ?? '',
    libelula: {
      urlBase: process.env.LIBELULA_URL_BASE ?? '',
      apiKey: process.env.LIBELULA_API_KEY ?? '',
      /**
       * Correo del comercio, para los cobros sin cliente identificado.
       * Libélula exige un `email_cliente` en cada deuda.
       */
      emailComercio: process.env.LIBELULA_EMAIL_COMERCIO ?? '',
    },
  },
} as const;
