# Multi-Tenant Architecture for Aspire Sports Franchises

This document outlines the architectural considerations and implementation path for supporting multiple Aspire Sports franchises or branches.

## Current Foundation

The database already has multi-tenant foundations in place:

### Existing Schema

```
organizations
├── id (uuid)
├── name (e.g., "Aspire Sports Columbus")
├── slug (e.g., "aspire-columbus")
├── logoUrl
├── settings (jsonb) ← Brand customization goes here
├── stripeAccountId ← For Stripe Connect
└── timestamps

locations
├── id (uuid)
├── organizationId → organizations.id
├── name (e.g., "Powell")
├── slug (e.g., "powell")
├── address fields
├── coordinates (lat/lng)
├── timezone
├── settings (jsonb)
└── timestamps
```

## Multi-Tenant Models

### Model 1: Single Organization, Multiple Locations (Current)
- One Aspire Sports organization
- Multiple physical locations (Powell, Dublin, Delaware)
- Shared sports catalog, age groups, pricing rules
- Location-specific programs and schedules
- **Best for:** Regional expansion under one brand

### Model 2: Franchise Model (Multiple Organizations)
- Multiple independent organizations
- Each franchise has own branding, pricing, settings
- Optional shared resources (sports catalog templates)
- Independent payment processing (Stripe Connect)
- **Best for:** Franchise licensing, white-label deployments

### Model 3: Hybrid Model
- Master organization (Aspire Sports HQ)
- Child organizations (franchises)
- Shared core catalog, customizable locally
- Revenue splitting between HQ and franchises
- **Best for:** Franchise with centralized control

---

## Implementation Enhancements

### 1. Organization Settings Schema

Extend the `settings` jsonb column to support branding:

```typescript
interface OrganizationSettings {
  branding: {
    primaryColor: string        // e.g., "#cc442c"
    secondaryColor: string
    accentColor: string
    logoUrl: string
    faviconUrl: string
    fontFamily?: string
  }
  contact: {
    email: string
    phone: string
    address: string
  }
  social: {
    facebook?: string
    instagram?: string
    twitter?: string
  }
  features: {
    enableDeposits: boolean
    enableWaivers: boolean
    enableTeamManagement: boolean
    enableCoachPortal: boolean
  }
  payments: {
    stripeAccountId: string      // Stripe Connect account
    platformFeePercent: number   // Fee to parent org (franchise model)
    currency: string
  }
  domains: {
    primary: string              // e.g., "aspiresportspowell.com"
    aliases: string[]            // Additional domains
  }
}
```

### 2. Domain Routing

Support custom domains and subdomains per organization/location:

```typescript
// Middleware to detect organization from domain
export function getOrganizationFromHost(host: string): Organization | null {
  // Priority 1: Custom domain mapping
  // aspiresportspowell.com → Powell org

  // Priority 2: Subdomain pattern
  // powell.aspiresports.com → Powell location

  // Priority 3: Default to main organization
  // aspiresports.com → Main Aspire org
}

// Astro middleware
export const onRequest = async (context, next) => {
  const org = await getOrganizationFromHost(context.request.headers.get('host'))
  context.locals.organization = org
  context.locals.branding = org?.settings?.branding
  return next()
}
```

### 3. Stripe Connect Integration

Enable franchise payment splitting:

```typescript
// Create connected account for franchise
const account = await stripe.accounts.create({
  type: 'standard',
  country: 'US',
  email: 'franchise@example.com',
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
})

// Payment with automatic split
const paymentIntent = await stripe.paymentIntents.create({
  amount: 10000, // $100.00
  currency: 'usd',
  application_fee_amount: 500, // $5.00 to platform
  transfer_data: {
    destination: franchiseStripeAccountId,
  },
})
```

### 4. Database Schema Additions

