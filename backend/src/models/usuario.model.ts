import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { contieneTodas, limite } from './busqueda-texto.js';
import { recorte, type DatosPaginacion } from '../dtos/paginacion.dto.js';

/** Capa Model — corresponde a la clase de análisis tblUsuario. */

export const buscarPorNombreUsuario = (nombreUsuario: string) =>
  prisma.usuario.findUnique({
    where: { nombre_usuario: nombreUsuario },
    // El cargo viaja en la sesión: decide qué pantallas de trabajo ve cada
    // empleado (a un cocinero no se le ofrece "Mis entregas").
    include: { rol: true, empleado: { include: { cargo: true } } },
  });

export const buscarPorId = (id: number) =>
  prisma.usuario.findUnique({
    where: { id_usuario: id },
    include: { rol: true, empleado: { include: { cargo: true } }, cliente: true },
  });

/**
 * Estado de la cuenta, sin relaciones.
 *
 * La consulta más liviana posible sobre la clave primaria: la ejecuta cada
 * petición autenticada, así que trae tres booleanos y nada más.
 */
export const estadoDeCuenta = (id: number) =>
  prisma.usuario.findUnique({
    where: { id_usuario: id },
    // `fecha_bloqueo` viaja con los dos booleanos porque sin ella no se puede
    // saber si el bloqueo ya caducó, y quien pregunta por el estado de la
    // cuenta necesita esa respuesta, no la del momento en que se bloqueó.
    // `veces_bloqueado` decide cuánto dura: el plazo ya no es fijo.
    select: { activo: true, bloqueado: true, fecha_bloqueo: true, veces_bloqueado: true },
  });

export type EstadoCuenta = 'activos' | 'bloqueados' | 'bajas';

/**
 * Qué cuentas entran en cada estado.
 *
 * Los tres se excluyen entre sí: una cuenta dada de baja no cuenta además
 * como bloqueada —ya no puede entrar de ninguna forma—. Así las cifras de la
 * pantalla suman el total y nadie aparece bajo dos filtros a la vez. El
 * resumen y el listado leen esta misma tabla, de modo que el número de un
 * filtro es siempre cuántas filas trae.
 */
const POR_ESTADO = {
  activos: { activo: true, bloqueado: false },
  bloqueados: { activo: true, bloqueado: true },
  bajas: { activo: false },
} satisfies Record<EstadoCuenta, Prisma.usuarioWhereInput>;

export interface FiltroListado extends DatosPaginacion {
  termino?: string;
  idRol?: number;
  estado?: EstadoCuenta;
}

/**
 * Usuarios cuyo nombre, apellido, usuario o correo contienen todas las
 * palabras buscadas, sin importar tildes ni mayúsculas.
 */
async function idsQueCoinciden(termino: string, tope?: number): Promise<number[]> {
  const filas = await prisma.$queryRaw<{ id_usuario: number }[]>`
    SELECT id_usuario FROM usuario
    WHERE ${contieneTodas(Prisma.sql`concat_ws(' ', nombre, apellido, nombre_usuario, email)`, termino)}
    ORDER BY id_usuario
    ${limite(tope)}`;
  return filas.map((f) => f.id_usuario);
}

async function condicionDelListado(filtro: FiltroListado): Promise<Prisma.usuarioWhereInput> {
  return {
    ...(filtro.termino ? { id_usuario: { in: await idsQueCoinciden(filtro.termino) } } : {}),
    ...(filtro.idRol ? { id_rol: filtro.idRol } : {}),
    ...(filtro.estado ? POR_ESTADO[filtro.estado] : {}),
  };
}

const CAMPOS_LISTA = {
  id_usuario: true,
  nombre: true,
  apellido: true,
  nombre_usuario: true,
  email: true,
  activo: true,
  bloqueado: true,
  rol: { select: { nombre: true } },
} as const;

/** Una página de usuarios y cuántos hay en total (H7). */
export async function listar(filtro: FiltroListado) {
  const where = await condicionDelListado(filtro);
  return prisma.$transaction([
    prisma.usuario.findMany({
      where,
      orderBy: { id_usuario: 'asc' },
      select: CAMPOS_LISTA,
      ...recorte(filtro),
    }),
    prisma.usuario.count({ where }),
  ]);
}

/** Los primeros usuarios que coinciden con lo buscado, para el buscador general. */
export async function coincidencias(termino: string, tope: number) {
  return prisma.usuario.findMany({
    where: { id_usuario: { in: await idsQueCoinciden(termino, tope) } },
    orderBy: { id_usuario: 'asc' },
    select: CAMPOS_LISTA,
  });
}

