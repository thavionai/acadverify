FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector.py .
VOLUME /data
EXPOSE 9700
CMD ["python", "-u", "detector.py"]
