import { Router } from 'express';
import * as ctrl from '../controllers/producto.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { subirImagenProducto } from '../middlewares/imagen.middleware.js';
import {
  esquemaActualizarProducto,
  esquemaCrearProducto,
  esquemaValorNutricional,
} from '../dtos/producto.dto.js';
import { esquemaCrearReceta } from '../dtos/receta.dto.js';

/**
 * CU-PRO-01 — Gestionar Producto y Receta. Actores: Administrador y Empleado,
 * ambos con el permiso PRODUCTO_GESTIONAR.
 *
 * La lectura pública del catálogo vive en `/api/catalogo`, sin autenticación y
 * con una proyección que no expone recetas ni costos.
 */
const router = Router();

router.use(requiereAutenticacion, requierePermiso('PRODUCTO_GESTIONAR'));

router.get('/', ctrl.listar);
router.post('/', validarCuerpo(esquemaCrearProducto), ctrl.crear);

router.get('/:id', validarIdParam, ctrl.obtener);
router.put('/:id', validarIdParam, validarCuerpo(esquemaActualizarProducto), ctrl.actualizar);
router.delete('/:id', validarIdParam, ctrl.eliminar);

// CU-PRO-03 — Registrar Valor Nutricional (extensión opcional)
router.put(
  '/:id/valor-nutricional',
  validarIdParam,
  validarCuerpo(esquemaValorNutricional),
  ctrl.guardarValorNutricional,
);

// Foto del producto (extensión opcional, igual que el valor nutricional). La
// lectura pública vive en /catalogo, no aquí: esta ruta exige el permiso de
// gestión y multer necesita ir antes para poblar req.file.
router.post('/:id/imagen', validarIdParam, subirImagenProducto, ctrl.subirImagen);
router.delete('/:id/imagen', validarIdParam, ctrl.eliminarImagen);

// Versiones de receta del producto (RF-PRO-04)
router.get('/:id/recetas', validarIdParam, ctrl.listarRecetas);
router.post('/:id/recetas', validarIdParam, validarCuerpo(esquemaCrearReceta), ctrl.crearReceta);

export default router;
