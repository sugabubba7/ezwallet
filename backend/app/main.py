from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .migrations import run_migrations
from .routers import account, auth, chats, llm, users, wallet
from .seed import ensure_grader_account


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()  # automatic schema migration on startup
    ensure_grader_account()  # creates GRADER_USERNAME if configured and missing
    yield


app = FastAPI(
    title="EZ Wallet API",
    description="LLM Data Wallet with an encrypted context vault and a zero-data-retention Gemini proxy.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Vault-Token"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api/v1/wallet") or request.url.path.startswith("/api/v1/llm"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_as_400(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Report malformed input as 400 Bad Request with a readable message."""
    errors = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
        msg = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
        errors.append({"field": loc or None, "message": msg})
    first = errors[0] if errors else {"field": None, "message": "Invalid request"}
    detail = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": detail, "errors": errors})


@app.get("/healthz", tags=["meta"])
@app.get("/api/v1/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


# Assignment contract: /api/auth/* and /api/users/:id
app.include_router(auth.router, prefix="/api/auth")
app.include_router(users.router)
# Web-app API (same auth handlers, plus wallet, chats and the Gemini proxy)
app.include_router(auth.router, prefix="/api/v1/auth")
for r in (account.router, wallet.router, chats.router, llm.router):
    app.include_router(r)
