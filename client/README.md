# Northstar HR Portal — UI prototype

A responsive React + TypeScript frontend connected to the Fastify HR Portal API. Sign-in, profiles, policies, leave history, requests, and approvals are loaded from PostgreSQL-backed API routes. Session tokens are kept in `sessionStorage` and sent as bearer tokens.

## Run locally

Start the Fastify server first in `server/` with `npm run dev`, then from this folder run `npm install` and `npm run dev`. The Vite `/api` proxy forwards requests to `http://127.0.0.1:3001`.

Use `npm run build` to type-check and create a production build, or `npm run lint` to run Oxlint.

## Explore the UI

- Sign in using an account provisioned in the server; there is no public registration, and the UI does not allow changing the assigned role.
- Employees can review their leave policies/history and submit requests.
- HR and Super Admin can review all leave requests, approve or reject pending requests, and search the people directory.
- The API is the authorization boundary; the browser hides actions based on the authenticated profile while the server enforces the same role rules.

## User profile fields represented

The directory API returns User ID, name, email, role, department, and Manager ID.