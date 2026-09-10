import { Router } from 'express';
import * as ctrl from '../controllers/cargo.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(requiereAutenticacion);
router.get('/', requierePermiso('USUARIO_LEER'), ctrl.listar);

export default router;
