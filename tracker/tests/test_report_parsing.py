"""The model's `finish(report)` often arrives mangled by formatting, not by content. Those slips must be
undone before validation (so a good report is not rejected), while provenance stays strict."""
import json

import pytest

from tracker.dedupe import canonical_url
from tracker.finish import coerce_report, validate, validate_salvage

URL = "https://example.com/news/launch"
BODY = ("Acme today announced Acme Vault, an encrypted memory layer for AI assistants. "
        "The company said Acme Vault stores user context with end-to-end encryption and launched on October 1.")
FETCHED = {canonical_url(URL): {"text": BODY, "title": "Acme launches Vault", "final_url": URL}}
KW = dict(k=5, known={}, fetched=FETCHED, auto_merge=0.8, min_trust=0.3)

DEV = {"rank": 1, "title": "Acme launches Acme Vault",
       "summary": "Acme launched an encrypted memory layer for AI assistants.",
       "sources": [{"url": URL, "quote": "Acme today announced Acme Vault, an encrypted memory layer for AI assistants."}]}
GOOD = {"developments": [DEV]}


def ok(report):
    devs, errs = validate(report, **KW)
    assert errs == [], errs
    assert [d.title for d in devs] == ["Acme launches Acme Vault"]


def test_object_is_accepted():
    ok(GOOD)


def test_report_as_json_string():
    ok(json.dumps(GOOD))


def test_report_in_markdown_fences_with_chatter():
    ok("Here is my report:\n```json\n" + json.dumps(GOOD, indent=2) + "\n```\nLet me know!")


def test_raw_newline_inside_a_string_value():
    text = json.dumps(GOOD).replace("memory layer for AI assistants.\"", "memory layer\nfor AI assistants.\"", 1)
    assert "\n" in text
    with pytest.raises(json.JSONDecodeError):
        json.loads(text)  # what the old code did -> "report must be an object..."
    report, err = coerce_report(text)
    assert err is None and report["developments"][0]["title"] == "Acme launches Acme Vault"


def test_bare_list_and_nested_and_alternate_key():
    ok([DEV])
    ok({"report": GOOD})
    ok({"items": [DEV]})
    ok(json.dumps({"report": GOOD}))  # whole tool arguments delivered as unparsed text


def test_unparseable_text_gets_a_precise_message():
    _, errs = validate('{"developments": [{"rank": 1, "title": "cut off', **KW)
    assert len(errs) == 1 and "not valid JSON" in errs[0] and "character" in errs[0]
    _, errs = validate("I could not find anything.", **KW)
    assert "no JSON in it" in errs[0]


def test_salvage_path_uses_the_same_coercion():
    devs, errs = validate_salvage("```json\n" + json.dumps(GOOD) + "\n```", **KW)
    assert len(devs) == 1 and errs == []


def test_provenance_is_still_strict_after_coercion():
    bad = {"developments": [{**DEV, "sources": [{"url": URL, "quote": "Acme said something it never said in this article."}]}]}
    _, errs = validate(json.dumps(bad), **KW)
    assert errs and "does not appear in the fetched text" in errs[0]
