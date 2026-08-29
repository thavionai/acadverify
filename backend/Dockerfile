# Use a lightweight official Python image
FROM python:3.11-slim-bookworm

# Prevent Python from writing .pyc files and keep stdout/stderr unbuffered
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file first to leverage Docker layer caching
COPY requirements.txt .

# Install dependencies without caching the pip packages to keep the image small
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code into the container
COPY . .

# Expose the port defined in your docker-compose.yml
EXPOSE 8080

# Command to run the FastAPI application
# (Assuming your FastAPI instance 'app' is inside 'app/main.py')
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]