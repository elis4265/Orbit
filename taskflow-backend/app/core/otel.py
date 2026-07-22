import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def configure_otel(service_name: str = "taskflow-backend") -> None:
    """Set up OpenTelemetry tracing.

    Activates only when OTLP_ENDPOINT is set (prod/staging) or
    OTEL_TRACES_EXPORTER=console is set explicitly (local debug).
    No-op in all other cases — avoids console spam in tests.
    """
    otlp_endpoint = os.getenv("OTLP_ENDPOINT")
    console_trace = os.getenv("OTEL_TRACES_EXPORTER") == "console"

    if not otlp_endpoint and not console_trace:
        return

    resource = Resource.create({SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)

    if otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint}/v1/traces")
    else:
        from opentelemetry.sdk.trace.export import ConsoleSpanExporter
        exporter = ConsoleSpanExporter()

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)


def instrument_app(app) -> None:
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    FastAPIInstrumentor.instrument_app(app)


def instrument_db() -> None:
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from app.database import engine
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
