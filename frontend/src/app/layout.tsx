import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import { TemaProvider } from '@/context/TemaContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'NutriExpress',
  description:
    'Sistema de información web para la gestión de ventas, pedidos, producción e inventario de comida saludable',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <TemaProvider>
          <AuthProvider>{children}</AuthProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
