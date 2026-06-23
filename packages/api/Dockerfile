FROM node:20-alpine
WORKDIR /app
COPY package.json .
COPY packages/calculator/package.json packages/calculator/
COPY packages/api/package.json packages/api/
RUN npm install --workspaces
RUN npm install pino-pretty
COPY packages/calculator/src packages/calculator/src/
COPY packages/api/src packages/api/src/
COPY packages/api/drizzle packages/api/drizzle/
ENV NODE_ENV=development
EXPOSE 3001
CMD ["node", "--import", "tsx/esm", "packages/api/src/index.ts"]
