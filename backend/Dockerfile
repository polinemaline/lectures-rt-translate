FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    patchelf \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip setuptools wheel

RUN pip install --no-cache-dir --default-timeout=300 \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.3.1

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

RUN python -c "import websockets; import faster_whisper; import psycopg2; print('deps OK')"

RUN python - <<'PY'
import glob
import os
import site
import subprocess

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
