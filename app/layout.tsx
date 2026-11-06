import type { Metadata, Viewport } from 'next';
import './globals.css';

const icon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2334d399'/%3E%3Cstop offset='1' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='9' fill='url(%23g)'/%3E%3Ccircle cx='12' cy='19' r='5' fill='none' stroke='white' stroke-width='2.5'/%3E%3Cpath d='M15.5 15.5 24 7m-3.5 3.5 3 3' stroke='white' stroke-width='2.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: 'Bóveda · KeePassXC',
  icons: { icon },
  referrer: 'no-referrer',
};

export const viewport: Viewport = { themeColor: '#10b981' };

// Aplica el tema antes de pintar para evitar parpadeo
const themeScript = `try {
  const mode = JSON.parse(localStorage.getItem('boveda:theme') || '"system"');
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch {}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
