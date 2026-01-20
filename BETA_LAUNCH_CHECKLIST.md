# Beta Launch Setup Checklist

This document outlines all the external services and configuration needed to get Aspire Sports fully functional.

---

## 1. Database (Railway PostgreSQL)

- [ ] **Create Railway account** - https://railway.app
- [ ] **Create PostgreSQL database** - New Project → Add PostgreSQL
- [ ] **Get DATABASE_URL** - Copy connection string from Railway dashboard (Variables tab)
- [ ] **Run schema push** - `npm run db:push`
- [ ] **Run seed** - `npm run db:seed` (creates roles, default org, sports, age groups)

**Troubleshooting:**
- If schema push fails, check that your IP is allowed in Railway's network settings
- The seed creates: 5 roles, default organization, 4 sports, 6 age groups

---

## 2. Email (Resend)

- [ ] **Create Resend account** - https://resend.com
- [ ] **Verify your domain** - Settings → Domains → Add DNS records
- [ ] **Create API key** - API Keys → Create API Key
- [ ] **Set environment variables:**
  - `RESEND_API_KEY=re_...`
  - `RESEND_FROM_EMAIL=noreply@yourdomain.com`

**Enables:**
- Password reset emails
- Email verification
- Registration confirmation emails

**Testing:**
- Resend provides a test domain for development: `onboarding@resend.dev`
- Check Resend dashboard for email delivery logs

---

## 3. Payments (Stripe)

- [ ] **Create Stripe account** - https://stripe.com
- [ ] **Get test API keys** - Developers → API Keys
  - `STRIPE_SECRET_KEY=sk_test_...`
  - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
- [ ] **Set up webhook endpoint:**
  - Go to Developers → Webhooks → Add endpoint
  - URL: `https://your-site.com/api/stripe/webhook`
  - Events to listen for:
    - `checkout.session.completed`
    - `payment_intent.succeeded`
    - `payment_intent.payment_failed`
    - `charge.refunded`
- [ ] **Get webhook secret** - `STRIPE_WEBHOOK_SECRET=whsec_...`

**Enables:**
- Registration payments
- Payment tracking
- Refund processing

**Local Testing:**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local dev server
stripe listen --forward-to localhost:4321/api/stripe/webhook
```

**Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires auth: `4000 0025 0000 3155`

---

## 4. Image Upload (Cloudinary)

- [ ] **Create Cloudinary account** - https://cloudinary.com
- [ ] **Get credentials from Dashboard:**
  - `CLOUDINARY_CLOUD_NAME=...`
  - `CLOUDINARY_API_KEY=...`
  - `CLOUDINARY_API_SECRET=...`

**Enables:**
- Profile photo uploads
- Team logos
- Player photos

**Optional:** Set up upload presets for automatic transformations

---

## 5. Hosting (Netlify)

- [ ] **Connect GitHub repo** - https://app.netlify.com → Add new site → Import from Git
- [ ] **Configure build settings:**
  - Build command: `npm run build`
  - Publish directory: `dist`
- [ ] **Add environment variables** - Site settings → Environment variables
- [ ] **Generate AUTH_SECRET:**
  ```bash
  openssl rand -base64 32
  ```
- [ ] **Set PUBLIC_APP_URL** - Your Netlify URL (e.g., `https://aspire-sports.netlify.app`)

**After first deploy:**
- [ ] Update Stripe webhook URL with production domain
- [ ] Verify all environment variables are set

---

## 6. Domain (Optional but Recommended)

- [ ] **Purchase/configure domain**
- [ ] **Add to Netlify** - Domain settings → Add custom domain
- [ ] **Configure DNS:**
  - Add CNAME record pointing to Netlify
  - Or use Netlify DNS
- [ ] **Add domain to Resend** - For email deliverability
- [ ] **Update Stripe webhook URL** - With production domain
- [ ] **Update PUBLIC_APP_URL** - With production domain

---

## Environment Variables Summary

Add all of these to Netlify (and your local `.env` file):

```env
# Database (Railway PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# Auth
AUTH_SECRET=your-random-32-character-secret-here

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend (Email)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Cloudinary (Photo Upload)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# App
PUBLIC_APP_URL=https://your-site.com
```

---

## Post-Setup Verification

Run through these tests after completing setup:

### Authentication
- [ ] Create a new account (signup)
- [ ] Verify email verification email arrives
- [ ] Complete email verification
- [ ] Sign out and sign back in
- [ ] Test "Forgot Password" flow
- [ ] Verify password reset email arrives

### Payments
- [ ] Navigate to a program with open registration
- [ ] Start registration flow
- [ ] Complete payment with test card `4242 4242 4242 4242`
- [ ] Verify registration status updates to "confirmed"
- [ ] Check Stripe dashboard for payment record

### Admin Functions
- [ ] Login as admin user
- [ ] Create a new program
- [ ] Create a new season
- [ ] View registrations list
- [ ] Process a test refund

### Coach Functions
- [ ] Login as coach user
- [ ] View assigned teams
- [ ] Take attendance for a practice
- [ ] View player development tracking

### Parent Functions
- [ ] Login as parent user
- [ ] View family members
- [ ] View registration history
- [ ] Check schedule/calendar

---

## First Admin User

After running the seed, create your admin user:

1. Sign up normally through the app
2. Use Railway's database GUI or run SQL to assign admin role:

```sql
-- Find your user ID
SELECT id, email FROM users WHERE email = 'your@email.com';

-- Find super_admin role ID
SELECT id FROM roles WHERE name = 'super_admin';

-- Assign role (replace IDs)
INSERT INTO user_roles (user_id, role_id, scope_type)
VALUES ('your-user-id', 'super-admin-role-id', 'global');
```

Or use Drizzle Studio: `npm run db:studio`

---

## Troubleshooting

### Emails not sending
1. Check Resend dashboard for errors
2. Verify domain DNS records are correct
3. Check `RESEND_FROM_EMAIL` matches verified domain

### Payments failing
1. Check Stripe dashboard for error details
2. Verify webhook is receiving events
3. Check server logs for webhook handler errors

### Database connection issues
1. Verify `DATABASE_URL` is correct
2. Check Railway project is running
3. Verify IP allowlist if applicable

### Build failures on Netlify
1. Check all environment variables are set
2. Verify build logs for missing dependencies
3. Ensure `DATABASE_URL` is available at build time

---

## Going Live Checklist

Before switching from test to production:

- [ ] Switch Stripe to live keys (`sk_live_...`, `pk_live_...`)
- [ ] Create new webhook with live endpoint
- [ ] Update `STRIPE_WEBHOOK_SECRET` with live secret
- [ ] Test one real payment (refund immediately)
- [ ] Set up error monitoring (Sentry recommended)
- [ ] Configure database backups in Railway
- [ ] Document admin credentials securely
