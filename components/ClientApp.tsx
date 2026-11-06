'use client';

import dynamic from 'next/dynamic';

// El tablero es una SPA local que depende de localStorage, matchMedia y del backend en vivo:
// se renderiza solo en el navegador (sin SSR) para evitar desajustes de hidratación.
export const ClientApp = dynamic(() => import('./App').then((m) => m.App), { ssr: false });
