FROM qdrant/qdrant:latest

# Install curl for health checks
# Qdrant images are typically Debian-based
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

