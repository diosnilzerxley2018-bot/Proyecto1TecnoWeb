import { Router } from 'express';
import * as ctrl from '../controllers/reporte.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { esquemaEnviarReporte } from '../dtos/reporte.dto.js';

/**
 * RF-VEN-07 — reportes parametrizados.
 *
 * Exigen `VENTA_LEER`: quien puede consultar las ventas puede resumirlas. No
 * se creó un permiso propio para no multiplicar permisos por cada vista de los
 * mismos datos.
 */
const router = Router();

router.use(requiereAutenticacion, requierePermiso('VENTA_LEER'));

router.get('/ventas', ctrl.ventas);
router.get('/ventas.pdf', ctrl.ventasPdf);
router.post('/ventas/enviar', validarCuerpo(esquemaEnviarReporte), ctrl.enviarVentas);

export default router;
