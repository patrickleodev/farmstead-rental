FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --workspaces=false

COPY . .
RUN npm run build -- --configuration development

FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client/browser /usr/share/nginx/html

EXPOSE 80
