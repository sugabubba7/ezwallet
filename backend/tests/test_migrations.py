"""Upgrade a database created at revision 0001 and check data is carried over."""
from alembic import command
from sqlalchemy import create_engine, text

from app.migrations import alembic_config


def test_0002_maps_colors_and_backfills_chats(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    cfg = alembic_config()
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.attributes["skip_logging"] = True

    command.upgrade(cfg, "0001")
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text(
            "INSERT INTO users (id,email,pin_failed_attempts,token_version,created_at,updated_at) "
            "VALUES (1,'a@b.co',0,0,'2026-01-01','2026-01-01')"))
        for i, color in enumerate(["sapphire", "peach", "ivory", "mint", "lilac", "graphite"]):
            c.execute(text(
                "INSERT INTO wallet_cards (user_id,label,category,color,content_encrypted,position,created_at,updated_at) "
                "VALUES (1,:l,'other',:c,x'00',:p,'2026-01-01','2026-01-01')"), {"l": f"c{i}", "c": color, "p": i})
        c.execute(text(
            "INSERT INTO chat_summaries (user_id,title,model,tags,is_sample,created_at) "
            "VALUES (1,'t','m','[]',0,'2026-01-02 10:00:00')"))

    command.upgrade(cfg, "head")
    with eng.connect() as c:
        colors = [r[0] for r in c.execute(text("SELECT color FROM wallet_cards ORDER BY position"))]
        chat = c.execute(text("SELECT message_count, updated_at, created_at FROM chat_summaries")).one()
    assert colors == ["ember", "amber", "cream", "copper", "rust", "noir"]
    assert chat[0] == 2 and chat[1] == chat[2]

    command.downgrade(cfg, "0001")
    with eng.connect() as c:
        assert c.execute(text("SELECT color FROM wallet_cards WHERE position=0")).scalar() == "sapphire"
