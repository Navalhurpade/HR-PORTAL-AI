# HR Portal frontend

React + TypeScript + Vite frontend for the Nori HR portal. It connects to the Fastify API for sign-in, leave and policy data, HR review actions, the people directory, company-document management, and the Nori assistant.

## Run locally

Start the backend first by following [server/README.md](../server/README.md). Then, from `client/`:

```powershell
npm ci
npm run dev
```

Vite serves the frontend locally (normally `http://localhost:5173`) and proxies `/api` requests to `http://127.0.0.1:3001`. Set the backend's `CLIENT_ORIGIN` if using a different browser origin.

## Available commands

```powershell
npm run build  # Type-check and create the production bundle in dist/
npm run lint   # Run Oxlint
npm run preview
```

## Implemented screens and behavior

- Sign-in and authenticated profile loading. There is no public registration form or client-side role selector.
- Employee views for leave policies, personal leave history, and leave requests.
- HR and super-admin views for reviewing leave requests and searching the people directory.
- Company-document listing, download, and HR/admin upload and deletion.
- Nori chat with Markdown/GFM rendering and visible source/tool activity while a streamed response is running.

The browser stores the short-lived access token in `sessionStorage` and sends it as a bearer token. It may hide actions based on the signed-in role for usability, but the API is the authorization boundary and independently enforces role and record ownership.
