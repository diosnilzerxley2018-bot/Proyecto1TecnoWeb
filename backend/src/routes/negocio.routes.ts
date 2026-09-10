import { Router } from 'express';
import * as ctrl from '../controllers/negocio.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { esquemaActualizarNegocio } from '../dtos/negocio.dto.js';

/**
 * RF-PED-03 — información del negocio.
 *
 * La lectura y la búsqueda son **públicas**: un visitante tiene que poder ver
 * a qué hora abre el local y qué se vende antes de crearse una cuenta, igual
 * que el catálogo (CU-PED-01).
 *
 * Editar exige `CONFIGURACION_GESTIONAR`, el mismo permiso que cambiar el modo
 * de cobro: los dos son parámetros del sistema que el administrador ajusta en
 * caliente, y no tiene sentido separarlos en dos privilegios.
 */
const router = Router();

router.get('/', ctrl.informacion);
router.get('/buscar', ctrl.buscar);

router.put(
  '/',
  requiereAutenticacion,
  requierePermiso('CONFIGURACION_GESTIONAR'),
  validarCuerpo(esquemaActualizarNegocio),
  ctrl.actualizar,
);

export default router;
