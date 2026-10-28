# Build official source: historical public MinIO registries may require auth.
FROM golang:1.24.8-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch RELEASE.2025-10-15T17-29-55Z https://github.com/minio/minio.git .
RUN CGO_ENABLED=0 go build -trimpath -o /minio .
RUN GOBIN=/out CGO_ENABLED=0 go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z
FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl
COPY --from=build /minio /usr/bin/minio
COPY --from=build /out/mc /usr/bin/mc
ENTRYPOINT ["minio"]
COPY --from=build /src/LICENSE /licenses/LICENSE
COPY --from=build /src/CREDITS /licenses/CREDITS
CMD ["server", "/data", "--console-address", ":9001"]
