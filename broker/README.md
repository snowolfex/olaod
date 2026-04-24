# oload auth broker

Minimal Google auth broker for downloadable oload installs.

Technical:

- The broker owns Google OAuth on a stable hosted domain and exchanges approved login requests back to local Oload instances through short-lived request IDs.

Layman's terms:

- This service acts like a middleman for Google sign-in when the app is running on many different local or temporary addresses.

## What it does

- Owns the single Google OAuth app registration
- Starts short-lived login requests for local app instances
- Sends the user through Google sign-in on a stable broker domain
- Stores the approved Google identity against a request ID
- Lets the local app poll status and exchange an approved request for identity data

Technical:

- Use this broker only when direct popup sign-in on `http://localhost:3000` is not enough for your deployment model.

Layman's terms:

- If the app always lives on the normal localhost install URL, you usually do not need this extra service. Use it when sign-in has to work across changing hosts, ports, or public URLs.

## Run locally

1. Copy `.env.example` to a real env file or set the variables in your shell.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from your Google web OAuth app.
3. Set `BROKER_BASE_URL` to the exact public URL that Google will redirect back to.
4. Run `cmd /c npm run broker:dev` from the repo root, or `node src/server.mjs` inside `broker`.

## Google setup

1. Create one Google OAuth web application for the product.
2. Add your broker callback URL as an authorized redirect URI.
3. Example callback: `https://auth.example.com/api/google/callback`
4. The app itself should point to the broker with `AUTH_BROKER_BASE_URL=https://auth.example.com`.

## Production note

This scaffold uses an in-memory request store. That is fine for development and initial bring-up, but production should replace it with Redis or another short-lived shared store so approvals survive process restarts and multi-instance hosting.