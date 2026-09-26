import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usuarioRoutes from './usuario.routes.js';
import perfilRoutes from './perfil.routes.js';
import rolRoutes from './rol.routes.js';
import cargoRoutes from './cargo.routes.js';
import catalogoRoutes from './catalogo.routes.js';
import pedidoRoutes from './pedido.routes.js';
import ubicacionRoutes from './ubicacion.routes.js';
import gestionRoutes from './gestion.routes.js';
import almacenRoutes from './almacen.routes.js';
import insumoRoutes from './insumo.routes.js';
import productoRoutes from './producto.routes.js';
import recetaRoutes from './receta.routes.js';
import { ingresos, egresos, stock } from './inventario.routes.js';
import ordenRoutes from './orden.routes.js';
import ventaRoutes from './venta.routes.js';
import negocioRoutes from './negocio.routes.js';
import reporteRoutes from './reporte.routes.js';
import reporteOperacionesRoutes from './reporte-operaciones.routes.js';
import clienteRoutes from './cliente.routes.js';
import visitaRoutes from './visita.routes.js';
import busquedaRoutes from './busqueda.routes.js';
import { avisos, pagos, configuracion } from './pago.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'nutriexpress-api' });
});

// --- Subsistema Administración y Seguridad ---
router.use('/auth', authRoutes);
router.use('/usuarios', usuarioRoutes);
// Cuenta propia: sirve a empleados y clientes por igual.
router.use('/perfil', perfilRoutes);
router.use('/roles', rolRoutes);
router.use('/cargos', cargoRoutes);

// --- Subsistema Pedidos (portal del cliente) ---
router.use('/catalogo', catalogoRoutes);
router.use('/pedidos', pedidoRoutes);
// CU-PED-03: direcciones de entrega del cliente.
router.use('/ubicaciones', ubicacionRoutes);

// --- Tablero del personal (CU-PED-02, lado del empleado) ---
router.use('/gestion', gestionRoutes);

// --- Subsistema Inventario ---
router.use('/almacenes', almacenRoutes);
router.use('/insumos', insumoRoutes);
router.use('/ingresos', ingresos);
router.use('/egresos', egresos);
router.use('/stock', stock);

// --- Subsistema Producción ---
router.use('/productos', productoRoutes);
router.use('/recetas', recetaRoutes);
router.use('/ordenes', ordenRoutes);

// --- Subsistema Ventas ---
router.use('/ventas', ventaRoutes);
router.use('/clientes', clienteRoutes);
// RF-PED-03: informacion del negocio y busqueda del encabezado. Publica,
// como el catalogo: se consulta antes de tener cuenta.
router.use('/negocio', negocioRoutes);

// RF-VEN-07: reportes parametrizados.
router.use('/reportes', reporteRoutes);
// RF-PED-10, RF-PRO-08 y RF-INV-08: reportes de operaciones. Cuelgan del
// mismo prefijo porque para quien consulta son el mismo módulo; se separan en
// dos archivos porque cada uno exige permisos distintos.
router.use('/reportes', reporteOperacionesRoutes);

// --- Cobros (RF-PED-04) ---
// El aviso de la pasarela va primero y sin autenticación: lo llama un
// servidor ajeno que no puede iniciar sesión.
router.use('/pagos', avisos);
router.use('/pagos', pagos);
router.use('/configuracion', configuracion);

// --- Sitio web (RF-WEB-03) ---
router.use('/visitas', visitaRoutes);

// --- Buscador general del personal ---
router.use('/buscar', busquedaRoutes);

export default router;
