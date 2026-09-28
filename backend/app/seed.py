"""Optional starter content so a fresh account has something to explore.

Controlled by SEED_DEMO_DATA. Sample chat summaries are flagged `is_sample`
and are metadata only, like every other summary.
"""
from sqlalchemy.orm import Session

from .models import ChatSummary, User, WalletCard
from .security import encrypt_text

STARTER_CARDS = [
    ("Writing Voice", "personal", "sapphire",
     "I write in a warm, concise tone. Prefer short paragraphs, active voice, and no corporate jargon."),
    ("Project Atlas Brief", "work", "ivory",
     "Atlas is our Q4 internal analytics revamp. Stack: FastAPI + Postgres. Deadline: 15 Dec. Stakeholder: Priya (VP Eng)."),
    ("Health Notes", "medical", "peach",
     "Allergic to penicillin. Mild asthma, uses inhaler as needed. Prefers morning appointments."),
]

SAMPLE_CHATS = [
    ("Refactor auth middleware", ["code", "fastapi", "security"], "Project Atlas Brief"),
    ("Weekly update email", ["writing", "work"], "Writing Voice"),
    ("Trip packing checklist", ["travel", "planning"], None),
    ("SQL index tuning", ["code", "postgres"], "Project Atlas Brief"),
    ("Doctor visit questions", ["health"], "Health Notes"),
]


def seed_user(db: Session, user: User, model: str) -> None:
    for i, (label, category, color, content) in enumerate(STARTER_CARDS):
        db.add(WalletCard(user=user, label=label, category=category, color=color,
                          content_encrypted=encrypt_text(content), position=i))
    for title, tags, card in SAMPLE_CHATS:
        db.add(ChatSummary(user=user, title=title, model=model, tags=tags, card_label=card, is_sample=True))
