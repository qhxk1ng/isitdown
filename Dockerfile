# Multi-stage build: build React frontend, then build Python app image

# --- frontend build stage ---
FROM node:18-alpine AS frontend-builder
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json* ./ 
COPY frontend/ ./
# Use npm install (package-lock.json may be missing). For reproducible builds prefer adding package-lock.json and using `npm ci`.
RUN npm install
RUN npm run build
 

# --- final stage: python app ---
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

# Install system deps for nmap so /api/nmap works in the container
RUN apt-get update \
 && apt-get install -y --no-install-recommends nmap \
 && rm -rf /var/lib/apt/lists/*

# Copy python requirements and app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/

# Copy built frontend
COPY --from=frontend-builder /src/dist ./frontend/dist

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
