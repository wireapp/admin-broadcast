FROM hayd/alpine-deno:1.7.2

WORKDIR /app

COPY app.ts .

RUN deno cache app.ts

# ------------------- Wire common -----------------
# create version file
ARG release_version=development
ENV RELEASE_FILE_PATH=/app/release.txt
RUN echo $release_version > $RELEASE_FILE_PATH
# /------------------ Wire common -----------------

EXPOSE 8080

CMD ["run", "--allow-net", "--allow-env", "app.ts"]
