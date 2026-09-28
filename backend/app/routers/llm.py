from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .. import gemini
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user, vault_is_unlocked
from ..models import ChatSummary, User
from ..schemas import ChatOut, ExecuteRequest, ExecuteResponse, LlmStatus
from ..security import decrypt_text
from .wallet import get_owned_card

router = APIRouter(prefix="/api/v1/llm", tags=["llm"])


@router.get("/status", response_model=LlmStatus)
def llm_status(_: User = Depends(get_current_user)) -> LlmStatus:
    s = get_settings()
    return LlmStatus(configured=bool(s.gemini_api_key), model=s.gemini_model, endpoint="generativelanguage.googleapis.com")


@router.post("/execute", response_model=ExecuteResponse)
def execute(
    body: ExecuteRequest,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExecuteResponse:
    settings = get_settings()
    response.headers["Cache-Control"] = "no-store"

    # Continuing a session? Resolve it first so a bad id fails before any upstream call.
    chat: ChatSummary | None = None
    if body.chat_id is not None:
        chat = db.get(ChatSummary, body.chat_id)
        if not chat or chat.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat summary not found")
        if chat.is_sample:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sample sessions can't be continued; start a new chat")

    card_label: str | None = None
    card_category: str | None = None
    context: str | None = None
    if body.card_id is not None:
        card = get_owned_card(db, user, body.card_id)  # 404 if not the user's
        if not vault_is_unlocked(request, user):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Vault is locked. Enter your PIN to use a context card.")
        card_label, card_category = card.label, card.category
        context = decrypt_text(card.content_encrypted)

    history = [(t.role, t.text) for t in body.history]
    contents = gemini.build_contents(body.prompt, context, card_label, history)
    context = None  # drop our references to plaintext immediately
    history.clear()
    try:
        result = gemini.generate(contents, settings.gemini_model)
    except gemini.GeminiNotConfigured:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Gemini is not configured. Set GEMINI_API_KEY in backend/.env."
        ) from None
    except gemini.GeminiError as exc:
        code = status.HTTP_400_BAD_REQUEST if exc.status_code == 400 else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(code, f"Gemini error: {exc}") from None
    finally:
        gemini.scrub(contents)

    # Persist METADATA ONLY: never the prompt, context, history or output.
    now = datetime.now(timezone.utc)
    if chat is None:
        tags = list(body.tags)
        if card_category and len(tags) < 6 and card_category not in (t.lower() for t in tags):
            tags.append(card_category)
        title = (body.title or "").strip() or f"Session · {datetime.now().strftime('%b %d, %H:%M')}"
        chat = ChatSummary(
            user_id=user.id, title=title, model=settings.gemini_model, tags=tags, card_label=card_label,
            message_count=0, created_at=now,
        )
        db.add(chat)
    elif card_label and not chat.card_label:
        chat.card_label = card_label
    chat.message_count = (chat.message_count or 0) + 2  # this user text + the model's reply
    chat.updated_at = now
    chat.prompt_tokens = result.prompt_tokens
    chat.output_tokens = result.output_tokens
    chat.latency_ms = result.latency_ms
    db.commit()

    output = result.text
    del result
    return ExecuteResponse(output=output, model=settings.gemini_model, chat=ChatOut.model_validate(chat))
