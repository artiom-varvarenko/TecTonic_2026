from conftest import login
from test_capture import StubExtractor
from test_channels import pane

from trustlabel.app import EMAIL_CAPTURE_CHARS

# Outlook hands over non-breaking spaces; the quote below uses plain ones.
EMAIL = {
    "subject": "Meal vouchers",
    "sender_name": "Anna Peeters",
    "sender_email": "anna@vandam.example",
    "body": "Hi,\u00a0from November meal voucher orders close\u00a0on the 8th.\n\nAnna",
    "client_id": "vandam",
}


def test_email_capture_needs_the_personal_key(make_client):
    app_client = make_client(StubExtractor("close on the 8th"))
    assert app_client.post("/api/v1/capture", json=EMAIL).status_code == 401
    assert login(app_client, "lotte").post("/api/v1/capture", json=EMAIL).status_code == 401


def test_email_is_stored_as_a_graded_email_source(make_client):
    outlook = pane(make_client(StubExtractor("close on the 8th")))
    response = outlook.post("/api/v1/capture", json=EMAIL | {"body": EMAIL["body"] + " x" * 5_000})
    assert response.status_code == 201, response.text
    data = response.json()
    stored = next(s for s in data["result"]["sources"] if s["id"] == data["captured_item_id"])
    assert stored["kind"] == "email"
    assert stored["title"] == "Meal vouchers"
    assert stored["source"] == "Email · from Anna Peeters <anna@vandam.example>"
    assert stored["body"].startswith("Meal vouchers Hi, from November") and len(stored["body"]) <= EMAIL_CAPTURE_CHARS
    assert stored["quote"] == "close on the 8th"
    [claim] = data["claims"]
    assert claim["topic"]["id"] == "payroll.meal_vouchers_order"
    assert claim["quote"] == "close on the 8th" and claim["grade"] == stored["grade"]


def test_email_without_subject_or_sender_gets_default_labels(make_client):
    outlook = pane(make_client(StubExtractor("close on the 8th")))
    email = {"body": "Orders close on the 8th.", "client_id": "vandam"}
    data = outlook.post("/api/v1/capture", json=email).json()
    stored = next(s for s in data["result"]["sources"] if s["id"] == data["captured_item_id"])
    assert (stored["title"], stored["source"]) == ("Email", "Email · captured via TrustLabel")


def test_email_capture_stays_inside_the_portfolio(make_client):
    outlook = pane(make_client(StubExtractor("close on the 8th")))
    assert outlook.post("/api/v1/capture", json=EMAIL | {"client_id": "noordhaven"}).status_code == 403


def test_email_without_a_verbatim_claim_is_rejected(make_client):
    outlook = pane(make_client(StubExtractor("close on the 8th of each month")))
    assert outlook.post("/api/v1/capture", json=EMAIL).status_code == 422


def test_email_capture_without_extractor_is_unavailable(make_client):
    assert pane(make_client()).post("/api/v1/capture", json=EMAIL).status_code == 503
