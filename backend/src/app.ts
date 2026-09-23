import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import rutas from './routes/index.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/error.middleware.js';
import { barridoDeCobros } from './middlewares/mantenimiento.middleware.js';
import { ErrorApp } from './errors/error-app.js';

export const app = express();

/**
 * Se confía en **un** proxy por delante.
 *
 * En Railway la aplicación no recibe la conexión del cliente sino la de su
 * balanceador, que pone la dirección real en `X-Forwarded-For`. Sin esto,
 * Express la ignora y el limitador de intentos ve a todo internet como una
 * sola dirección: bastaría con que alguien gastara el cupo para dejar a los
 * demás sin poder iniciar sesión. `1` y no `true` a propósito, porque confiar
 * en toda la cadena permitiría falsificar la cabecera y esquivar el límite.
 */
app.set('trust proxy', 1);

/**
 * Cabeceras de seguridad (RNF-SEG-03 y RNF-SEG-06).
 *
 * `contentSecurityPolicy` va apagada: esta aplicación solo sirve JSON, y la
 * política del navegador la fija el frontend, que es quien entrega el HTML.
 * Dejarla encendida aquí no protege nada y complica el desarrollo.
 */
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

/*
 * CORS con lista de orígenes.
 *
 * Se acepta una petición **sin** `Origin` —las hace curl, y también el aviso
 * de la pasarela— porque CORS protege al navegador de otra página, no al
 * servidor de un cliente cualquiera; eso lo hacen la sesión y los permisos.
 */
app.use(
  cors({
    origin(origen, responder) {
      if (!origen || env.corsOrigin.includes(origen)) return responder(null, true);
      responder(new ErrorApp(403, `Origen no autorizado: ${origen}`));
    },
    credentials: true,
  }),
);

/**
 * El aviso de la pasarela se recibe **sin interpretar**.
 *
 * Su firma se calcula sobre los bytes exactos que envió la pasarela. Si
 * `express.json()` lo convirtiera en objeto y luego lo volviéramos a
 * serializar, el orden de las claves y los espacios podrían cambiar, la firma
 * no coincidiría y todo aviso legítimo se rechazaría. Por eso este `raw` va
 * antes del `json` general y solo sobre esa ruta.
 */
app.use('/api/pagos/notificacion', express.raw({ type: '*/*', limit: '256kb' }));

app.use(express.json({ limit: '256kb' }));

// Libera el stock de los cobros que vencieron, como mucho una vez por minuto
// y sin bloquear la petición en curso.
app.use('/api', barridoDeCobros);

app.use('/api', rutas);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);