/** Cuántas cuentas hay en cada estado. */
export async function resumen() {
  const [total, activos, bloqueados, bajas] = await prisma.$transaction([
    prisma.usuario.count(),
    prisma.usuario.count({ where: POR_ESTADO.activos }),
    prisma.usuario.count({ where: POR_ESTADO.bloqueados }),
    prisma.usuario.count({ where: POR_ESTADO.bajas }),
  ]);
  return { total, activos, bloqueados, bajas };
}

/**
 * Datos de la especializacion, segun el modelo de clases:
 * Usuario es supertipo de Empleado y Cliente.
 */
export type Subtipo =
  | { tipo: 'empleado'; idCargo: number; fechaIngreso?: Date }
  | { tipo: 'cliente'; preferenciaAlimentaria?: string | null; restriccionDietetica?: string | null };

export interface DatosNuevoUsuario {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  nombreUsuario: string;
  contrasenaHash: string;
  idRol: number;
  subtipo: Subtipo;
}

/**
 * Crea el usuario y su fila de subtipo en una sola transaccion.
 *
 * Es obligatorio que ambas existan: siete claves foraneas del esquema
 * apuntan a `empleado` o a `cliente`. Un usuario sin subtipo no podria
 * registrar ventas, notas de inventario ni pedidos.
 */
export const crear = (datos: DatosNuevoUsuario) =>
  prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nombre: datos.nombre,
        apellido: datos.apellido,
        email: datos.email,
        telefono: datos.telefono ?? null,
        nombre_usuario: datos.nombreUsuario,
        contrasena_hash: datos.contrasenaHash,
        id_rol: datos.idRol,
      },
    });

    if (datos.subtipo.tipo === 'empleado') {
      await tx.empleado.create({
        data: {
          id_empleado: usuario.id_usuario,
          id_cargo: datos.subtipo.idCargo,
          ...(datos.subtipo.fechaIngreso ? { fecha_ingreso: datos.subtipo.fechaIngreso } : {}),
        },
      });
    } else {
      await tx.cliente.create({
        data: {
          id_cliente: usuario.id_usuario,
          preferencia_alimentaria: datos.subtipo.preferenciaAlimentaria ?? null,
          restriccion_dietetica: datos.subtipo.restriccionDietetica ?? null,
        },
      });
    }

    /**
     * Permisos del rol, habilitados para el usuario.
     *
     * `requierePermiso` consulta `usuario_rol_permiso`, no el rol: la tabla
     * intermedia es lo que permite quitarle un permiso a una persona sin
     * cambiarle el rol (CU-SEG-04). Sin estas filas el usuario podía iniciar
     * sesión y recibía 403 en todo, que es como quedaron los creados desde la
     * aplicación antes de esta corrección.
     *
     * Va en la misma transacción que el alta: un usuario sin permisos no es un
     * usuario a medias, es uno inservible.
     */
    const permisosDelRol = await tx.rol_permiso.findMany({
      where: { id_rol: datos.idRol },
      select: { id_rol_permiso: true },
    });

    if (permisosDelRol.length > 0) {
      await tx.usuario_rol_permiso.createMany({
        data: permisosDelRol.map((rp) => ({
          id_usuario: usuario.id_usuario,
          id_rol_permiso: rp.id_rol_permiso,
        })),
      });
    }

    return usuario;
  });

export const actualizar = (
  id: number,
  datos: Partial<{
    nombre: string;
    apellido: string;
    email: string;
    telefono: string | null;
    id_rol: number;
  }>,
) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: datos,
    include: { rol: true },
  });

/**
 * Cambia el rol de un usuario y **rehace sus permisos** en una sola operación.
 *
 * `requierePermiso` consulta `usuario_rol_permiso` sin mirar el rol actual, de
 * modo que las habilitaciones del rol anterior seguían valiendo después del
 * cambio: a un administrador degradado a empleado le quedaban los permisos de
 * administrador. Rol y permisos son el mismo hecho y por eso viajan juntos;
 * aplicarlos por separado dejaría, entre una consulta y la otra, un usuario
 * con el rol nuevo y los poderes del viejo.
 *
 * Recibe los permisos del rol nuevo, igual que un alta (CU-SEG-02). Lo que se
 * le haya habilitado o quitado a mano en el rol anterior no sobrevive: eran
 * decisiones sobre un rol que ya no tiene.
 */
