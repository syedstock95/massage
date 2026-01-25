# MassageNearMe - Deployment Guide

## Project Structure

```
massage-directory/
├── api/                    # Backend API (Node.js + Express + PostgreSQL)
│   ├── server.js          # Main server
│   ├── package.json       # Dependencies
│   ├── railway.json       # Railway deployment config
│   ├── .env.example       # Environment template
│   ├── db/
│   │   ├── schema.sql     # Database schema
│   │   └── import-zipcodes.js  # Zip code data import
│   ├── routes/            # API routes
│   └── middleware/        # Auth middleware
│
└── frontend/              # Frontend PWA (Static HTML/CSS/JS)
    ├── index.html         # Landing page
    ├── search.html        # Search results
    ├── therapist.html     # Profile page
    ├── login.html         # Auth page
    ├── dashboard.html     # Therapist dashboard
    ├── manifest.json      # PWA manifest
    ├── sw.js              # Service worker
    ├── static.json        # Railway static config
    ├── css/               # Stylesheets
    ├── js/                # JavaScript
    └── images/            # Icons & images
```

---

## Railway Deployment

### Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Create a new project
3. You'll create 3 services: Database, API, Frontend

### Step 2: Add PostgreSQL Database

1. Click "New" → "Database" → "PostgreSQL"
2. Railway will provision and configure automatically
3. The `DATABASE_URL` will be available to other services

### Step 3: Deploy API Service

1. Click "New" → "GitHub Repo" (or "Empty Service" for manual deploy)
2. Configure:
   - **Root Directory:** `/api`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`

3. Set Environment Variables:
   ```
   NODE_ENV=production
   JWT_SECRET=<generate-64-char-random-string>
   FRONTEND_URL=https://massage.aiappspro.com
   STRIPE_SECRET_KEY=sk_live_xxx (or sk_test_xxx)
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```
   
   Note: DATABASE_URL is auto-injected by Railway when you link the PostgreSQL service

4. Generate domain or add custom domain:
   - Railway domain: `massage-api-xxx.railway.app`
   - Custom: `api-massage.aiappspro.com`

### Step 4: Initialize Database

After API deploys, run in Railway shell:

```bash
# Initialize schema
psql $DATABASE_URL < db/schema.sql

# Import zip code data
npm run db:import-zips
```

Or use Railway's web terminal.

### Step 5: Deploy Frontend Service

1. Click "New" → "GitHub Repo" or "Empty Service"
2. Configure:
   - **Root Directory:** `/frontend`
   - Railway auto-detects as static site

3. Generate domain or add custom domain:
   - Railway domain: `massage-frontend-xxx.railway.app`
   - Custom: `massage.aiappspro.com`

---

## Custom Domain Setup (aiappspro.com)

### DNS Configuration

Add these DNS records in your domain registrar:

```
Type    Name          Value
CNAME   massage       <railway-frontend-domain>
CNAME   api-massage   <railway-api-domain>
```

### Railway Custom Domain

1. Go to API service → Settings → Networking → Custom Domain
2. Add: `api-massage.aiappspro.com`
3. Go to Frontend service → Settings → Networking → Custom Domain
4. Add: `massage.aiappspro.com`

---

## Environment Variables Reference

### API (.env)

```env
# Server
PORT=3001
NODE_ENV=production

# Database (auto-provided by Railway)
DATABASE_URL=postgresql://...

# Auth
JWT_SECRET=your-super-secret-64-char-key-here-change-this

