FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Instalar dependencias de runtime del sistema necesarias para procesamiento de video
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-setuptools \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalar yt-dlp para descarga de videos
RUN pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]"

# Herramientas de build para rebuild nativo de SQLite si es requerido en prod
COPY package.json pnpm-lock.yaml ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*
RUN pnpm install --prod --frozen-lockfile
RUN cd $(find node_modules/.pnpm -name "sqlite3@*" -type d)/node_modules/sqlite3 && npx --yes node-gyp rebuild

COPY --from=build /app/dist ./dist

# Crear directorios para datos SQLite y archivos temporales compartidos
RUN mkdir -p /app/data /app/temp

EXPOSE 3000

# Por defecto arranca la API, pero el mismo Dockerfile sirve para el worker modificando el CMD
CMD ["node", "dist/src/index.js"]
