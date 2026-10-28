FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Unprivileged runtime user; the embedding model is cached under its home.
# The cache dir is created (and owned) here, not left for the named volume
# to create on first mount -- an unpopulated mount point otherwise gets
# created root-owned, which the unprivileged "bunko" user can't write to
# when the model download tries to cache into it at request time.
RUN useradd --create-home --uid 10001 bunko \
    && mkdir -p /home/bunko/.cache \
    && chown -R bunko:bunko /home/bunko
USER bunko

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
