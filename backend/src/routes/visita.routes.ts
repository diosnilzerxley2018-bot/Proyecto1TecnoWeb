import { Router } from 'express';
import * as ctrl from '../controllers/visita.controller.js';

/**
 * RF-WEB-03 — contador de visitas del sitio.
 *
 * Rutas públicas: el pie de página existe también antes de iniciar sesión.
 */
const router = Router();

router.get('/', ctrl.consultar);
router.post('/', ctrl.registrar);

export default router;
