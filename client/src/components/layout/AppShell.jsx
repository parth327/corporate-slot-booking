import { Outlet } from 'react-router-dom';
import AmbientBackground from './AmbientBackground.jsx';
import SideNav from './SideNav.jsx';
import TopBar from './TopBar.jsx';
import MobileNav from './MobileNav.jsx';

export default function AppShell({ children }) {
  return (
    <div className="relative min-h-screen bg-ink-50">
      <AmbientBackground variant="subtle" />
      <SideNav />
      <div className="lg:pl-64">
        <TopBar />
        {/* Bottom padding clears the mobile nav bar. */}
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
          {children ?? <Outlet />}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
