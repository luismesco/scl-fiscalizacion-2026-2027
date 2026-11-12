FROM node:24-alpine
RUN apk add --no-cache python3 poppler curl
WORKDIR /app
COPY . .
# Ingesta de la base de conocimiento en tiempo de construcción: el corpus
# versionado en el repo es la base (10,950 pasajes); aquí se suman el FAQ
# (101) y las dos versiones estenográficas del CG (50 + 141), para un total
# de 11,242 pasajes. Los PDF se descargan de la fuente oficial del INE.
RUN curl -fsSL -o documents/CGex202611-11-VE.pdf https://repositoriodocumental.ine.mx/xmlui/bitstream/handle/123456789/190925/CGex202611-11-VE.pdf \
 && curl -fsSL -o documents/CGex202609-29-VE.pdf https://repositoriodocumental.ine.mx/xmlui/bitstream/handle/123456789/190347/CGex202609-29-VE.pdf \
 && node server/scripts/ingest-faq.mjs \
 && node server/scripts/ingest-pdf.mjs --pdf documents/CGex202611-11-VE.pdf --doc sesion-cg-20261111-ve --title "Versión estenográfica · Sesión Extraordinaria Urgente del Consejo General · 11 de noviembre de 2026" \
 && node server/scripts/ingest-pdf.mjs --pdf documents/CGex202609-29-VE.pdf --doc sesion-cg-20260929-ve --title "Versión estenográfica · Sesión Extraordinaria del Consejo General · 29 de septiembre de 2026"
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node","server/index.mjs"]
