# ---- Build Stage ----
FROM golang:1.23-alpine AS builder

WORKDIR /build

COPY go.mod ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /git-runner .

# ---- Runtime Stage ----
FROM alpine:3.20

RUN apk add --no-cache git curl

COPY --from=builder /git-runner /usr/local/bin/git-runner

# 数据目录会在运行时通过 volume 挂载
RUN mkdir -p /data/git /data/workspace

EXPOSE 3001

ENTRYPOINT ["git-runner"]
