from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user, require_unlocked_vault, set_vault_cookie, vault_is_unlocked
from ..models import User, WalletCard
from ..schemas import (
    CardCreate,
    CardListResponse,
    CardMeta,
    CardRevealed,
    CardUpdate,
    MessageResponse,
    UnlockRequest,
    UnlockResponse,
)
from ..security import VAULT_COOKIE, create_vault_token, decrypt_text, encrypt_text, verify_secret

router = APIRouter(prefix="/api/v1/wallet", tags=["wallet"])


def _user_cards(db: Session, user: User) -> list[WalletCard]:
    return list(
        db.scalars(
            select(WalletCard).where(WalletCard.user_id == user.id).order_by(WalletCard.position, WalletCard.id)
        )
    )


def _reveal(card: WalletCard) -> CardRevealed:
    return CardRevealed(
        id=card.id, label=card.label, category=card.category, color=card.color,
        position=card.position, created_at=card.created_at, content=decrypt_text(card.content_encrypted),
    )


def get_owned_card(db: Session, user: User, card_id: int) -> WalletCard:
    card = db.get(WalletCard, card_id)
    if not card or card.user_id != user.id:  # never leak other users' card ids
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


@router.get("/cards", response_model=CardListResponse)
def list_cards(
    request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> CardListResponse:
    """Card metadata only. Sensitive content is never returned here."""
    cards = _user_cards(db, user)
    return CardListResponse(
        cards=[CardMeta.model_validate(c) for c in cards], locked=not vault_is_unlocked(request, user)
    )


@router.post("/unlock", response_model=UnlockResponse)
def unlock(
    body: UnlockRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UnlockResponse:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if user.pin_hash is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No vault PIN set. Create one in Account settings.")

    locked_until = user.pin_locked_until
    if locked_until and locked_until.tzinfo is None:  # SQLite drops tzinfo
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until and locked_until > now:
        wait = int((locked_until - now).total_seconds()) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many incorrect PIN attempts. Try again in {wait} seconds.",
            headers={"Retry-After": str(wait)},
        )

    if not verify_secret(body.pin, user.pin_hash):
        user.pin_failed_attempts += 1
        remaining = settings.pin_max_attempts - user.pin_failed_attempts
        if remaining <= 0:
            user.pin_failed_attempts = 0
            user.pin_locked_until = now + timedelta(minutes=settings.pin_lockout_minutes)
        db.commit()
        detail = "Incorrect PIN" + (f" ({remaining} attempts left)" if remaining > 0 else ". Vault locked temporarily.")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail)

    user.pin_failed_attempts = 0
    user.pin_locked_until = None
    db.commit()
    set_vault_cookie(response, create_vault_token(user.id, user.token_version))
    return UnlockResponse(
        cards=[_reveal(c) for c in _user_cards(db, user)],
        expires_in_seconds=settings.vault_session_minutes * 60,
    )


@router.post("/lock", response_model=MessageResponse)
def lock(response: Response, _: User = Depends(get_current_user)) -> MessageResponse:
    response.delete_cookie(VAULT_COOKIE, path="/")
    return MessageResponse(message="Vault locked")


@router.get("/cards/revealed", response_model=list[CardRevealed])
def revealed_cards(
    user: User = Depends(require_unlocked_vault), db: Session = Depends(get_db)
) -> list[CardRevealed]:
    return [_reveal(c) for c in _user_cards(db, user)]


@router.post("/cards", response_model=CardRevealed, status_code=status.HTTP_201_CREATED)
def create_card(
    body: CardCreate, user: User = Depends(require_unlocked_vault), db: Session = Depends(get_db)
) -> CardRevealed:
    next_pos = db.scalar(select(func.coalesce(func.max(WalletCard.position), -1)).where(WalletCard.user_id == user.id))
    card = WalletCard(
        user_id=user.id, label=body.label.strip(), category=body.category, color=body.color,
        content_encrypted=encrypt_text(body.content), position=next_pos + 1,
    )
    db.add(card)
    db.commit()
    return _reveal(card)


@router.put("/cards/{card_id}", response_model=CardRevealed)
def update_card(
    card_id: int, body: CardUpdate, user: User = Depends(require_unlocked_vault), db: Session = Depends(get_db)
) -> CardRevealed:
    card = get_owned_card(db, user, card_id)
    if body.label is not None:
        card.label = body.label.strip()
    if body.category is not None:
        card.category = body.category
    if body.color is not None:
        card.color = body.color
    if body.content is not None:
        card.content_encrypted = encrypt_text(body.content)
    db.commit()
    return _reveal(card)


@router.delete("/cards/{card_id}", response_model=MessageResponse)
def delete_card(
    card_id: int, user: User = Depends(require_unlocked_vault), db: Session = Depends(get_db)
) -> MessageResponse:
    card = get_owned_card(db, user, card_id)
    db.delete(card)
    db.commit()
    return MessageResponse(message="Card deleted")
