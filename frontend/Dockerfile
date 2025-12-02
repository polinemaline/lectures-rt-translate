# frontend/Dockerfile  (править в папке frontend)
FROM node:20-bookworm-slim AS build
WORKDIR /app

# сначала только манифесты — чтобы кешировалось
COPY package*.json ./
RUN npm ci

# затем исходники
COPY . .
RUN npm run build

# runtime: nginx
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
