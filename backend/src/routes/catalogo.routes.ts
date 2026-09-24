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
// La foto del producto, en bytes. Pública por la misma razón que las teselas
// del mapa: una etiqueta <img> no manda la cabecera Authorization.
router.get('/:id/imagen', validarIdParam, ctrl.imagen);

export default router;
