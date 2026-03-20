# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Declare build args — Vite bakes these into the bundle at build time
ARG VITE_PROJECT_STATE_URL=http://localhost:8080
ARG VITE_CRM_API_URL=http://localhost:8090
ARG VITE_OPENCLAW_URL=http://localhost:8100

ENV VITE_PROJECT_STATE_URL=$VITE_PROJECT_STATE_URL
ENV VITE_CRM_API_URL=$VITE_CRM_API_URL
ENV VITE_OPENCLAW_URL=$VITE_OPENCLAW_URL

COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
