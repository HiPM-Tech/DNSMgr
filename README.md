# DNSMgr - DNS Aggregation Management Platform

A modern DNS aggregation management platform built with React + TailwindCSS (frontend) and Node.js + TypeScript (backend).

对于中国用户请看: [简体中文文档](README_zh.md)

## Features

- **Multi-provider Support**: Manage DNS records across 18 providers:
  - Aliyun (阿里云), DNSPod (腾讯云), Huawei Cloud (华为云), Baidu Cloud (百度云)
  - Volcengine (火山引擎), JD Cloud (京东云), Cloudflare, DNS.LA
  - West Digital (西部数码), Qingcloud (青云), NameSilo, BT Panel (宝塔)
  - Spaceship, PowerDNS, Aliyun ESA (阿里云 ESA), Tencent EdgeOne (腾讯 EdgeOne)
  - DNSHE, Rainyun (雨云)

- **Multi-user & Team Management**: Role-based access (admin/member), team-based domain sharing
- **Full DNS Record Management**: CRUD for all record types (A, AAAA, CNAME, MX, TXT, SRV, CAA, etc.)
- **Modern UI**: React 18 + TailwindCSS with responsive design
- **API Documentation**: Swagger UI at `/api/docs`
- **Extensible Architecture**: Abstract DNS interface makes adding new providers easy

## Provider Type & Alias Mapping

When creating/updating DNS accounts, the API normalizes lego-style provider names to internal provider types.

| Internal Type | Supported Aliases |
|---|---|
| `aliyun` | `aliyun`, `alidns` |
| `aliyunesa` | `aliesa` |
| `baidu` | `baiducloud` |
| `huawei` | `huaweicloud` |
| `huoshan` | `huoshan`, `volcengine` |
| `west` | `westcn` |
| `cloudflare` | `cloudflare` |
| `jdcloud` | `jdcloud` |
| `namesilo` | `namesilo` |
| `rainyun` | `rainyun` |
| `powerdns` | `powerdns`, `pdns` |
| `dnspod` | `dnspod`, `tencentcloud` |
| `tencenteo` | `tencenteo`, `edgeone` |

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

#### Mode 1: Concurrent Start (Recommended for most users)

Start both frontend and backend with a single command (runs on separate ports):

```bash
# Start both server (port 3001) and client (port 5173) in parallel
pnpm dev
```

Access: http://localhost:5173

#### Mode 2: Separate Start (For advanced users)

Start frontend and backend independently in separate terminals:

```bash
# Terminal 1 - Backend only (port 3001)
cd server && pnpm dev

# Terminal 2 - Frontend only (port 5173)
cd client && pnpm dev
```

### Production Build

```bash
pnpm build
```

### Source Code - Unified Mode (Single Port)

Run both frontend and backend on the same port (3001) - backend serves static files:

```bash
# Step 1: Build frontend first
pnpm --filter client build

# Step 2: Start backend only (serves both API and frontend on port 3001)
cd server && pnpm dev
```

Access: http://localhost:3001

This mode is useful when you want:
- Only one port exposed
- Same behavior as Docker deployment
- Simpler reverse proxy configuration

### Docker Deployment

Docker deployment uses all-in-one mode (frontend + backend in single container):

```bash
# Build and run
docker build -t dnsmgr .
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  --name dnsmgr \
  dnsmgr
```

Or use Docker Compose:

```bash
docker-compose up -d
```

Access: http://localhost:3001

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
| `DB_TYPE` | `sqlite` | Database type: `sqlite`, `mysql`, or `postgresql` |
| `DB_HOST` | - | Database host (for MySQL/PostgreSQL) |
| `DB_PORT` | - | Database port (for MySQL/PostgreSQL) |
| `DB_NAME` | - | Database name (for MySQL/PostgreSQL) |
| `DB_USER` | - | Database user (for MySQL/PostgreSQL) |
| `DB_PASS` | - | Database password (for MySQL/PostgreSQL) |

## Default Login

On first run, a default admin account is created:

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change this password immediately after first login!**

## API Documentation

After starting the server, visit: `http://localhost:3001/api/docs`

Provider API alignment notes:
- [provider-api-alignment.md](docs/provider-api-alignment.md)
- Includes Tencent DNSPod, Tencent EO, and Aliyun DNS official API mapping and current implementation status.

Provider docs:
- [西部数码 DNS](docs/providers/west.md)

## Record Model Notes

- DNS records still expose the generic `line` field for backward compatibility.
- For Cloudflare, use provider-specific fields in request/response payloads:
  - `cloudflare.proxied`: proxy switch (`true` = proxied, `false` = DNS only)
  - `cloudflare.proxiable`: whether the current record type can be proxied
- Write precedence for Cloudflare create/update:
  - If `cloudflare.proxied` is provided, it is used.
  - Otherwise, fallback to `line` (`'1'` = proxied, `'0'` = DNS only).

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
