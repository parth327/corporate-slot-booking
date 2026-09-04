import { NavLink } from 'react-router-dom';
import cn from '../../lib/cn.js';
import { useAuth } from '../../lib/auth.jsx';
import { navFor } from '../../lib/constants.js';

export default function MobileNav() {
  const { user } = useAuth();
  const items = navFor(user?.role).slice(0, 4);
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-2 pt-2 text-[11px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                isActive ? 'font-medium text-brand-700' : 'text-ink-400'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} className={cn('shrink-0', isActive && 'text-brand-600')} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
