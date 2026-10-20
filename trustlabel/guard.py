"""Restricted-data guard: TrustLabel never answers questions about another person's pay or private data.

Keyword rules (EN/NL/FR), whole words, case-insensitive, checked before any topic matching. A sensitive
term alone is not enough, so policy questions ("when is the sick certificate due?", "what is the car
lease budget?") stay answerable: the question must also point at another person (a colleague or manager
word, a pronoun, a known person's name, or a possessive such as "his salary", "zijn loon", "son salaire").
Everyday health words ("sick", "ziek", "malade") are stricter still: they only count when the question
asks about a person's state ("Is Jonas sick?", "Why is my colleague ill?") or uses a possessive.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping

from .models import Person

RESTRICTED_MESSAGE = "TrustLabel doesn't share individual pay or personal data. Ask who decides instead:"
# The HR policy owner decides on pay and personal-data questions (data/people.json).
RESTRICTED_CONTACT_ID = "anke"

_PAY = (
    "salary", "salaries", "wage", "wages", "paycheck", "payslip", "bonus", "bonuses", "compensation",
    "remuneration", "loon", "lonen", "salaris", "salarissen", "wedde", "loonbrief", "loonstrook",
    "bezoldiging", "salaire", "salaires", "rémunération", "prime", "primes", "fiche de paie",
)
_EARN = (
    "earn", "earns", "earned", "earning", "earnings", "verdient", "verdienen", "verdiende",
    "gagne", "gagnes", "gagnent", "gagnait", "gagner",
)
_HEALTH = (
    "diagnosis", "medical condition", "medical file", "health", "burnout", "burn-out", "pregnant",
    "pregnancy", "diagnose", "gezondheid", "zwanger", "zwangerschap", "diagnostic", "santé",
    "enceinte", "grossesse",
)
_HEALTH_EVERYDAY = ("sick", "ill", "illness", "ziek", "ziekte", "malade", "maladie")
_PERFORMANCE = (
    "performance review", "performance reviews", "performance rating", "appraisal", "evaluation",
    "beoordeling", "evaluatie", "functioneringsgesprek", "évaluation", "entretien annuel",
)
_CONTACT = (
    "address", "home address", "private address", "private phone", "personal phone", "home phone",
    "private number", "personal number", "adres", "thuisadres", "woonadres", "privénummer",
    "adresse", "domicile", "numéro personnel", "téléphone personnel",
)
_LIVE = ("live", "lives", "woont", "habite", "habitent")
_OTHERS = (
    "colleague", "colleagues", "coworker", "coworkers", "co-worker", "co-workers", "teammate",
    "teammates", "manager", "boss", "supervisor", "someone", "somebody", "collega", "collega's",
    "collegas", "baas", "leidinggevende", "iemand", "collègue", "collègues", "chef", "patron",
    "quelqu'un",
)
_PRONOUNS = ("he", "she", "him", "hij", "hem", "elle", "lui")
_POSSESSIVES = ("his", "her", "zijn", "haar", "son", "sa", "ses")
_SELF = ("i", "we", "my", "our", "ik", "wij", "mijn", "onze", "je", "j", "nous", "mon", "ma", "mes", "notre")
_ARTICLES = ("the", "a", "an", "my", "de", "het", "een", "die", "dat", "le", "la", "les", "des", "du", "mon")
# Process phrases that mention a sensitive word without asking for anyone's data.
_PROCESS = re.compile(
    r"(?<![\w-])(?:(?:sick|medical|doctor'?s?)[\s-]+(?:certificate|note|leave\s+certificate)|"
    r"(?:ziekte|medisch)[\s-]*(?:attest|briefje)|certificat\s+(?:de\s+maladie|médical)|"
    r"e-?mail\s+address(?:es)?|adresse\s+(?:e-?)?mail)(?![\w-])",
    re.IGNORECASE,
)


def _alt(phrases: Iterable[str]) -> str:
    return "|".join(re.escape(p).replace(r"\ ", r"\s+") for p in sorted(phrases, key=len, reverse=True))


def _rx(phrases: Iterable[str]) -> re.Pattern[str]:
    return re.compile(rf"(?<![\w-])(?:{_alt(phrases)})(?![\w-])", re.IGNORECASE)


_TERMS = {"pay": _rx(_PAY), "health": _rx(_HEALTH), "performance": _rx(_PERFORMANCE), "contact": _rx(_CONTACT)}
_EARN_RX = _rx(_EARN)
_LIVE_RX = _rx(_LIVE)
_EVERYDAY_RX = _rx(_HEALTH_EVERYDAY)
_SELF_RX = _rx(_SELF)
_POSSESSABLE = (("pay", _PAY), ("health", _HEALTH + _HEALTH_EVERYDAY), ("performance", _PERFORMANCE))


def restricted(question: str, names: Iterable[str] = ()) -> str | None:
    """The category ("pay", "health", "performance", "contact") when the question asks for another
    person's pay or private data, else None. `names`: people TrustLabel knows, matched as whole words."""
    text = _PROCESS.sub(" ", question)
    people = (*_OTHERS, *(n for n in names if n))
    person = rf"(?:{_alt(people)})"
    has_other = _rx((*people, *_PRONOUNS)).search(text) is not None
    for category, terms in _TERMS.items():
        if has_other and terms.search(text):
            return category
    if _EARN_RX.search(text) and (has_other or not _SELF_RX.search(text)):
        return "pay"
    if has_other and _LIVE_RX.search(text):
        return "contact"
    asks_state = re.compile(
        rf"^\W*(?:is|was|why\s+is|why\s+was|how\s+is|waarom\s+is|est-ce\s+que|pourquoi)\s+"
        rf"(?:(?:my|mijn|mon|ma|the|de|le|la)\s+)?(?:{person}|{_alt(_PRONOUNS)})(?![\w-])",
        re.IGNORECASE,
    )
    if _EVERYDAY_RX.search(text) and asks_state.search(text):
        return "health"
    owner = rf"(?:{_alt(_POSSESSIVES)}|{person}'s?)"
    filler = rf"(?:(?!(?:{_alt(_ARTICLES)})\s)[\w-]+\s+)?"
    for category, phrases in _POSSESSABLE:
        pattern = rf"(?<![\w-]){owner}\s+{filler}(?:{_alt(phrases)})(?![\w-])"
        if re.search(pattern, text, re.IGNORECASE):
            return category
    return None


def known_names(people: Mapping[str, Person]) -> list[str]:
    """Full and first names of everyone in the directory, for `restricted`."""
    return sorted({p.name for p in people.values()} | {p.name.split()[0] for p in people.values()})


def restricted_view(people: Mapping[str, Person]) -> dict:
    """The `restricted` answer: a calm refusal plus who decides."""
    contact = people.get(RESTRICTED_CONTACT_ID)
    return {
        "message": RESTRICTED_MESSAGE,
        "contact": {"name": contact.name, "title": contact.title} if contact and contact.active else None,
    }


def restricted_summary(view: dict) -> str:
    """Plain-text refusal for chat surfaces (Teams over MCP)."""
    contact = view["contact"]
    return f"{view['message']} {contact['name']} ({contact['title']})." if contact else view["message"]
