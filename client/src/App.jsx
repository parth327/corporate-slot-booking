import { Suspense, lazy } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ProtectedRoute, useAuth, roleHome } from './lib/auth.jsx';
import Spinner from './components/ui/Spinner.jsx';
import PublicShell from './components/layout/PublicShell.jsx';
import AppShell from './components/layout/AppShell.jsx';

// Public entry points load eagerly — they are the first thing most people hit.
import PublicRequest from './pages/public/PublicRequest.jsx';
import RequestSuccess from './pages/public/RequestSuccess.jsx';
import Reschedule from './pages/public/Reschedule.jsx';
import ScanRestricted from './pages/public/ScanRestricted.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';

// Role dashboards are split out; the guard scanner especially, since
// html5-qrcode is heavy and only one role ever needs it.
const AuthorityDashboard = lazy(() => import('./pages/authority/AuthorityDashboard.jsx'));
const RequestDetail = lazy(() => import('./pages/authority/RequestDetail.jsx'));
const RoomBoard = lazy(() => import('./pages/authority/RoomBoard.jsx'));
const GuardScan = lazy(() => import('./pages/guard/GuardScan.jsx'));
const GuardSearch = lazy(() => import('./pages/guard/GuardSearch.jsx'));
const GuardVisitor = lazy(() => import('./pages/guard/GuardVisitor.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminRooms = lazy(() => import('./pages/admin/AdminRooms.jsx'));
const AdminGatepasses = lazy(() => import('./pages/admin/AdminGatepasses.jsx'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs.jsx'));

// Standalone GSAP + Lenis scroll-choreography foundation — no relation to
// the GatePass app's own data/auth. Lazy and unwrapped by PublicShell on
// purpose: it owns its own full-bleed dark layout and its own Lenis
// instance, and mixing a second smooth-scroll library into the app's normal
// chrome would fight the rest of the site's scrolling.
const CinematicShowcase = lazy(() => import('./showcase/CinematicShowcase.jsx'));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" className="text-brand-500" />
    </div>
  );
}

/** Sends an already-authenticated visitor from /login to their own dashboard. */
function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Suspense fallback={<PageFallback />}>
        <Routes location={location} key={location.pathname}>
          {/* Public ------------------------------------------------------- */}
          <Route
            path="/"
            element={
              <PublicShell overHero>
                <PublicRequest />
              </PublicShell>
            }
          />
          <Route
            path="/request/success"
            element={
              <PublicShell>
                <RequestSuccess />
              </PublicShell>
            }
          />
          <Route
            path="/reschedule/:token"
            element={
              <PublicShell>
                <Reschedule />
              </PublicShell>
            }
          />
          <Route
            path="/scan/:token"
            element={
              <PublicShell narrow>
                <ScanRestricted />
              </PublicShell>
            }
          />
          <Route path="/showcase" element={<CinematicShowcase />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <PublicShell narrow>
                  <Login />
                </PublicShell>
              </RedirectIfAuthed>
            }
          />

          {/* Approval authority -------------------------------------------- */}
          <Route
            element={
              <ProtectedRoute roles={['AUTHORITY', 'ADMIN']}>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/authority" element={<AuthorityDashboard />} />
            <Route path="/authority/requests/:id" element={<RequestDetail />} />
            <Route path="/authority/rooms" element={<RoomBoard />} />
          </Route>

          {/* Security ------------------------------------------------------- */}
          <Route
            element={
              <ProtectedRoute roles={['GUARD', 'ADMIN']}>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/guard" element={<GuardScan />} />
            <Route path="/guard/search" element={<GuardSearch />} />
            <Route path="/guard/visitor/:id" element={<GuardVisitor />} />
          </Route>

          {/* Admin ---------------------------------------------------------- */}
          <Route
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/rooms" element={<AdminRooms />} />
            <Route path="/admin/gatepasses" element={<AdminGatepasses />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
          </Route>

          <Route
            path="*"
            element={
              <PublicShell>
                <NotFound />
              </PublicShell>
            }
          />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}
