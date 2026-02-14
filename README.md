# Test Flux Full Product

This project converts the MVP landing concept into a full-stack product with:

- Working landing page sections (Capabilities, Roadmap, Pricing, Waitlist)
- Authentication (register, login, profile, logout)
- Frontend validation (Zod + react-hook-form)
- Backend validation (Zod middleware)
- Persistent data storage (SQLite)
- Chrome extension flow recorder
- Flow -> Playwright/Cypress transformer with selector mapping
- Simple test execution dashboard for recorded flows

## Project Structure

- `frontend/` React + Vite app
- `backend/` Express API + SQLite
- `chrome-extension/` Chrome MV3 recorder extension

## Setup

1. Backend
   - `cd backend`
   - `Copy-Item .env.example .env`
   - `npm install`
   - `npm run dev`

2. Frontend
   - `cd frontend`
   - `Copy-Item .env.example .env`
   - `npm install`
   - `npm run dev`

## API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/waitlist`
- `GET /api/waitlist` (admin only)
- `POST /api/flows` (create recorded flow)
- `GET /api/flows` (list user flows)
- `GET /api/flows/:id` (flow details + runs)
- `POST /api/flows/:id/transform` (framework: playwright|cypress)
- `POST /api/flows/:id/run` (simple execution simulation)

## Chrome Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked extension from `chrome-extension/`
4. Start recording from popup, stop, then:
   - copy JSON into dashboard Flow Recorder input, or
   - send directly to API with JWT token

## MySQL Schema (Optional)

If you want MySQL storage (e.g., XAMPP + TablePlus), run:

- `backend/sql/mysql/testflux_ai_schema.sql`

This script creates append-only tables for:

1. Signup (`users`)
2. Sign in verification/audit (`signin_events`)
3. Test Flux Script Engine (`script_engine_runs`)
4. Self-Healing Engine (`self_healing_runs`)
