# DNSMgr - DNS Aggregation Management Platform

A modern DNS aggregation management platform built with React + TailwindCSS (frontend) and Node.js + TypeScript (backend).

## Features

- **Multi-provider Support**: Manage DNS records across 16 providers:
  - Aliyun (阿里云), DNSPod (腾讯云), Huawei Cloud (华为云), Baidu Cloud (百度云)
  - Volcengine (火山引擎), JD Cloud (京东云), Cloudflare, DNS.LA
  - Xidian Digital (西部数码), Qingcloud (青云), NameSilo, BT Panel (宝塔)
  - Spaceship, PowerDNS, Aliyun ESA (阿里云ESA), Tencent EdgeOne (腾讯EdgeOne)

- **Multi-user & Team Management**: Role-based access (admin/member), team-based domain sharing
- **Full DNS Record Management**: CRUD for all record types (A, AAAA, CNAME, MX, TXT, SRV, CAA, etc.)
- **Modern UI**: React 18 + TailwindCSS with responsive design
- **API Documentation**: Swagger UI at `/api/docs`
- **Extensible Architecture**: Abstract DNS interface makes adding new providers easy

## Architecture

```
DNSMgr/
├── server/          # Node.js + TypeScript backend
│   └── src/
│       ├── lib/dns/ # DNS provider adapters (abstract interface)
│       ├── routes/  # REST API routes
│       ├── middleware/ # Auth (JWT), validation
│       └── db/      # SQLite database
└── client/          # React + Vite + TailwindCSS frontend
    └── src/
        ├── pages/   # All UI pages
        ├── components/ # Reusable components
        └── api/     # API client
```

## Quick Start

### Prerequisites
- Node.js >= 18
- pnpm

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
# Start both server and client in parallel
pnpm dev
```

Or separately:

```bash
# Backend (port 3001)
cd server && pnpm dev

# Frontend (port 5173)
cd client && pnpm dev
```

### Production Build

```bash
pnpm build
```

### Environment Variables

Copy `.env.example` to `.env` in the `server/` directory:

```bash
cp server/.env.example server/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | `dnsmgr-secret-key` | JWT signing secret (change in production!) |
| `DB_PATH` | `./dnsmgr.db` | SQLite database path |

## Default Login

On first run, a default admin account is created:

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change this password immediately after first login!**

## API Documentation

After starting the server, visit: `http://localhost:3001/api/docs`

## Adding a New DNS Provider

1. Create a new adapter in `server/src/lib/dns/providers/myprovider.ts` implementing `DnsAdapter`
2. Register it in `server/src/lib/dns/DnsHelper.ts` (add to `DNS_PROVIDERS` map)
3. Export it in `server/src/lib/dns/providers/index.ts`

The adapter must implement the `DnsAdapter` interface:

```typescript
interface DnsAdapter {
  check(): Promise<boolean>;
  getDomainList(...): Promise<PageResult<DomainInfo>>;
  getDomainRecords(...): Promise<PageResult<DnsRecord>>;
  addDomainRecord(...): Promise<string | null>;
  updateDomainRecord(...): Promise<boolean>;
  deleteDomainRecord(...): Promise<boolean>;
  setDomainRecordStatus(...): Promise<boolean>;
  // ...
}
```

## Tech Stack

**Backend:**
- Node.js + TypeScript
- Express.js
- SQLite (better-sqlite3)
- JWT authentication
- Swagger/OpenAPI documentation

**Frontend:**
- React 18 + TypeScript
- Vite
- TailwindCSS v3
- React Router v6
- @tanstack/react-query
- Axios
- lucide-react

## License

MIT
