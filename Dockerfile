FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
# База даних і фото лежать у /data — підключіть сюди постійний диск (volume).
ENV HOST=0.0.0.0 PORT=8000 DATA_DIR=/data COOKIE_SECURE=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python3", "server.py"]
