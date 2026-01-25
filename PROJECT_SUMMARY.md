# Massage Therapist Directory - Project Summary

## Project Overview
**Name:** MassageNearMe  
**Type:** Nationwide massage therapist directory with zip code search  
**Architecture:** Option B - Separate Frontend PWA + Backend API  
**Hosting:** Railway (Pro Plan)  
**Domain Plan:** massage.aiappspro.com or findmassage.aiappspro.com

---

## Business Model
- **Consumer side:** Free search and browse
- **Therapist side:** Freemium subscription
  - Free: Basic listing, contact info, 3 services max
  - Pro ($49/mo): Online booking, calendar, SMS reminders, 10 services
  - Premium ($99/mo): CRM, analytics, marketing tools, unlimited services, featured listing

**Target Market:** 321,000 US massage therapists, 72% without software platforms

---

## Technical Stack

### Backend API (Service 1)
- **Runtime:** Node.js + Express
- **Database:** PostgreSQL (for geo queries)
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **Payments:** Stripe subscriptions
- **Security:** Helmet, CORS, Rate limiting

### Frontend PWA (Service 2)
- **Type:** Static HTML/CSS/JS PWA
- **Fonts:** DM Sans + Fraunces (Google Fonts)
- **Icons:** Material Icons Round
- **Style:** Large fonts, full-width, teal/green wellness theme

---

## Files Created

### API Structure (`/api`)
```
api/
├── server.js              ✅ Main Express server
├── package.json           ✅ Dependencies
├── railway.json           ✅ Railway deployment config
├── .env.example           ✅ Environment template
├── db/
│   ├── schema.sql         ✅ Full PostgreSQL schema
│   └── import-zipcodes.js ✅ US zip code import script
├── routes/
│   ├── auth.js            ✅ Login/Register/Me
│   ├── search.js          ✅ Zip code radius search
│   ├── therapists.js      ✅ Profile CRUD, services, availability
│   ├── bookings.js        ✅ Create/manage appointments
│   ├── services.js        ✅ Service types
│   └── payments.js        ✅ Stripe subscriptions
└── middleware/
    └── auth.js            ✅ JWT verification
```

### Frontend Structure (`/frontend`)
```
frontend/
├── index.html             ✅ Landing page with search
├── search.html            ✅ Search results page
├── therapist.html         ✅ Individual profile page
├── login.html             ✅ Login/Register page
├── dashboard.html         ✅ Therapist dashboard
├── manifest.json          ✅ PWA manifest
├── sw.js                  ✅ Service worker
├── static.json            ✅ Railway static config
├── css/
│   ├── styles.css         ✅ Main styles (large fonts, wellness theme)
│   ├── search.css         ✅ Search results styles
│   ├── therapist.css      ✅ Profile page styles
│   ├── auth.css           ✅ Auth page styles
│   └── dashboard.css      ✅ Dashboard styles
├── js/
│   ├── config.js          ✅ API config + helpers (auto-detect URL)
│   ├── app.js             ✅ Common functionality
│   ├── home.js            ✅ Homepage logic
│   ├── search.js          ✅ Search results logic
│   ├── therapist.js       ✅ Profile page logic
│   ├── auth.js            ✅ Login/register logic
│   └── dashboard.js       ✅ Therapist dashboard logic
└── images/
    ├── icon.svg           ✅ Source icon
    ├── icon-72.png        ✅ 72x72 icon
    ├── icon-96.png        ✅ 96x96 icon
    ├── icon-128.png       ✅ 128x128 icon
    ├── icon-144.png       ✅ 144x144 icon
    ├── icon-152.png       ✅ 152x152 icon
    ├── icon-192.png       ✅ 192x192 icon
    ├── icon-384.png       ✅ 384x384 icon
    └── icon-512.png       ✅ 512x512 icon
```

---

## Database Schema Highlights

### Core Tables
- **users** - All users (consumers + therapists)
- **therapists** - Therapist profiles with lat/long
- **zip_codes** - US zip code reference (~42K records)
- **service_types** - 15 massage types pre-seeded
- **therapist_services** - Services each therapist offers
- **therapist_availability** - Weekly schedule
- **bookings** - Appointments
- **reviews** - Ratings & reviews
- **subscription_plans** - Free/Pro/Premium tiers

