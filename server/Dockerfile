FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --workspaces=false

COPY . .
RUN npm run build
RUN npm prune --omit=dev --workspaces=false

FROM node:24-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000

USER node

CMD ["node", "dist/main.js"]
