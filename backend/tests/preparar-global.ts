import { execFileSync } from 'node:child_process';

/**
 * Reconstruye la base de pruebas antes de cada corrida completa.
 *
 * Sin esto, las pruebas comparten una base que nunca se reinicia y van
 * consumiendo el stock del seed corrida tras corrida. La suite pasa durante
 * semanas y un día empieza a fallar con "stock insuficiente" en pruebas que
 * nadie tocó, lo que envía a buscar el error donde no está.
 *
 * Cuesta unos segundos por corrida y a cambio la suite es determinista: el
 * mismo comando da siempre el mismo resultado, sin importar cuántas veces se
 * haya ejecutado antes.
 */
export default function preparar(): void {
  execFileSync('npx', ['tsx', 'tests/preparar-bd.ts'], {
    stdio: 'inherit',
    shell: true,
  });
}
