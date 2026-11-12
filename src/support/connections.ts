// Every outside service Keyholder connects to, for the dashboard's Connections page. Shared by the server
// (server/keys.ts: where keys are kept, how each one is tested) and the page itself (the browser-only
// preview shows the same list with sample statuses). Keys can be set in Render or saved on the page.

export type ServiceId = 'google' | 'email' | 'places' | 'stripe' | 'flinks' | 'avm';
export interface ServiceInfo { id: ServiceId; name: string; group: 'now' | 'coming'; what: string; howTo: string }
export interface KeyField { name: string; service: ServiceId; label: string; secret: boolean; env: string; options?: string[]; hint?: string; optional?: boolean }
/** How a service stands: working, keys saved for a feature still being built, email kept in the outbox, or nothing set. */
export type ServiceState = 'connected' | 'saved' | 'off' | 'none';

export const SERVICES: ServiceInfo[] = [
  { id: 'google', name: 'Google sign-in', group: 'now', what: '"Continue with Google" on Sign in and Sign up.',
    howTo: 'Google Cloud console → APIs & Services → Credentials → your OAuth client ID. Its redirect URI must be your site address followed by /api/auth/google/callback.' },
  { id: 'email', name: 'Email (Resend)', group: 'now', what: 'Receipts, reminders, password links and support replies.',
    howTo: 'resend.com → Domains: add your domain and the DNS records it shows → API Keys: create a key. Paste it here and set Sending to resend.' },
  { id: 'places', name: 'Address lookup (Google Places)', group: 'now', what: 'Suggests Canadian addresses while a landlord types a property address, and fills in the city, province and postal code.',
    howTo: 'Google Cloud console (the same project as Google sign-in) → APIs & Services → Library → turn on "Places API (New)" → Credentials → Create credentials → API key → limit it to Places API (New). Paste it here.' },
  { id: 'stripe', name: 'Stripe payments', group: 'coming', what: 'Card payments for the Landlord plan, with promo codes at checkout.',
    howTo: 'stripe.com → Developers → API keys. Start with the test keys (pk_test_, sk_test_). The webhook secret comes once payments are built.' },
  { id: 'flinks', name: 'Bank data (Flinks)', group: 'coming', what: "Spotting rent, bills and mortgage payments in landlords' Canadian banks. View only: it can never move money.",
    howTo: 'flinks.com → talk to sales for a contract (needed for real banks). For testing, Flinks gives a Customer ID for its sandbox instance, "toolbox".' },
  { id: 'avm', name: 'Property values (AVM)', group: 'coming', what: 'An estimated market value for each property, updated monthly. Until a provider is connected, values are estimated from the purchase price and a market index.',
    howTo: 'Choose a provider (recommended: Repliers Estimates to start, Teranet for lender-grade values, RPS for rent estimates too), sign up with them, then pick it here and paste its API key.' },
];

export const KEY_FIELDS: KeyField[] = [
  { name: 'google.clientId', service: 'google', label: 'Client ID', secret: false, env: 'GOOGLE_CLIENT_ID', hint: 'Ends with .apps.googleusercontent.com' },
  { name: 'google.clientSecret', service: 'google', label: 'Client secret', secret: true, env: 'GOOGLE_CLIENT_SECRET' },
  { name: 'email.provider', service: 'email', label: 'Sending', secret: false, env: 'EMAIL_PROVIDER', options: ['log', 'resend', 'postmark'] },
  { name: 'email.resendKey', service: 'email', label: 'Resend API key', secret: true, env: 'RESEND_API_KEY', hint: 'Starts with re_' },
  { name: 'email.from', service: 'email', label: 'From address', secret: false, env: 'EMAIL_FROM', hint: 'Keyholder <hello@your-domain>' },
  { name: 'email.postmarkToken', service: 'email', label: 'Postmark server token (only if you use Postmark)', secret: true, env: 'POSTMARK_TOKEN', optional: true },
  { name: 'places.apiKey', service: 'places', label: 'API key', secret: true, env: 'GOOGLE_PLACES_API_KEY', hint: 'Starts with AIza' },
  { name: 'stripe.publishableKey', service: 'stripe', label: 'Publishable key', secret: false, env: 'STRIPE_PUBLISHABLE_KEY', hint: 'Starts with pk_' },
  { name: 'stripe.secretKey', service: 'stripe', label: 'Secret key', secret: true, env: 'STRIPE_SECRET_KEY', hint: 'Starts with sk_ or rk_' },
  { name: 'stripe.webhookSecret', service: 'stripe', label: 'Webhook signing secret', secret: true, env: 'STRIPE_WEBHOOK_SECRET', hint: 'Starts with whsec_ (later)', optional: true },
  { name: 'flinks.customerId', service: 'flinks', label: 'Customer ID', secret: false, env: 'FLINKS_CUSTOMER_ID' },
  { name: 'flinks.instance', service: 'flinks', label: 'Instance', secret: false, env: 'FLINKS_INSTANCE', hint: 'toolbox for testing, or your instance name' },
  { name: 'flinks.apiSecret', service: 'flinks', label: 'API secret', secret: true, env: 'FLINKS_API_SECRET', optional: true },
  { name: 'avm.provider', service: 'avm', label: 'Provider', secret: false, env: 'AVM_PROVIDER', options: ['repliers', 'teranet', 'rps'] },
  { name: 'avm.apiKey', service: 'avm', label: 'API key', secret: true, env: 'AVM_API_KEY' },
];
export const fieldOf = (name: string) => KEY_FIELDS.find((f) => f.name === name);
/** Every environment variable that is an API key (they can also be set on the Connections page). */
export const KEY_ENV = KEY_FIELDS.map((f) => f.env);

export const STATE_LABEL: Record<ServiceState, string> = { connected: 'Connected', saved: 'Keys saved', off: 'Sending off', none: 'Not set' };
export const OPTION_LABEL: Record<string, string> = {
  log: 'Off (kept in the outbox)', resend: 'Resend', postmark: 'Postmark',
  repliers: 'Repliers Estimates', teranet: 'Teranet', rps: 'RPS Real Property Solutions',
};
