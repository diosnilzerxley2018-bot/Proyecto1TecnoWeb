import { Router } from 'express';
import * as ctrl from '../controllers/cliente.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaActualizarCliente, esquemaActualizarPerfil } from '../dtos/cliente.dto.js';

/**
 * CU-VEN-02 — Gestionar Cliente, con sus dos actores.
 *
 * `/perfil` se declara antes que `/:id` porque de lo contrario la palabra
 * quedaría capturada como identificador. Esa ruta no exige el permiso
 * CLIENTE_GESTIONAR: el titular administra su propia ficha, y el servicio
 * resuelve de qué ficha se trata a partir de la sesión, nunca de la URL.
 */
const router = Router();

router.use(requiereAutenticacion);

router.get('/perfil', ctrl.obtenerPerfil);
router.put('/perfil', validarCuerpo(esquemaActualizarPerfil), ctrl.actualizarPerfil);

router.get('/', requierePermiso('CLIENTE_GESTIONAR'), ctrl.listar);
router.get('/:id', requierePermiso('CLIENTE_GESTIONAR'), validarIdParam, ctrl.obtener);
router.put(
  '/:id',
  requierePermiso('CLIENTE_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaActualizarCliente),
  ctrl.actualizar,
);

export default router;
