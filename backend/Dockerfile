# The AWS Lambda Web Adapter runs alongside the app and translates API
# Gateway events into plain HTTP requests against it — so the Flask app
# itself has zero Lambda-specific code and runs identically with
# `flask --app app run` locally.
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 AS adapter

FROM python:3.12-slim

COPY --from=adapter /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV PORT=8000
EXPOSE 8000

CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
