# # Etapa 1: Dependencias
# FROM node:20-alpine AS deps
# RUN apk add --no-cache libc6-compat
# WORKDIR /app
# RUN npm install -g pnpm

# COPY package.json pnpm-lock.yaml* ./
# RUN pnpm install --no-frozen-lockfile

# # Etapa 2: Construcción
# FROM node:20-alpine AS builder
# WORKDIR /app
# RUN npm install -g pnpm
# COPY --from=deps /app/node_modules ./node_modules
# COPY . .

# # DECLARA AQUÍ LAS VARIABLES QUE REQUIERE EL BUILD
# # Estas coinciden con las variables que definiste en Easypanel
# ARG OPENAI_API_KEY
# ARG JWT_SECRET
# ARG NEXT_PUBLIC_ODOO_URL

# # Las pasamos a ENV para que Next.js las vea
# ENV OPENAI_API_KEY=$OPENAI_API_KEY
# ENV JWT_SECRET=$JWT_SECRET
# ENV NEXT_PUBLIC_ODOO_URL=$NEXT_PUBLIC_ODOO_URL

# ENV NEXT_TELEMETRY_DISABLED=1
# RUN pnpm run build

# # Etapa 3: Ejecución (Imagen final)
# FROM node:20-alpine AS runner
# WORKDIR /app

# RUN npm install -g pnpm

# ENV NODE_ENV=production
# ENV NEXT_TELEMETRY_DISABLED=1

# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 nextjs

# COPY --from=builder /app/public ./public
# COPY --from=builder /app/.next ./.next
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package.json ./package.json

# USER nextjs

# # Define estas variables para asegurar que la app escuche correctamente
# ENV HOST=0.0.0.0
# ENV PORT=3000

# EXPOSE 3000

# CMD ["pnpm", "start"]
# Etapa 1: Dependencias
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
# Asegúrate de instalar todo, incluyendo las nuevas dependencias (socket.io, express)
RUN pnpm install --no-frozen-lockfile

# Etapa 2: Construcción
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables de entorno
ARG OPENAI_API_KEY
ARG JWT_SECRET
ARG NEXT_PUBLIC_ODOO_URL

ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV JWT_SECRET=$JWT_SECRET
ENV NEXT_PUBLIC_ODOO_URL=$NEXT_PUBLIC_ODOO_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# Etapa 3: Ejecución (Imagen final)
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiamos lo esencial de la etapa builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# ¡IMPORTANTE! Copia el server.js a la imagen final
COPY --from=builder /app/server.js ./server.js

USER nextjs

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# CAMBIO AQUÍ: Ahora ejecutamos nuestro servidor personalizado
CMD ["node", "server.js"]