### Key Features
- PostGIS-style geo queries using `earthdistance` extension
- Automatic rating calculation trigger
- UUID primary keys
- Subscription tier enforcement

---

## API Endpoints Summary

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `GET /api/auth/me` - Verify token, get user

### Search
- `GET /api/search?zip=&radius=&service=` - Find therapists
- `GET /api/search/zip-suggest?q=` - Autocomplete
- `GET /api/search/nearby-cities?zip=` - Related locations

### Therapists
- `GET /api/therapists/:id` - Public profile
- `PUT /api/therapists/profile` - Update own profile
- `POST /api/therapists/services` - Add service
- `POST /api/therapists/availability` - Set schedule
- `GET /api/therapists/dashboard/stats` - Dashboard data

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings/availability/:therapistId/:date` - Available slots
- `GET /api/bookings/therapist` - Therapist's bookings
- `PATCH /api/bookings/:id/status` - Update status

### Payments
- `GET /api/payments/plans` - List plans
- `POST /api/payments/create-checkout` - Stripe checkout
- `POST /api/payments/webhook` - Stripe webhooks
- `GET /api/payments/subscription` - Current plan
- `POST /api/payments/portal` - Billing portal

---

## Environment Variables Needed

```env
# Server
PORT=3001
NODE_ENV=production

# Database (Railway auto-provides)
DATABASE_URL=postgresql://...

# Auth
JWT_SECRET=generate-64-char-random-string

# Frontend URL
FRONTEND_URL=https://massage.aiappspro.com

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Optional: Twilio for SMS
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx
```

---

## Railway Deployment Plan

### Service 1: API
- **Name:** massage-api
- **Type:** Node.js
- **Root Directory:** /api
- **Build:** `npm install`
- **Start:** `node server.js`
- **Domain:** api-massage.aiappspro.com

### Service 2: Frontend
- **Name:** massage-frontend
- **Type:** Static Site
- **Root Directory:** /frontend
- **Domain:** massage.aiappspro.com

### Service 3: Database
- **Type:** PostgreSQL
- **Connect to:** massage-api service

---

## What's Still Needed

### Deployment Steps
1. ✅ All code complete - ready for deployment
2. ⏳ Deploy to Railway (follow README.md)
3. ⏳ Configure environment variables
4. ⏳ Run database schema
5. ⏳ Import US zip code data
6. ⏳ Configure Stripe products & webhooks
7. ⏳ Set up custom domain DNS

### Optional Enhancements
- Pricing page (pricing.html)
- Therapist onboarding wizard
- Image upload to S3/Cloudinary
- Email notifications (SendGrid)
- SMS reminders (Twilio)
- Admin dashboard
- Analytics integration
- SEO optimization

---

## User Preferences (from memory)
- Large fonts for better visibility
- Full-width layouts
- Dark theme option
- Debug flow: Database → API → JS → HTML
- Test API in browser first
- Use `findstr` for file verification
- Add `console.log` early in debugging
- Hard refresh after deploy

---

## Quick Continue Prompt

Copy this to continue in new chat:

```
I'm building a Massage Therapist Directory PWA. Here's the status:

**Completed:**
- Backend API (Node.js/Express/PostgreSQL) - all routes done
- Database schema with geo queries
- Frontend: index.html, search.html (structure only)
- CSS: main styles.css, search.css
- JS: config.js, app.js, home.js

**Need to complete:**
1. search.js - Search results page functionality
2. therapist.js - Profile page JS
3. auth.js - Login/register JS  
4. dashboard.js - Therapist dashboard JS
5. manifest.json + sw.js for PWA
6. Railway deployment setup

**Tech:** Node.js + Express + PostgreSQL backend, Static HTML/CSS/JS PWA frontend
**Hosting:** Railway Pro plan
**Domain:** massage.aiappspro.com

Please continue building from where we left off.
```

---

## File Locations
All files are in: `/home/claude/massage-directory/`
- API: `/home/claude/massage-directory/api/`
- Frontend: `/home/claude/massage-directory/frontend/`
