FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --upgrade pip setuptools wheel
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# 3) СНАЧАЛА ставим CPU torch (важно: отдельный индекс)
RUN pip install --no-cache-dir --default-timeout=300 \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.3.1

COPY app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt


RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg patchelf \
 && rm -rf /var/lib/apt/lists/*

RUN python - <<'PY'
import glob, site, os, subprocess, sys
paths = site.getsitepackages()
cands = []
for p in paths:
    cands += glob.glob(os.path.join(p, "ctranslate2", "libctranslate2*.so*"))
print("ctranslate2 libs:", cands)
for so in cands:
    subprocess.run(["patchelf", "--clear-execstack", so], check=False)
PY


COPY app /app/app
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh


ENV PYTHONUNBUFFERED=1
CMD ["/app/start.sh"]
