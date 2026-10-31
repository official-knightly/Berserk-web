FROM rustlang/rust:nightly AS engine-build
WORKDIR /app
COPY ["berserk engine/", "./engine/"]
WORKDIR /app/engine
# Compatibility adjustment only in this container build copy; repository source remains unchanged.
RUN sed -i 's/^edition = "2026"$/edition = "2024"/' Cargo.toml \
 && cargo build --release --bin berserk

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=engine-build /app/engine/target/release/berserk /app/berserk
COPY api/server.mjs /app/server.mjs
ENV PORT=8787
ENV ENGINE_PATH=/app/berserk
EXPOSE 8787
CMD ["node", "server.mjs"]
