FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
ENV DATABASE_URL=sqlite:////data/resq-relay.db
RUN useradd --create-home --uid 10001 resq && mkdir /data && chown resq:resq /data /app
VOLUME ["/data"]
EXPOSE 8000
USER resq
HEALTHCHECK --interval=20s --timeout=4s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
