FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector.py .
# Non-root user; /data is created here so the named volume inherits ownership.
RUN useradd -r -u 10001 detector && mkdir -p /data && chown detector:detector /data
USER detector
VOLUME /data
EXPOSE 9700
CMD ["python", "-u", "detector.py"]
