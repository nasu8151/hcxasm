# Build Windows Electron app in a container using Wine
FROM electronuserland/builder:wine

# Avoid prompts and ensure consistent locale
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Tokyo \
    ELECTRON_CACHE=/root/.cache/electron \
    ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
    CSC_IDENTITY_AUTO_DISCOVERY=false

WORKDIR /project

# Tips: we install deps at runtime (mounted dir), but you can uncomment for cached builds
# COPY package.json package-lock.json* yarn.lock* ./
# RUN npm ci

# Default command just shows versions; compose overrides with build command
CMD ["bash", "-lc", "node -v && npm -v && electron-builder --version"]
