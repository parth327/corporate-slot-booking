import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, AlertCircle, Mail, Lock } from 'lucide-react';
import { useAuth, roleHome } from '../lib/auth.jsx';
import { pageVariants } from '../lib/motion.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · GatePass';
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');

    const next = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'That does not look like an email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/login' ? from : roleHome(user.role), { replace: true });
    } catch (err) {
      setFormError(err.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <div className="mb-6 text-center">
        <h1 className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Staff sign in
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          For approval authorities, security and administrators.
        </p>
      </div>

      <Card accent>
        <CardBody>
          <form onSubmit={submit} noValidate className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <Input
              label="Email address"
              type="email"
              icon={Mail}
              required
              autoComplete="username"
              autoFocus
              placeholder="you@company.com"
              value={email}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="relative">
              <Input
                label="Password"
                type={show ? 'text' : 'password'}
                icon={Lock}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                error={errors.password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-[2.15rem] rounded-lg p-1.5 text-ink-400 transition-colors hover:text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Button type="submit" full size="lg" loading={submitting} icon={LogIn}>
              Sign in
            </Button>
          </form>
        </CardBody>
      </Card>

      {import.meta.env.DEV && (
        <p className="mt-4 text-center text-xs text-ink-400">
          Seeded demo hosts and guards use the password <code className="font-mono">Passw0rd!23</code>
        </p>
      )}
    </motion.div>
  );
}
