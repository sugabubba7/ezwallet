"""Create backend/.env from .env.example with freshly generated secrets.

Usage:  python scripts/init_env.py   (will not overwrite an existing .env)
"""
import secrets
import sys
from pathlib import Path

from cryptography.fernet import Fernet

root = Path(__file__).resolve().parent.parent
env, example = root / ".env", root / ".env.example"
if env.exists():
    sys.exit(".env already exists; leaving it untouched.")

text = example.read_text()
text = text.replace("JWT_SECRET=\n", f"JWT_SECRET={secrets.token_urlsafe(48)}\n", 1)
text = text.replace("WALLET_ENCRYPTION_KEY=\n", f"WALLET_ENCRYPTION_KEY={Fernet.generate_key().decode()}\n", 1)
env.write_text(text)
print(f"Wrote {env} with new JWT_SECRET and WALLET_ENCRYPTION_KEY.")
