import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mobilis Admin',
  description: 'Centre d operations Mobilis pour le lancement Burkina Faso.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
