import { Router } from 'express';
import * as ctrl from '../controllers/catalogo.controller.js';
import { validarIdParam } from '../middlewares/validate.middleware.js';

/**
 * Catálogo público del portal (CU-PED-01).
 * No se monta `requiereAutenticacion`: el caso de uso indica de forma
 * explícita que puede ejecutarse sin haber iniciado sesión.
 */
const router = Router();

router.get('/categorias', ctrl.listarCategorias);
router.get('/', ctrl.buscar);
router.get('/:id', validarIdParam, ctrl.detalle);

export default router;
