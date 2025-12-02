FROM python:3.11-slim
WORKDIR /app

COPY app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh


ENV PYTHONUNBUFFERED=1
CMD ["/app/start.sh"]


# RUN if [ -f /etc/apt/sources.list ]; then \
#       sed -i 's|deb.debian.org|deb.debian.org.cloudflare-dns.com|g' /etc/apt/sources.list; \
#     fi && \
#     apt-get update --fix-missing && \
#     apt-get install -y --no-install-recommends ffmpeg && \
#     rm -rf /var/lib/apt/lists/*
