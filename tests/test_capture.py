from conftest import login

from trustlabel.ai import ExtractedClaim

MESSAGE = "From November meal voucher orders close on the 8th."


class StubExtractor:
    def __init__(self, quote: str) -> None:
        self.quote = quote

    def extract(self, text, topics, today):
        return [
            ExtractedClaim(
                topic_id="payroll.meal_vouchers_order",
                value="8",
                quote=self.quote,
                client_specific=False,
                valid_until=None,
            )
        ]


def test_captured_chat_claim_is_graded_and_flagged_against_policy(make_client):
    lotte = login(make_client(StubExtractor("close on the 8th")), "lotte")
    response = lotte.post("/api/capture", json={"text": MESSAGE, "client_id": "vandam"})

    assert response.status_code == 201
    body = response.json()
    result = body["result"]
    assert result["answer"]["status"] == "conflict"
    captured = next(s for s in result["sources"] if s["id"] == body["captured_item_id"])
    assert (captured["kind"], captured["value"], captured["quote"]) == ("teams_message", "8", "close on the 8th")


def test_capture_rejects_claims_without_verbatim_quote(make_client):
    lotte = login(make_client(StubExtractor("close on the 8th of each month")), "lotte")
    response = lotte.post("/api/capture", json={"text": MESSAGE, "client_id": "vandam"})
    assert response.status_code == 422
