import { Router } from 'express';
import * as ctrl from '../controllers/reporte-operaciones.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { esquemaDestinatarioReporte } from '../dtos/reporte.dto.js';

/**
 * RF-PED-10, RF-PRO-08 y RF-INV-08 — reportes de operaciones.
 *
 * Cada reporte exige el permiso de lectura de su módulo: quien puede consultar
 * los pedidos puede resumirlos. No se creó un permiso propio de "reportes"
 * para no multiplicar permisos por cada vista de los mismos datos, y porque
 * atarlo al módulo evita que un permiso genérico abra de golpe información de
 * áreas que la persona no administra.
 *
 * Los nombres salen del catálogo de `prisma/seed.ts`: producción no tiene un
 * permiso de solo lectura, así que el reporte usa el de gestión de órdenes, e
 * inventario usa `STOCK_CONSULTAR`, que es justamente el de mirar existencias.
 *
 * `PEDIDO_LEER` lo tiene también el rol Cliente, pero el servicio exige además
 * que quien consulta sea empleado: un cliente con ese permiso lee sus pedidos,
 * no el reporte del negocio.
 */
const router = Router();

router.use(requiereAutenticacion);

const montar = (
  ruta: ctrl.NombreReporte,
  permiso: string,
) => {
  router.get(`/${ruta}`, requierePermiso(permiso), ctrl.consultar(ruta));
  router.get(`/${ruta}.pdf`, requierePermiso(permiso), ctrl.pdf(ruta));
  router.post(
    `/${ruta}/enviar`,
    requierePermiso(permiso),
    validarCuerpo(esquemaDestinatarioReporte),
    ctrl.enviar(ruta),
  );
};

montar('pedidos', 'PEDIDO_LEER');
montar('produccion', 'ORDEN_PRODUCCION_GESTIONAR');
montar('inventario', 'STOCK_CONSULTAR');

export default router;