export const cambiarRol = (id: number, idRol: number) =>
  prisma.$transaction(async (tx) => {
    await tx.usuario_rol_permiso.deleteMany({ where: { id_usuario: id } });

    const permisosDelRol = await tx.rol_permiso.findMany({
      where: { id_rol: idRol },
      select: { id_rol_permiso: true },
    });

    if (permisosDelRol.length > 0) {
      await tx.usuario_rol_permiso.createMany({
        data: permisosDelRol.map((rp) => ({ id_usuario: id, id_rol_permiso: rp.id_rol_permiso })),
      });
    }

    return tx.usuario.update({
      where: { id_usuario: id },
      data: { id_rol: idRol },
      include: { rol: true },
    });
  });

/** Baja lógica: RF-SEG-05 exige dar de baja, no eliminar. */
export const darDeBaja = (id: number) =>
  prisma.usuario.update({ where: { id_usuario: id }, data: { activo: false } });

/**
 * Reactivación de una cuenta dada de baja.
 *
 * Vuelve sin bloqueo y con la escalada en cero, como en `desbloquear`: quien
 * la reactiva respondió por la cuenta.
 */
export const reactivar = (id: number) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: {
      activo: true,
      bloqueado: false,
      fecha_bloqueo: null,
      intentos_fallidos: 0,
      veces_bloqueado: 0,
    },
  });

/**
 * Anota el intento fallido y, si toca, bloquea la cuenta.
 *
 * Al bloquear se **suma uno** a `veces_bloqueado`: es el contador del que sale
 * la duración del castigo, que crece con la insistencia (CU-SEG-05).
 */
export const registrarIntentoFallido = (id: number, intentos: number, bloquear: boolean) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: {
      intentos_fallidos: intentos,
      bloqueado: bloquear,
      fecha_bloqueo: bloquear ? new Date() : null,
      ...(bloquear ? { veces_bloqueado: { increment: 1 } } : {}),
    },
  });

/**
 * Cierra un inicio de sesión correcto.
 *
 * Reinicia el contador de intentos y sella la fecha en un solo `UPDATE`: son
 * dos consecuencias del mismo hecho, y separarlas abriría la posibilidad de
 * que una se aplique y la otra no.
 *
 * También reinicia la escalada del bloqueo. Quien acierta la contraseña
 * demostró ser el dueño, y no tiene por qué arrastrar los bloqueos de sus
 * despistes anteriores: sin esto, olvidarla tres veces en meses distintos
 * terminaba cerrando la cuenta de forma definitiva. Al atacante no lo
 * beneficia, porque para reiniciarlo hay que acertar.
 */
export const registrarAccesoExitoso = (id: number) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { intentos_fallidos: 0, veces_bloqueado: 0, ultimo_acceso: new Date() },
  });

/** Cambia el hash de la contraseña. No toca ningún otro campo. */
export const cambiarContrasena = (id: number, hash: string) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { contrasena_hash: hash },
    select: { id_usuario: true },
  });

/**
 * Levanta un bloqueo **cuyo plazo se cumplió**.
 *
 * No toca `veces_bloqueado`: ese contador es justamente lo que hace que el
 * siguiente bloqueo dure más. Reiniciarlo aquí dejaría al castigo congelado en
 * un minuto para siempre, y bastaría esperar ese minuto entre tandas de tres
 * intentos para probar contraseñas sin límite.
 */
export const levantarBloqueoCumplido = (id: number) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { bloqueado: false, fecha_bloqueo: null, intentos_fallidos: 0 },
  });

/**
 * Desbloqueo por el administrador (CU-SEG-05).
 *
 * Aquí sí se reinicia la escalada: alguien con nombre y apellido revisó el
 * caso y respondió por la cuenta. Dejarle el contador encima significaría que
 * el próximo tropiezo la cierra de nuevo, y de forma definitiva.
 */
export const desbloquear = (id: number) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { bloqueado: false, fecha_bloqueo: null, intentos_fallidos: 0, veces_bloqueado: 0 },
  });

export const existeNombreUsuarioOEmail = (nombreUsuario: string, email: string, excluirId?: number) =>
  prisma.usuario.findFirst({
    where: {
      OR: [{ nombre_usuario: nombreUsuario }, { email }],
      ...(excluirId ? { NOT: { id_usuario: excluirId } } : {}),
    },
    select: { id_usuario: true },
  });
