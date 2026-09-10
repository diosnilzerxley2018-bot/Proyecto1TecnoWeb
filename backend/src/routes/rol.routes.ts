import { Router } from 'express';
import * as ctrl from '../controllers/rol.controller.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(requiereAutenticacion);

// CU-SEG-03 Gestionar Rol y Permisos
router.get('/permisos', requierePermiso('ROL_LEER'), ctrl.listarPermisos);
router.get('/', requierePermiso('ROL_LEER'), ctrl.listar);
router.get('/:id', validarIdParam, requierePermiso('ROL_LEER'), ctrl.obtener);
router.post('/', requierePermiso('ROL_GESTIONAR'), validarCuerpo(ctrl.esquemaRol), ctrl.crear);
router.put('/:id', validarIdParam, requierePermiso('ROL_GESTIONAR'), validarCuerpo(ctrl.esquemaRol), ctrl.actualizar);

export default router;
