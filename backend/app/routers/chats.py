from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import ChatSummary, User
from ..schemas import ChatListResponse, ChatOut, MessageResponse

router = APIRouter(prefix="/api/v1/chats", tags=["chats"])


def _owned(db: Session, user: User, chat_id: int) -> ChatSummary:
    chat = db.get(ChatSummary, chat_id)
    if not chat or chat.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat summary not found")
    return chat


@router.get("", response_model=ChatListResponse)
def list_chats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatListResponse:
    rows = db.scalars(
        select(ChatSummary).where(ChatSummary.user_id == user.id).order_by(ChatSummary.created_at.desc(), ChatSummary.id.desc())
    )
    return ChatListResponse(chats=[ChatOut.model_validate(c) for c in rows])


@router.get("/{chat_id}", response_model=ChatOut)
def get_chat(chat_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ChatOut:
    return ChatOut.model_validate(_owned(db, user, chat_id))


@router.delete("/{chat_id}", response_model=MessageResponse)
def delete_chat(chat_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    db.delete(_owned(db, user, chat_id))
    db.commit()
    return MessageResponse(message="Chat summary deleted")
