import { Router } from 'express';
import * as ctrl from '../controllers/producto.controller.js';
import {
  requiereAlgunPermiso,
  requiereAutenticacion,
  requierePermiso,
} from '../middlewares/auth.middleware.js';
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
 *
 * Leer no es gestionar. Quien produce elige la receta (CU-PRO-02) y quien
 * registra una nota elige qué producto entra o sale (CU-INV-03 y CU-INV-04):
 * los dos necesitan la lista, y ninguno debería poder cambiar un precio para
 * verla. Todo lo que modifica sigue pidiendo PRODUCTO_GESTIONAR.
 */
const LEEN_PRODUCTOS = ['PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR', 'STOCK_CONSULTAR'];
const LEEN_RECETAS = ['PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR'];
const gestiona = requierePermiso('PRODUCTO_GESTIONAR');

const router = Router();

router.use(requiereAutenticacion);

router.get('/', requiereAlgunPermiso(...LEEN_PRODUCTOS), ctrl.listar);
router.post('/', gestiona, validarCuerpo(esquemaCrearProducto), ctrl.crear);

router.get('/:id', requiereAlgunPermiso(...LEEN_PRODUCTOS), validarIdParam, ctrl.obtener);
router.put('/:id', gestiona, validarIdParam, validarCuerpo(esquemaActualizarProducto), ctrl.actualizar);
router.delete('/:id', gestiona, validarIdParam, ctrl.eliminar);

// CU-PRO-03 — Registrar Valor Nutricional (extensión opcional)
router.put(
  '/:id/valor-nutricional',
  gestiona,
  validarIdParam,
  validarCuerpo(esquemaValorNutricional),
  ctrl.guardarValorNutricional,
);

// Foto del producto (extensión opcional, igual que el valor nutricional). La
// lectura pública vive en /catalogo, no aquí: esta ruta exige el permiso de
// gestión y multer necesita ir antes para poblar req.file.
router.post('/:id/imagen', gestiona, validarIdParam, subirImagenProducto, ctrl.subirImagen);
router.delete('/:id/imagen', gestiona, validarIdParam, ctrl.eliminarImagen);

// Versiones de receta del producto (RF-PRO-04)
router.get('/:id/recetas', requiereAlgunPermiso(...LEEN_RECETAS), validarIdParam, ctrl.listarRecetas);
router.post('/:id/recetas', gestiona, validarIdParam, validarCuerpo(esquemaCrearReceta), ctrl.crearReceta);

export default router;
