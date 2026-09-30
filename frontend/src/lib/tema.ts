/**
 * RF-WEB-02 — lo que comparten el contexto del tema y el script que lo aplica
 * antes de pintar.
 *
 * Vive fuera de `TemaContext` porque ese archivo es de cliente, y el layout
 * raíz —de servidor— necesita estos valores para escribir el script.
 */

export type Tema = 'ninos' | 'jovenes' | 'adultos';
export type Modo = 'dia' | 'noche';
export type PreferenciaModo = Modo | 'auto';

export const TEMA_POR_OMISION: Tema = 'jovenes';

export const CLAVE_TEMA = 'nutriexpress.tema';
export const CLAVE_MODO = 'nutriexpress.modo';

/** Franja diurna: de las 07:00 a las 18:59 del reloj del propio cliente. */
export const HORA_AMANECER = 7;
export const HORA_ANOCHECER = 19;

export function modoSegunLaHora(): Modo {
  const hora = new Date().getHours();
  return hora >= HORA_AMANECER && hora < HORA_ANOCHECER ? 'dia' : 'noche';
}

/**
 * Aplica el tema y el modo guardados **antes de la primera pintura**.
 *
 * El contexto los aplica al hidratarse, y hasta entonces se veía el tema por
 * omisión: con temas que cambian la letra y la paleta entera, recargar la
 * página era un destello de Jóvenes antes de pasar a Niños. Este script corre
 * en el `<head>`, antes de que el navegador pinte nada.
 */
export const SCRIPT_TEMA_INICIAL = `(function () {
  var raiz = document.documentElement;
  try {
    var tema = localStorage.getItem(${JSON.stringify(CLAVE_TEMA)}) || ${JSON.stringify(TEMA_POR_OMISION)};
    var preferencia = localStorage.getItem(${JSON.stringify(CLAVE_MODO)}) || 'auto';
    var hora = new Date().getHours();
    raiz.dataset.tema = tema;
    raiz.dataset.modo = preferencia === 'auto'
      ? (hora >= ${HORA_AMANECER} && hora < ${HORA_ANOCHECER} ? 'dia' : 'noche')
      : preferencia;
  } catch (e) {
    raiz.dataset.tema = ${JSON.stringify(TEMA_POR_OMISION)};
  }
})();`;
