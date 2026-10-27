# ATS / Careers — imagen para Cloud Run.
#
# Tres etapas para que la imagen final no cargue con el compilador ni con el
# node_modules completo: solo el servidor que Next deja en .next/standalone.
#
# Se construye con:  docker build -t careers .
# Se corre con:      docker run -p 8080:8080 --env-file .env.local careers

# ─── 1) Dependencias ────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
# Next en Alpine necesita libc6-compat para los binarios de SWC.
RUN apk add --no-cache libc6-compat
WORKDIR /app
# OJO: en este repo `package-lock.json` está en .gitignore, así que Cloud Build
# clona SIN lock y `npm ci` fallaría. El comodín lo copia si está y no revienta
# si no, y el arranque elige el comando que corresponda.
#
# Esto es un parche, no la solución. Sin lock, dos builds del mismo commit
# pueden traer dependencias distintas — justo lo que no se quiere en algo que
# maneja datos de candidatos. Lo correcto es sacar package-lock.json del
# .gitignore (línea 34) y versionarlo; ahí esta rama muere sola y siempre
# corre `npm ci`.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

# ─── 2) Build ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Activa `output: "standalone"` en next.config.js. Fuera del contenedor esta
# variable no existe, así que el build de Vercel no cambia.
ENV BUILD_TARGET=container
ENV NEXT_TELEMETRY_DISABLED=1

# Las NEXT_PUBLIC_* se incrustan en el bundle del navegador en tiempo de BUILD,
# no de arranque. Tienen que entrar aquí como build-args o el cliente queda
# apuntando a undefined. Las secretas (SUPABASE_SERVICE_ROLE_KEY, ADMIN_SECRET,
# ANTHROPIC_API_KEY, RESEND_API_KEY, DATABASE_URL) NO van aquí: esas se
# inyectan en tiempo de ejecución desde Secret Manager.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
# Dirección pública de la app (enlaces en correos y portales del candidato).
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

# ─── 3) Runtime ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario sin privilegios: si alguien logra ejecutar algo dentro del
# contenedor, que no sea root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# El servidor standalone ya trae dentro las dependencias que rastreó Next,
# incluidas las fuentes de pdfkit que declara outputFileTracingIncludes.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Cloud Run manda el puerto en $PORT; 8080 es su valor por defecto.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["node", "server.js"]
