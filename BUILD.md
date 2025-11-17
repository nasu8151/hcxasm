# Docker Build for HCx Visual Assembler

This repository includes a Dockerized build environment to package the Electron app for Windows without local toolchain headaches.

## Prerequisites
- Docker Desktop (Linux containers mode)
- Internet access for dependency installation

## Quick Start (PowerShell)
```powershell
# 1) Build the image (first time only or after Dockerfile changes)
docker compose build

# 2) Build Windows artifacts inside container
npm run build:win:docker

# Artifacts will be created in the local "dist" folder.
```

## Notes
- Caches are persisted in Docker volumes to speed up subsequent builds.
- Code signing is disabled by default (`CSC_IDENTITY_AUTO_DISCOVERY=false`).
- The builder uses image `electronuserland/builder:wine` to create Windows installers from Linux container.
- To open a shell inside the build container:
```powershell
npm run docker:sh
```
