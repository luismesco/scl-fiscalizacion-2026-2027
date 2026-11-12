FROM node:24-alpine
RUN apk add --no-cache python3
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node","server/index.mjs"]
