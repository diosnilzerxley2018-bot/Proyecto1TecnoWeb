import { Router } from 'express';
import * as ctrl from '../controllers/busqueda.controller.js';
import { requiereAutenticacion } from '../middlewares/auth.middleware.js';

/**
 * Buscador general del personal.
 *
 * No exige un permiso propio: cada tipo de resultado pide el mismo permiso
 * que su listado, y lo que no se puede ver simplemente no aparece. Que quien
 * busca sea empleado lo comprueba el servicio.
 */
const router = Router();

router.get('/', requiereAutenticacion, ctrl.buscar);

export default router;
