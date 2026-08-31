FROM node:24-bookworm-slim

WORKDIR /workspace
ENV NODE_ENV=development

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci

COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN npm run build -w @emotion-studio/contracts \
    && npm run build -w @emotion-studio/database

EXPOSE 8787

CMD ["npm", "run", "dev", "-w", "@emotion-studio/api"]
