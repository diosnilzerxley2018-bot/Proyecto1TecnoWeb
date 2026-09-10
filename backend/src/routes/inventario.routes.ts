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
