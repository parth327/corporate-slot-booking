import { useState } from 'react';
import { Mail, Phone, MessageCircle, Copy, Check } from 'lucide-react';
import cn from '../../lib/cn.js';
import { useToast } from '../../lib/toast.jsx';
import { mailHref, telHref, waHref } from '../../lib/format.js';

function ContactLink({ href, icon: Icon, label, value, external, className }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={cn(
        'flex min-h-[3rem] flex-1 items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2.5 transition-colors',
        'hover:border-brand-200 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className
      )}
    >
      <Icon size={16} className="shrink-0 text-brand-600" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
        <span className="block truncate text-xs font-medium text-ink-700">{value}</span>
      </span>
    </a>
  );
}

export default function VisitorContactBar({ gatepass: g, className }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const email = mailHref(g.visitor_email, `Your visit on ${g.requested_date}`);
  const tel = telHref(g.visitor_mobile);
  const wa = waHref(g.visitor_whatsapp || g.visitor_mobile, `Hello ${g.visitor_name}, regarding your visit`);

  const copyMobile = async () => {
    try {
      await navigator.clipboard.writeText(g.visitor_mobile);
      setCopied(true);
      toast.success('Number copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — please select the number manually.');
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Contact the visitor</p>
      <div className="flex flex-col gap-2">
        {email && <ContactLink href={email} icon={Mail} label="Email" value={g.visitor_email} />}
        {tel && (
          <div className="flex gap-2">
            <ContactLink href={tel} icon={Phone} label="Call" value={g.visitor_mobile} />
            <button
              type="button"
              onClick={copyMobile}
              aria-label="Copy mobile number"
              className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-400 transition-colors hover:border-brand-200 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
          </div>
        )}
        {wa && (
          <ContactLink
            href={wa}
            icon={MessageCircle}
            label="WhatsApp"
            value={g.visitor_whatsapp || g.visitor_mobile}
            external
          />
        )}
      </div>
    </div>
  );
}
