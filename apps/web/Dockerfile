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

COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build -w @emotion-studio/contracts

EXPOSE 5173

CMD ["npm", "run", "dev", "-w", "@emotion-studio/web", "--", "--host", "0.0.0.0"]
