# syntax=docker/dockerfile:1
# Build context: ./services (needs both api/ and yolo/)
ARG RUST_VERSION=1.92.0
ARG APP_NAME=healthy-diet-api-server

# ── Build stage (Rust API) ───────────────────────────────────
FROM rust:${RUST_VERSION}-slim-bookworm AS build
ARG APP_NAME
WORKDIR /app

RUN apt-get update && apt-get install -y \
    clang lld musl-dev git \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

ENV SQLX_OFFLINE=true

RUN --mount=type=bind,source=api/src,target=src \
    --mount=type=bind,source=api/Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=api/Cargo.lock,target=Cargo.lock \
    --mount=type=bind,source=api/.sqlx,target=.sqlx \
    --mount=type=bind,source=api/openapi.yml,target=openapi.yml \
    --mount=type=cache,target=/app/target/ \
    --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --locked --release && \
    cp ./target/release/$APP_NAME /bin/server


# ── Final stage (Rust server + Python YOLO runtime) ──────────
FROM nvidia/cuda:13.1.1-cudnn-runtime-ubuntu24.04 AS final
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    python3 \
    python3-pip \
    libgl1 \
    libglx-mesa0 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY yolo/requirements.txt /tmp/yolo-requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages torch torchvision \
    && pip3 install --no-cache-dir --break-system-packages -r /tmp/yolo-requirements.txt

COPY --from=build /bin/server /bin/server
COPY api/AIPrompt.json /app/AIPrompt.json
# The Rust server runs `python3 $YOLO_SCRIPT_PATH` with cwd=/app,
# and predict.py resolves its default model as yolo_scripts/models/...
COPY yolo/predict.py /app/yolo_scripts/predict.py
COPY yolo/models /app/yolo_scripts/models

RUN mkdir -p /root/.config/Ultralytics /app/uploads /app/yolo_scripts/results \
    && chmod -R 700 /root/.config/Ultralytics

ENV YOLO_SCRIPT_PATH=/app/yolo_scripts/predict.py
ENV YOLO_DEVICE=0

EXPOSE 3000
CMD ["/bin/server"]
