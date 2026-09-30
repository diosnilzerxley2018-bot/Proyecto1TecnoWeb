import { Router } from 'express';
import * as ingresoCtrl from '../controllers/ingreso.controller.js';
import * as egresoCtrl from '../controllers/egreso.controller.js';
import * as stockCtrl from '../controllers/stock.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaCrearEgreso, esquemaCrearIngreso } from '../dtos/movimiento.dto.js';

/**
 * Movimientos de inventario y control de stock.
 * CU-INV-03 (ingreso), CU-INV-04 (egreso) y CU-INV-05 (control de stock).
 */

export const ingresos = Router();
ingresos.use(requiereAutenticacion);
ingresos.get('/', requierePermiso('STOCK_CONSULTAR'), ingresoCtrl.listar);
// Antes que `/:id`: si no, «lotes» se leería como el número de una nota.
ingresos.get('/lotes', requierePermiso('STOCK_CONSULTAR'), ingresoCtrl.lotes);
// Lo que ofrece el formulario al registrar una devolución al proveedor.
ingresos.get('/devolubles', requierePermiso('EGRESO_REGISTRAR'), ingresoCtrl.devolubles);
ingresos.get('/:id', requierePermiso('STOCK_CONSULTAR'), validarIdParam, ingresoCtrl.obtener);
ingresos.post(
  '/',
  requierePermiso('INGRESO_REGISTRAR'),
  validarCuerpo(esquemaCrearIngreso),
  ingresoCtrl.crear,
);

export const egresos = Router();
egresos.use(requiereAutenticacion);
egresos.get('/', requierePermiso('STOCK_CONSULTAR'), egresoCtrl.listar);
// Lo que ofrece el formulario al registrar una reposición; antes que `/:id`.
egresos.get('/reponibles', requierePermiso('INGRESO_REGISTRAR'), egresoCtrl.reponibles);
egresos.get('/:id', requierePermiso('STOCK_CONSULTAR'), validarIdParam, egresoCtrl.obtener);
egresos.post(
  '/',
  requierePermiso('EGRESO_REGISTRAR'),
  validarCuerpo(esquemaCrearEgreso),
  egresoCtrl.crear,
);

export const stock = Router();
stock.use(requiereAutenticacion, requierePermiso('STOCK_CONSULTAR'));
stock.get('/alertas', stockCtrl.listarAlertas);
stock.get('/vencimientos', stockCtrl.listarVencimientos);
stock.get('/', stockCtrl.consultar);
