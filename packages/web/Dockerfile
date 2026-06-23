FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/calculator/package.json ./packages/calculator/
COPY packages/web/package.json ./packages/web/

RUN npm install --workspace=packages/calculator --workspace=packages/web

COPY packages/calculator/src ./packages/calculator/src
COPY packages/calculator/tsconfig.json ./packages/calculator/
COPY packages/web/src ./packages/web/src
COPY packages/web/index.html ./packages/web/
COPY packages/web/vite.config.ts ./packages/web/
COPY packages/web/tailwind.config.js ./packages/web/
COPY packages/web/tsconfig.node.json ./packages/web/
COPY packages/web/tsconfig.json ./packages/web/

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=packages/web", "--", "--host", "0.0.0.0"]
