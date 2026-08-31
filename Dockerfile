# Imagen mínima para correr la app 24/7 en un LXC o una VM con Docker.
FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 compila un módulo nativo si no hay binario precompilado
# para esta combinación de arquitectura/libc; python3 y build-essential lo
# permiten sin fallar la imagen.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# UID/GID fijos: el manifiesto de Kubernetes fija runAsUser/runAsGroup a este
# mismo número. Sin fijarlo aquí, useradd le asignaría el siguiente UID de
# sistema libre, que no tiene por qué coincidir entre imágenes o entornos.
RUN groupadd -r -g 999 finanzas && useradd -r -u 999 -g finanzas finanzas \
    && mkdir -p /app/data /app/copias && chown -R finanzas:finanzas /app

COPY --from=build --chown=finanzas:finanzas /app/.next ./.next
COPY --from=build --chown=finanzas:finanzas /app/node_modules ./node_modules
COPY --from=build --chown=finanzas:finanzas /app/public ./public
COPY --from=build --chown=finanzas:finanzas /app/package.json ./package.json
COPY --from=build --chown=finanzas:finanzas /app/next.config.ts ./next.config.ts
COPY --from=build --chown=finanzas:finanzas /app/scripts ./scripts

USER finanzas
EXPOSE 3000
VOLUME ["/app/data", "/app/copias"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
