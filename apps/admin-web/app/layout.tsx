import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orbi Admin',
  description: 'Centre d operations Orbi pour le lancement Burkina Faso.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