# Frontend URL (for CORS)
FRONTEND_URL=https://massage.aiappspro.com

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Optional: Twilio SMS
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx
```

### Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

1. **Clone & Install**
   ```bash
   cd api && npm install
   cd ../frontend
   ```

2. **Create Database**
   ```bash
   createdb massage_directory
   psql massage_directory < api/db/schema.sql
   ```

3. **Configure Environment**
   ```bash
   cp api/.env.example api/.env
   # Edit .env with your local settings
   ```

4. **Import Zip Codes**
   ```bash
   cd api && npm run db:import-zips
   ```

5. **Start API**
   ```bash
   cd api && npm run dev
   ```

6. **Serve Frontend** (in another terminal)
   ```bash
   cd frontend
   npx serve -l 3000
   # Or use VS Code Live Server
   ```

7. Open http://localhost:3000

---

## Stripe Setup

### Create Products

1. Go to Stripe Dashboard → Products
2. Create three products:
   - **Free Listing** - $0/mo
   - **Pro** - $49/mo  
   - **Premium** - $99/mo

3. Copy the Price IDs (e.g., `price_xxx`)

4. Update `subscription_plans` table:
   ```sql
   UPDATE subscription_plans SET stripe_price_id_monthly = 'price_xxx' WHERE id = 'pro';
   UPDATE subscription_plans SET stripe_price_id_monthly = 'price_yyy' WHERE id = 'premium';
   ```

### Create Webhook

1. Go to Stripe → Developers → Webhooks
2. Add endpoint: `https://api-massage.aiappspro.com/api/payments/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

---

## API Endpoints

### Public
- `GET /health` - Health check
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/search?zip=&radius=` - Search therapists
- `GET /api/search/zip-suggest?q=` - Zip autocomplete
- `GET /api/therapists/:id` - Public profile
- `GET /api/services/types` - List massage types
- `GET /api/bookings/availability/:id/:date` - Available slots

### Protected (JWT required)
- `GET /api/auth/me` - Current user
- `PUT /api/therapists/profile` - Update profile
- `POST /api/therapists/services` - Add service
- `POST /api/therapists/availability` - Set hours
- `GET /api/therapists/dashboard/stats` - Dashboard data
- `POST /api/bookings` - Create booking
- `GET /api/bookings/therapist` - Therapist's bookings
- `PATCH /api/bookings/:id/status` - Update booking

### Payments
- `GET /api/payments/plans` - List plans
- `POST /api/payments/create-checkout` - Start checkout
- `POST /api/payments/webhook` - Stripe webhook
- `GET /api/payments/subscription` - Current plan
- `POST /api/payments/portal` - Billing portal

---

## Testing

### Test API

```bash
# Health check
curl http://localhost:3001/health

# Search
curl "http://localhost:3001/api/search?zip=77001&radius=25"

# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","firstName":"Test","lastName":"User","role":"therapist"}'
```

### Test PWA

1. Open Chrome DevTools
2. Go to Application tab
3. Check Service Worker status
4. Check Manifest
5. Try "Add to Home Screen"

---

## Troubleshooting

### API Issues

```bash
# Check logs in Railway
railway logs

# Test database connection
psql $DATABASE_URL -c "SELECT NOW()"

# Check if tables exist
psql $DATABASE_URL -c "\dt"
```

### Frontend Issues

- Hard refresh: Ctrl+Shift+R
- Clear service worker: DevTools → Application → Service Workers → Unregister
- Check console for CORS errors

### Common Errors

| Error | Solution |
|-------|----------|
| CORS error | Check FRONTEND_URL in API env |
| 401 Unauthorized | Check JWT_SECRET matches |
| Database error | Verify DATABASE_URL, run schema.sql |
| Stripe error | Check API keys, webhook secret |

---

## Performance Tips

1. **Enable Railway scaling** for Pro plan
2. **Add CDN** for static assets (Cloudflare)
3. **Enable PostgreSQL indexes** (already in schema)
4. **Use browser caching** (configured in static.json)

---

## Security Checklist

- [ ] Strong JWT_SECRET (64+ chars)
- [ ] HTTPS only (Railway provides)
- [ ] Rate limiting enabled
- [ ] Helmet headers enabled
- [ ] CORS properly configured
- [ ] Stripe webhooks validated
- [ ] Passwords hashed (bcrypt)
- [ ] SQL injection protected (parameterized queries)

---

## Support

- **Documentation:** This README
- **Issues:** Check Railway logs first
- **Updates:** Follow Anthropic's AI development

Built with ❤️ by Office Soft Solutions
