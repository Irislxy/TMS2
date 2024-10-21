FROM node:20-alpine

# Create a non-root user
RUN adduser -u 1001 -D -H myuser

WORKDIR /app

# Copy and unpack the tgz file
COPY tms2-1.0.0.tgz /app/tms2-1.0.0.tgz
RUN npm install /app/tms2-1.0.0.tgz

# Copy the rest of the app
COPY . /app

RUN cmp package.json ./node_modules/tms2/package.json

# renaming node_modules to node_modules_temp
RUN mv ./node_modules ./node_modules_temp && \
# creating new folder node_modules inside app and placing everything in pwd 
mv node_modules_temp/tms2/node_modules . && \
rm /app/tms2-1.0.0.tgz && \
rm -r node_modules_temp

# Switch to the non-root user
USER myuser

EXPOSE 3000

CMD ["node", "app.js"]
