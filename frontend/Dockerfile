# build-этап
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# runtime-этап
FROM nginx:stable-alpine

# кладём собранный фронт
COPY --from=build /app/dist /usr/share/nginx/html

# подменяем дефолтный конфиг nginx нашим SPA-конфигом
COPY nginx.conf /etc/nginx/conf.d/default.conf
