import type { Metadata } from 'next';
import { Lora, Nunito, Outfit, Source_Sans_3 } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import { TemaProvider } from '@/context/TemaContext';
import { SCRIPT_TEMA_INICIAL } from '@/lib/tema';
import './globals.css';

/*
 * La letra de cada tema (RF-WEB-02): Outfit en Jóvenes, Nunito —redondeada—
 * en Niños, y en Adultos Source Sans para el texto con Lora, de serifa, para
 * los títulos. Next las sirve desde el propio sitio; el CSS elige cuál usar
 * con `--fuente-texto` y `--fuente-titulo`. Solo se precarga la del tema por
 * omisión: las demás se descargan cuando un tema las pide.
 */
const outfit = Outfit({ subsets: ['latin'], variable: '--fuente-outfit', display: 'swap' });
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--fuente-nunito',
  display: 'swap',
  preload: false,
});
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--fuente-source',
  display: 'swap',
  preload: false,
});
const lora = Lora({ subsets: ['latin'], variable: '--fuente-lora', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: 'NutriExpress',
  description:
    'Sistema de información web para la gestión de ventas, pedidos, producción e inventario de comida saludable',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // El script cambia `data-tema` y `data-modo` antes de hidratar: que el
    // atributo difiera del HTML del servidor es a propósito.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${outfit.variable} ${nunito.variable} ${sourceSans.variable} ${lora.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body className="antialiased">
        <TemaProvider>
          <AuthProvider>{children}</AuthProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
