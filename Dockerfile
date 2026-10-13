# ivories.pepperhorn.com (runbook §3.7 H1): Coolify build pack "dockerfile".
# Open build unless PLUGIN_BUNDLE_URL and PLUGIN_BUNDLE_SHA256 are both set.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ivories/package.json packages/ivories/package.json
COPY apps/studio/package.json apps/studio/package.json
RUN npm ci --no-audit --no-fund
COPY . .
ARG APP_VERSION=0.0.0
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build
ARG PLUGIN_BUNDLE_URL=""
ARG PLUGIN_BUNDLE_SHA256=""
RUN PLUGIN_BUNDLE_URL="$PLUGIN_BUNDLE_URL" PLUGIN_BUNDLE_SHA256="$PLUGIN_BUNDLE_SHA256" \
    node scripts/inject-plugin.mjs apps/studio/dist

FROM nginx:alpine
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/studio/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
