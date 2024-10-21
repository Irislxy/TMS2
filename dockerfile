FROM node:20-alpine

WORKDIR /app

COPY package.json /app

RUN npm install

# dockerignore will kick in here
COPY . /app

# Create a non-root user
RUN adduser -u 1001 -D -H myuser

# Switch to the non-root user
USER myuser

# EXPOSE 3000

CMD ["node", "app.js"]