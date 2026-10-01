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

# pnpm-workspace.yaml lleva los permisos de build de las dependencias con
# script de instalacion (sharp, @swc/core...). Sin el, pnpm 10+ se niega a
# ejecutarlos y aborta con ERR_PNPM_IGNORED_BUILDS, que es lo que rompia el
# despliegue: el archivo estaba en el repo pero nunca entraba en la imagen.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
# Asegúrate de instalar todo, incluyendo las nuevas dependencias (socket.io, express)
RUN pnpm install --no-frozen-lockfile

# Etapa 2: Construcción
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# AQUI SOLO VAN VARIABLES PUBLICAS. NINGUN SECRETO.
#
# Un `--build-arg` no es un sitio seguro: queda escrito en el log del
# despliegue, en la orden que lo lanza y en los metadatos de la imagen. El log
# de EasyPanel imprime la linea entera de `docker buildx build`, asi que cada
# secreto que se pase asi queda a la vista de cualquiera que abra el
# despliegue. Docker mismo lo avisa con "SecretsUsedInArgOrEnv".
#
# Las NEXT_PUBLIC_* si tienen que estar: se INCRUSTAN en el bundle durante
# `next build` y no se leen en ejecucion. Si no estan declaradas aqui, ponerlas
# en el entorno de EasyPanel no sirve — el navegador nunca las ve y la
# funcionalidad queda muda, sin error. Y por lo mismo NO son secretas: viajan
# al navegador de cualquier visitante. Cada NEXT_PUBLIC_ nueva hay que
# agregarla a este bloque.
ARG NEXT_PUBLIC_ODOO_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SOCKET_URL

ENV NEXT_PUBLIC_ODOO_URL=$NEXT_PUBLIC_ODOO_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_TELEMETRY_DISABLED=1

# JWT_SECRET, DB_PASSWORD, ODOO_API_KEY, OPENAI_API_KEY, WEBHOOK_SECRET y las
# N8N_* NO se declaran en el build: son de EJECUCION. EasyPanel ya las inyecta
# en el contenedor, que es donde hacen falta.
#
# El build ya no las necesita. La ultima que lo obligaba era OPENAI_API_KEY,
# porque el agente creaba su cliente al importar el modulo y el SDK lanza
# "Missing credentials" si falta la clave; ahora lo crea al usarlo.

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

# Crear directorios de uploads con permisos para nextjs
RUN mkdir -p /app/uploads/custom-views /app/public/uploads/banco-imagenes && chown -R nextjs:nodejs /app/uploads /app/public/uploads

USER nextjs

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# CAMBIO AQUÍ: Ahora ejecutamos nuestro servidor personalizado
CMD ["sh", "-c", "mkdir -p /app/uploads/custom-views /app/public/uploads/banco-imagenes 2>/dev/null; node server.js"]
