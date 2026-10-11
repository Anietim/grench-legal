# Putting the Grench Legal site online

The site needs a host that runs Node.js **and keeps a persistent disk** (the owner's edits, photos, messages and password live in the `data` folder). Without a disk everything resets whenever the host restarts.

## Option A: Render (simplest)
1. Put the project in a GitHub repository (the `.gitignore` already keeps `data/` out).
2. On https://render.com choose New > Blueprint, pick the repository. It reads `render.yaml`.
3. When asked, enter `ADMIN_PASSWORD` (the owner's starting password) and `MASTER_PASSWORD` (your private override).
4. Deploy. Open `https://<your-service>.onrender.com/admin`.
5. Add your own domain (e.g. grenchlegal.com) in Render > Settings > Custom Domains and follow the DNS steps. HTTPS is automatic.
Cost: a paid "Starter" web service plus the 1 GB disk (a few dollars a month). Free plans have no disk, so do not use them for this.

## Option B: Railway
New Project > Deploy from GitHub > add a **Volume** mounted at `/data` > Variables: `NODE_ENV=production`, `DATA_DIR=/data`, `ADMIN_PASSWORD`, `MASTER_PASSWORD`. Generate a domain, then add your custom domain.

## Option C: a VPS (e.g. DigitalOcean, Hetzner, Contabo)
Install Node 22, copy the project, run `NODE_ENV=production DATA_DIR=/var/grench-data PORT=3000 node server.js` under `pm2` or systemd, and put Caddy or Nginx in front for HTTPS.

## Environment variables
| Name | What it does |
|---|---|
| `NODE_ENV=production` | Secure cookies, HTTPS-only headers, proxy-aware visitor IPs |
| `DATA_DIR` | Folder on the persistent disk |
| `ADMIN_PASSWORD` | Owner's starting password (used only when `data/admin.json` does not exist yet) |
| `MASTER_PASSWORD` | Your override. Always works. At least 10 characters. Keep it private. |
| `PORT` | Set by the host automatically |

## After going live
- Log in at `/admin`, change the password, and publish once so the history starts.
- Back up the `data` folder regularly (download it from the disk or snapshot the disk).
- Test the contact form by sending yourself a message and checking Messages in the admin.
