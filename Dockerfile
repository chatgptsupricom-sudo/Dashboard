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
# pnpm fijado a proposito: `npm install -g pnpm` sin version instalaba la
# ultima publicada, y pnpm 11 exige Node >=22.13 mientras estas etapas corren
# sobre node:20-alpine. El dia que salio pnpm 11 el build empezo a fallar solo,
# sin que cambiara nada del repo. La 10.34.5 es la ultima que soporta Node 20 y
# escribe el mismo lockfileVersion 9.0 que tiene pnpm-lock.yaml.
RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml* ./
# Asegúrate de instalar todo, incluyendo las nuevas dependencias (socket.io, express)
RUN pnpm install --no-frozen-lockfile

# Etapa 2: Construcción
FROM node:20-alpine AS builder
WORKDIR /app
# pnpm fijado a proposito: `npm install -g pnpm` sin version instalaba la
# ultima publicada, y pnpm 11 exige Node >=22.13 mientras estas etapas corren
# sobre node:20-alpine. El dia que salio pnpm 11 el build empezo a fallar solo,
# sin que cambiara nada del repo. La 10.34.5 es la ultima que soporta Node 20 y
# escribe el mismo lockfileVersion 9.0 que tiene pnpm-lock.yaml.
RUN npm install -g pnpm@10.34.5
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# SOLO variables NEXT_PUBLIC_* aqui. Nada de secretos.
#
# Las NEXT_PUBLIC_* se INCRUSTAN en el bundle durante `next build`; no se leen
# en ejecucion. Si no estan declaradas aqui, ponerlas en el entorno de EasyPanel
# no sirve: el navegador nunca las ve y la funcionalidad queda muda, sin error.
# Cada NEXT_PUBLIC_ nueva hay que agregarla a este bloque.
#
# El resto (JWT_SECRET, DB_PASSWORD, ODOO_API_KEY, OPENAI_API_KEY, tokens de
# Meta, CRON_SECRET, WEBHOOK_SECRET, TURNSTILE_SECRET_KEY...) se lee en
# EJECUCION con process.env y NO debe declararse como ARG: un ARG se convierte
# en build-arg de Docker, y EasyPanel imprime la linea completa de
# `docker buildx build` en el log de cada build fallido, secretos incluidos.
# Verificado: `next build` completa sin ninguna de esas variables presentes.
ARG NEXT_PUBLIC_ODOO_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SOCKET_URL

ENV NEXT_PUBLIC_ODOO_URL=$NEXT_PUBLIC_ODOO_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# Etapa 3: Ejecución (Imagen final)
FROM node:20-alpine AS runner
WORKDIR /app

# pnpm fijado a proposito: `npm install -g pnpm` sin version instalaba la
# ultima publicada, y pnpm 11 exige Node >=22.13 mientras estas etapas corren
# sobre node:20-alpine. El dia que salio pnpm 11 el build empezo a fallar solo,
# sin que cambiara nada del repo. La 10.34.5 es la ultima que soporta Node 20 y
# escribe el mismo lockfileVersion 9.0 que tiene pnpm-lock.yaml.
RUN npm install -g pnpm@10.34.5

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

# Crear directorios de uploads con permisos para nextjs
RUN mkdir -p /app/uploads/custom-views /app/public/uploads/banco-imagenes && chown -R nextjs:nodejs /app/uploads /app/public/uploads

USER nextjs

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# CAMBIO AQUÍ: Ahora ejecutamos nuestro servidor personalizado
CMD ["sh", "-c", "mkdir -p /app/uploads/custom-views /app/public/uploads/banco-imagenes 2>/dev/null; node server.js"]
