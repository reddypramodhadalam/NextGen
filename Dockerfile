# AITAS - AI Test Automation System
# Multi-stage Dockerfile for production deployment

# Stage 1: Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies for browser automation
RUN apt-get update && apt-get install -y \
    # Chromium dependencies
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    # Firefox dependencies
    firefox-esr \
    # Additional utilities
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install chromium firefox

# Copy built application from builder stage (includes dist/public for static files)
COPY --from=builder /app/dist ./dist

# Copy package.json for runtime (may be needed for version info)
COPY --from=builder /app/package.json ./

# Copy any static assets if needed
COPY --from=builder /app/client/src/assets ./client/src/assets 2>/dev/null || true

# Copy drizzle config for potential migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts 2>/dev/null || true
COPY --from=builder /app/shared ./shared 2>/dev/null || true

# Create non-root user for security
RUN groupadd -r aitas && useradd -r -g aitas aitas
RUN chown -R aitas:aitas /app
USER aitas

# Expose application port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the application
CMD ["node", "dist/index.cjs"]