```sql
-- Domain mappings table
CREATE TABLE domain_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  location_id UUID REFERENCES locations(id), -- Optional, for location-specific
  is_primary BOOLEAN DEFAULT false,
  ssl_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organization relationships (for franchise hierarchy)
CREATE TABLE organization_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_org_id UUID REFERENCES organizations(id),
  child_org_id UUID REFERENCES organizations(id),
  relationship_type VARCHAR(50) NOT NULL, -- 'franchise', 'subsidiary', 'partner'
  revenue_share_percent DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(parent_org_id, child_org_id)
);

-- Shared resources catalog
CREATE TABLE resource_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_org_id UUID REFERENCES organizations(id), -- HQ owns templates
  resource_type VARCHAR(50) NOT NULL, -- 'sport', 'age_group', 'waiver'
  name VARCHAR(255) NOT NULL,
  config JSONB,
  is_public BOOLEAN DEFAULT false, -- Available to child orgs
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 5. User Account Models

#### Option A: Unified Accounts
- Users have one account across all organizations
- Can register children at any location/franchise
- Single sign-on experience

```typescript
// user_organization_access
user_id → users.id
organization_id → organizations.id
role: 'parent' | 'coach' | 'admin'
```

#### Option B: Siloed Accounts
- Separate accounts per organization
- Better data isolation
- Simpler privacy compliance

#### Option C: Federated (Recommended)
- Core account (email, password)
- Organization-specific profiles
- Users can link accounts if desired

### 6. Data Isolation Patterns

```typescript
// Row-Level Security approach
// All queries automatically scoped to organization

// Option 1: Query wrapper
const getSeasons = (orgId: string) =>
  db.select().from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .where(eq(programs.organizationId, orgId))

// Option 2: Database views per org
// CREATE VIEW org_abc_seasons AS
//   SELECT * FROM seasons WHERE org_id = 'abc'

// Option 3: Separate schemas (highest isolation)
// schema_aspire_powell.seasons
// schema_aspire_dublin.seasons
```

---

## Migration Path

### Phase 1: Foundation (Current State)
- ✅ Organizations and locations tables
- ✅ Location-aware UI components
- ✅ Location selector in navigation

### Phase 2: Branding Customization
1. Extend organization settings schema
2. Create CSS variable injection from settings
3. Build organization settings admin page
4. Support custom logo upload

### Phase 3: Domain Routing
1. Add domain_mappings table
2. Create middleware for domain detection
3. Configure Netlify for custom domains
4. SSL certificate automation

### Phase 4: Stripe Connect
1. Enable Stripe Connect in dashboard
2. Build franchise onboarding flow
3. Implement payment splitting
4. Add revenue reporting for HQ

### Phase 5: Franchise Management
1. Organization hierarchy support
2. Resource template sharing
3. Franchise admin portal
4. Cross-org reporting

---

## Technical Considerations

### Performance
- Cache organization lookups by domain
- Consider edge caching for static assets per org
- Lazy load org-specific settings

### Security
- Strict organization scoping on all queries
- Separate API keys per organization
- Audit logging for cross-org access

### Compliance
- Data residency options (per org)
- GDPR: right to deletion scoped to org
- Consent management per organization

### Deployment
- Single codebase, multi-tenant deployment
- Environment variables for shared secrets
- Organization-specific configs in database

---

## Example: Adding a New Franchise

```typescript
// 1. Create organization
const newOrg = await db.insert(organizations).values({
  name: "Aspire Sports Cleveland",
  slug: "aspire-cleveland",
  settings: {
    branding: {
      primaryColor: "#cc442c",
      // ... customize colors
    },
    payments: {
      platformFeePercent: 10, // 10% to HQ
    }
  }
})

// 2. Create Stripe Connect account
const stripeAccount = await createConnectedAccount(newOrg.id)

// 3. Set up domain mapping
await db.insert(domainMappings).values({
  domain: "aspiresportscleveland.com",
  organizationId: newOrg.id,
  isPrimary: true,
})

// 4. Create initial locations
await db.insert(locations).values([
  { organizationId: newOrg.id, name: "Downtown Cleveland", ... },
  { organizationId: newOrg.id, name: "Westlake", ... },
])

// 5. Copy resource templates from HQ
await copyResourceTemplates(hqOrgId, newOrg.id)
```

---

## Heyday Athletic Comparison

Based on analysis of heydayathletic.com:

| Feature | Heyday | Aspire (Proposed) |
|---------|--------|-------------------|
| Multi-region | ✅ (5 regions) | ✅ (Location selector) |
| Region-specific login | ✅ | ⏳ (Unified with org context) |
| Region filtering | ✅ | ✅ |
| Custom domains | Unknown | ⏳ Phase 3 |
| Independent branding | Unknown | ⏳ Phase 2 |
| Payment splitting | Unknown | ⏳ Phase 4 |

---

## Next Steps

1. **Immediate**: Continue using single-org, multi-location model
2. **When needed**: Implement branding customization (Phase 2)
3. **Franchise interest**: Full multi-org implementation (Phase 3-5)

The current architecture supports growth without requiring major refactoring. The location selector and organization foundation allow for graceful evolution into a full franchise model.
