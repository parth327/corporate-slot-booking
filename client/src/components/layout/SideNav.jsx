import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import cn from '../../lib/cn.js';
import { useAuth } from '../../lib/auth.jsx';
import { navFor, ROLE_LABELS } from '../../lib/constants.js';
import { initials } from '../../lib/format.js';
import { reduceMotion } from '../../lib/motion.js';
import Logo from './Logo.jsx';

export default function SideNav() {
  const { user, logout } = useAuth();
  const items = navFor(user?.role);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-ink-100 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-ink-100 px-5">
        <Logo live />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-600 hover:bg-ink-50'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive &&
                  (reduceMotion ? (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600" />
                  ) : (
                    <motion.span
                      layoutId="sidenav-active"
                      className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ))}
                <Icon size={18} className="shrink-0" aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
            aria-hidden="true"
          >
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">{user?.name}</p>
            <p className="truncate text-xs text-ink-400">{ROLE_LABELS[user?.role] || user?.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <LogOut size={18} className="shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
