FROM hayd/alpine-deno

WORKDIR /app

COPY *.ts .

RUN deno cache deps.ts

# ------------------- Wire common -----------------
# create version file
ARG release_version=development
ENV RELEASE_FILE_PATH=/app/release.txt
RUN echo $release_version > $RELEASE_FILE_PATH
# /------------------ Wire common -----------------

EXPOSE 8080

CMD ["run", "--quiet", "--allow-net", "--allow-env", "--allow-read", "app.ts"]
