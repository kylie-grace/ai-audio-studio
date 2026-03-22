"""Structured JSON logging configuration for all platform services."""

from __future__ import annotations

import logging
import sys


def configure_logging(service_name: str = "studio") -> None:
    """Configure root logger with JSON output when python-json-logger is available."""
    try:
        from pythonjsonlogger import jsonlogger  # type: ignore[import]

        handler = logging.StreamHandler(sys.stdout)
        fmt = jsonlogger.JsonFormatter(
            "%(asctime)s %(name)s %(levelname)s %(message)s",
            rename_fields={"asctime": "ts", "levelname": "level"},
        )
        fmt.default_msec_format = "%s.%03d"
        handler.setFormatter(fmt)
        logging.root.handlers = [handler]
    except ImportError:
        logging.basicConfig(
            stream=sys.stdout,
            format="%(asctime)s %(name)s %(levelname)s %(message)s",
        )
    logging.root.setLevel(logging.INFO)
    logging.getLogger(service_name).info("Logging configured", extra={"service": service_name})
