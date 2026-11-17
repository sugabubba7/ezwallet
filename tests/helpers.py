import uuid

TOKEN = "t" * 32


def env(payload, *, request_id=None, run_id=None, time_budget_ms=60000, budget=None):
    return {"request_id": request_id or str(uuid.uuid4()), "run_id": run_id or str(uuid.uuid4()),
            "time_budget_ms": time_budget_ms, "budget": budget or {"max_steps": 10, "max_fetches": 8, "max_tokens": 40000},
            "payload": payload}


def auth(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}
