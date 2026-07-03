'use client';
import { useEffect, useState } from 'react';

const NAV_SECTIONS = [
  { id: 'overview',         label: "Vue d’ensemble" },
  { id: 'live-ops',         label: 'Live Ops'        },
  { id: 'trips-audit',      label: 'Trajets'         },
  { id: 'system-health',    label: 'Santé système'   },
  { id: 'launch-readiness', label: 'Prêt lancement'  },
  { id: 'feature-flags',    label: 'Feature Flags'   },
  { id: 'dispatch',         label: 'Dispatch'        },
  { id: 'pricing',          label: 'Pricing'         },
  { id: 'payments',         label: 'Paiements'       },
  { id: 'wallets',          label: 'Portefeuilles'   },
  { id: 'drivers',          label: 'Chauffeurs'      },
  { id: 'riders',           label: 'Passagers'       },
  { id: 'onboarding',       label: 'Onboarding'      },
  { id: 'support',          label: 'Support'         },
  { id: 'promo',            label: 'Promos'          },
  { id: 'roadmap',          label: 'Roadmap'         },
];

export function SidebarNav() {
  const [active, setActive] = useState('overview');

  useEffect(() => {
    function onScroll() {
      const scrollY = window.scrollY + 100;
      let current = NAV_SECTIONS[0].id;
      for (const { id } of NAV_SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top + window.scrollY <= scrollY) {
          current = id;
        }
      }
      setActive(current);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ul className="sidebar-nav" role="list">
      {NAV_SECTIONS.map(({ id, label }) => (
        <li key={id}>
          <a
            href={`#${id}`}
            className={`sidebar-link${active === id ? ' sidebar-link-active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
