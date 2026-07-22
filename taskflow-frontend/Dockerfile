# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Vite bakes these in at build time via import.meta.env.*
ARG VITE_API_URL
ARG VITE_HOCUSPOCUS_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_HOCUSPOCUS_URL=$VITE_HOCUSPOCUS_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- serve stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
