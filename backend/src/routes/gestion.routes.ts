import { Router } from 'express';
import * as ctrl from '../controllers/pedido-gestion.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import {
  esquemaAsignarRepartidor,
  esquemaCambiarEstado,
  esquemaDisponibilidad,
} from '../dtos/pedido.dto.js';

/**
 * Tablero del personal (CU-PED-02, lado del empleado).
 *
 * Se separa de `/api/pedidos` porque ese prefijo pertenece al portal del
 * cliente y su alcance de datos es distinto: allí un usuario solo ve lo suyo,
 * aquí el personal ve todos los pedidos.
 */
const router = Router();

router.use(requiereAutenticacion);

router.get('/repartidores', requierePermiso('PEDIDO_LEER'), ctrl.listarRepartidores);

/**
 * El repartidor declara su propio turno, así que no exige PEDIDO_GESTIONAR:
 * basta con ser empleado. Quien sabe si empezó su jornada es él.
 *
 * La lectura sigue la misma regla que la escritura: el alcance lo pone la
 * sesión, y cada empleado solo ve —y solo cambia— el suyo.
 */
router.get('/disponibilidad', ctrl.consultarDisponibilidad);
router.put('/disponibilidad', validarCuerpo(esquemaDisponibilidad), ctrl.cambiarDisponibilidad);

/**
 * Las entregas propias. Exige PEDIDO_LEER como el resto del tablero, pero su
 * alcance lo limita la sesión: devuelve solo lo asignado a quien consulta.
 */
router.get('/mis-entregas', requierePermiso('PEDIDO_LEER'), ctrl.misEntregas);

/** El tablero, aparte del listado: cuenta todos, no solo la página visible. */
router.get('/pedidos/resumen', requierePermiso('PEDIDO_LEER'), ctrl.resumen);

router.get('/pedidos', requierePermiso('PEDIDO_LEER'), ctrl.listar);
router.get('/pedidos/:id', requierePermiso('PEDIDO_LEER'), validarIdParam, ctrl.detalle);

router.patch(
  '/pedidos/:id/estado',
  requierePermiso('PEDIDO_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaCambiarEstado),
  ctrl.avanzarEstado,
);

/** Sugerencia: propone a quién asignarle. No asigna nada. */
router.get(
  '/pedidos/:id/sugerencia-repartidor',
  requierePermiso('PEDIDO_GESTIONAR'),
  validarIdParam,
  ctrl.sugerirRepartidor,
);

router.put(
  '/pedidos/:id/repartidor',
  requierePermiso('PEDIDO_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaAsignarRepartidor),
  ctrl.asignarRepartidor,
);

export default router;
