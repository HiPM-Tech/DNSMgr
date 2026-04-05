# Multi-stage build for DNSMgr (Frontend + Backend in one image)
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy server package files
COPY server/package.json server/.npmrc ./server/

# Copy client package files  
COPY client/package.json ./client/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build client (frontend)
RUN pnpm --filter dnsmgr-client build

# Build server (backend)
RUN pnpm --filter dnsmgr-server build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy server package files
COPY server/package.json server/.npmrc ./server/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built server files from builder
COPY --from=builder /app/server/dist ./server/dist

# Copy built client files from builder
COPY --from=builder /app/client/dist ./client/dist

# Create data directory for persistent storage
RUN mkdir -p /app/data

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/init/status', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server (which also serves the frontend)
CMD ["node", "server/dist/app.js"]
