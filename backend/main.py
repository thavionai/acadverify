from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.blocklist import register_blocklist_middleware
from core.error_handlers import register_error_handlers
from routers import issue, revoke, verify
from services import chain_service_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await chain_service_client.startup()
    logger.info("Credential backend started.")
    yield
    await chain_service_client.shutdown()
    logger.info("Credential backend shut down.")


app = FastAPI(
    title="Credential Verification API",
    version="1.0.0",
    lifespan=lifespan,
)

register_error_handlers(app)
register_blocklist_middleware(app)

app.include_router(issue.router)
app.include_router(revoke.router)
app.include_router(verify.router)


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict:
    return {"status": "ok"}
