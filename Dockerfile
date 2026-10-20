FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Публичный ключ reCAPTCHA v3 нужен именно на СБОРКЕ: Vite подставляет
# import.meta.env.* в бандл. Через env_file он приходит только в runtime —
# до браузера не доходит, и загрузчик reCAPTCHA вырезается как мёртвый код.
ARG VITE_RECAPTCHA_SITE_KEY=""
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY api ./api
COPY db ./db
COPY contracts ./contracts
EXPOSE 3000
CMD ["node", "dist/boot.js"]
