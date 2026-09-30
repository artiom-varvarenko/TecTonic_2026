from conftest import TODAY, login

from trustlabel.ai import ExtractedClaim, validate_extracted

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


def test_extracted_value_must_be_stated_by_its_quote(store):
    topic = store.topics_by_id["payroll.variables_cutoff"]
    text = "Van Dam has the twenty-fifth as cut-off; the old rule was the 20th."
    claims = [
        ExtractedClaim(topic_id=topic.id, value="3", quote="the 20th", valid_until=None),
        ExtractedClaim(topic_id=topic.id, value="25", quote="the twenty-fifth as cut-off", valid_until=None),
    ]
    valid = validate_extracted(claims, text, {topic.id: topic}, TODAY)
    assert [(c.value, c.quote) for c in valid] == [("25", "the twenty-fifth as cut-off")]
