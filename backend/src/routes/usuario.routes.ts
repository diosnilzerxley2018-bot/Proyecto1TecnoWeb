import { Router } from 'express';
import * as ctrl from '../controllers/usuario.controller.js';
import * as permisoCtrl from '../controllers/permiso.controller.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(requiereAutenticacion);

// CU-SEG-02 Gestionar Usuario
router.get('/', requierePermiso('USUARIO_LEER'), ctrl.listar);
router.get('/:id', validarIdParam, requierePermiso('USUARIO_LEER'), ctrl.obtener);
router.post('/', requierePermiso('USUARIO_CREAR'), validarCuerpo(ctrl.esquemaCrear), ctrl.crear);
router.put('/:id', validarIdParam, requierePermiso('USUARIO_EDITAR'), validarCuerpo(ctrl.esquemaActualizar), ctrl.actualizar);
router.delete('/:id', validarIdParam, requierePermiso('USUARIO_BAJA'), ctrl.darDeBaja);
router.post('/:id/desbloquear', validarIdParam, requierePermiso('USUARIO_EDITAR'), ctrl.desbloquear);

// CU-SEG-04 Asignar Permisos a Usuario
router.get('/:id/permisos', validarIdParam, requierePermiso('PERMISO_ASIGNAR'), permisoCtrl.obtenerDeUsuario);
router.put('/:id/permisos', validarIdParam, requierePermiso('PERMISO_ASIGNAR'), validarCuerpo(permisoCtrl.esquemaAsignar), permisoCtrl.asignar);

export default router;
