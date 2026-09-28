"""Optional starter content so a fresh account has something to explore.

Controlled by SEED_DEMO_DATA. Sample chat summaries are flagged `is_sample`
and are metadata only, like every other summary.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .models import ChatSummary, User, WalletCard
from .security import encrypt_text

STARTER_CARDS = [
    ("Writing Voice", "personal", "ember",
     "I write in a warm, concise tone. Prefer short paragraphs, active voice, and no corporate jargon."),
    ("Project Atlas Brief", "work", "cream",
     "Atlas is our Q4 internal analytics revamp. Stack: FastAPI + Postgres. Deadline: 15 Dec. Stakeholder: Priya (VP Eng)."),
    ("Health Notes", "medical", "amber",
     "Allergic to penicillin. Mild asthma, uses inhaler as needed. Prefers morning appointments."),
]

# (title, tags, card, message_count, hours_ago)
SAMPLE_CHATS = [
    ("Refactor auth middleware", ["code", "fastapi", "security"], "Project Atlas Brief", 38, 72),
    ("Weekly update email", ["writing", "work"], "Writing Voice", 8, 50),
    ("Trip packing checklist", ["travel", "planning"], None, 14, 30),
    ("SQL index tuning", ["code", "postgres"], "Project Atlas Brief", 22, 9),
    ("Doctor visit questions", ["health"], "Health Notes", 6, 2),
]


def seed_user(db: Session, user: User, model: str) -> None:
    for i, (label, category, color, content) in enumerate(STARTER_CARDS):
        db.add(WalletCard(user=user, label=label, category=category, color=color,
                          content_encrypted=encrypt_text(content), position=i))
    now = datetime.now(timezone.utc)
    for title, tags, card, count, hours_ago in SAMPLE_CHATS:
        at = now - timedelta(hours=hours_ago)
        db.add(ChatSummary(user=user, title=title, model=model, tags=tags, card_label=card,
                           message_count=count, is_sample=True, created_at=at, updated_at=at))
