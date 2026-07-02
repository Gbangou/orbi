import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Orbi Admin — Centre d\'opérations',
  description: 'Centre d\'opérations Orbi pour le lancement Burkina Faso.',
};

const NAV_SECTIONS = [
  { id: 'overview',        label: 'Vue d\'ensemble' },
  { id: 'live-ops',        label: 'Live Ops'        },
  { id: 'trips-audit',     label: 'Trajets'         },
  { id: 'system-health',   label: 'Santé système'   },
  { id: 'launch-readiness',label: 'Prêt lancement'  },
  { id: 'feature-flags',   label: 'Feature Flags'   },
  { id: 'dispatch',        label: 'Dispatch'        },
  { id: 'pricing',         label: 'Pricing'         },
  { id: 'payments',        label: 'Paiements'       },
  { id: 'wallets',         label: 'Portefeuilles'   },
  { id: 'drivers',         label: 'Chauffeurs'      },
  { id: 'riders',          label: 'Passagers'       },
  { id: 'onboarding',      label: 'Onboarding'      },
  { id: 'support',         label: 'Support'         },
  { id: 'promo',           label: 'Promos'          },
  { id: 'roadmap',         label: 'Roadmap'         },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <div className="admin-shell">
          <nav className="sidebar" aria-label="Navigation admin">
            <div className="sidebar-brand">
              <span className="sidebar-wordmark">orbi</span>
              <span className="sidebar-badge">ops</span>
            </div>
            <ul className="sidebar-nav" role="list">
              {NAV_SECTIONS.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`} className="sidebar-link">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="sidebar-footer">
              <span className="sidebar-env-pill">terrain · Burkina Faso</span>
            </div>
          </nav>

          <div className="admin-body">
            <header className="topbar">
              <div className="topbar-left">
                <span className="topbar-title">Centre d&apos;opérations</span>
                <span className="topbar-sep" aria-hidden="true">·</span>
                <span className="topbar-sub">Ouagadougou, Burkina Faso</span>
              </div>
              <div className="topbar-right">
                <span className="topbar-live-dot" aria-hidden="true" />
                <span className="topbar-live-label">Système actif</span>
                <div className="topbar-avatar" title="Compte admin" aria-label="Compte admin">A</div>
              </div>
            </header>
            <div className="admin-content">
              {children}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
