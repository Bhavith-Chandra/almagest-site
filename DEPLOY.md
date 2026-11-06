# Almagest site: deploy and connect the GoDaddy domain

Static site: `index.html` + `assets/`. No build step.

Local preview: `python3 -m http.server 4173 --directory site`.

## Option A: GitHub Pages (free)

1. Push the contents of `site/` to its own repo (e.g. `almagest-site`), enable Pages on `main` / root.
2. Add a file `CNAME` containing the bare domain (e.g. `almagest.xyz`).
3. GoDaddy → My Products → the domain → DNS → Manage DNS:
   - Delete the default `A @ Parked` record.
   - Add four `A` records, name `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - Replace the `CNAME www` record with value `<github-username>.github.io`.
4. After DNS resolves (minutes to a few hours), tick "Enforce HTTPS" in the repo's Pages settings.

## Option B: Vercel

1. `vercel deploy site --prod`, then add the domain in the project's Domains tab.
2. GoDaddy DNS: `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com` (use the values Vercel shows).

## Before publishing

- Set `CONTACT` in the script at the bottom of `index.html` (an address on the new domain).
