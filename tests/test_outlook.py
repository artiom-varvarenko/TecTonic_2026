import xml.etree.ElementTree as ET

import pytest

from trustlabel.outlook import ADDIN_ID, TASKPANE_PATH, manifest_xml

NS = {
    "o": "http://schemas.microsoft.com/office/appforoffice/1.1",
    "v": "http://schemas.microsoft.com/office/mailappversionoverrides",
    "bt": "http://schemas.microsoft.com/office/officeappbasictypes/1.0",
}


def test_manifest_points_every_url_at_the_given_https_base():
    root = ET.fromstring(manifest_xml("https://trust.example.com:8443/").encode())
    base = "https://trust.example.com:8443"
    assert root.find("o:Id", NS).text == ADDIN_ID
    assert root.find("o:AppDomains/o:AppDomain", NS).text == base
    assert root.find("o:FormSettings/o:Form/o:DesktopSettings/o:SourceLocation", NS).get("DefaultValue") == (
        base + TASKPANE_PATH
    )
    assert root.find("o:Permissions", NS).text == "ReadItem"
    urls = [root.find(f"o:{tag}", NS).get("DefaultValue") for tag in ("IconUrl", "HighResolutionIconUrl")]
    urls += [node.get("DefaultValue") for node in root.iter(f"{{{NS['bt']}}}Image") if node.get("DefaultValue")]
    urls += [node.get("DefaultValue") for node in root.iter(f"{{{NS['bt']}}}Url")]
    assert len(urls) == 6 and all(url.startswith(base + "/static/outlook/") for url in urls)
    assert root.find("v:VersionOverrides", NS) is not None


def test_manifest_allows_local_http_for_development():
    root = ET.fromstring(manifest_xml("http://127.0.0.1:8000").encode())
    assert root.find("o:AppDomains/o:AppDomain", NS).text == "http://127.0.0.1:8000"


@pytest.mark.parametrize(
    "base",
    [
        "http://example.com",
        "javascript:alert(1)",
        "https://example.com/path",
        "https://example.com?x=1",
        "https://example.com#frag",
        "https://user:pw@example.com",
        "https://a<b>&\".example.com",
        "https://",
        "ftp://example.com",
    ],
)
def test_manifest_rejects_unsafe_base_urls(base):
    with pytest.raises(ValueError):
        manifest_xml(base)


def test_only_the_outlook_pane_may_be_framed_and_only_by_outlook(make_client):
    app_client = make_client()
    pane = app_client.get(TASKPANE_PATH)
    assert pane.status_code == 200
    csp = pane.headers["content-security-policy"]
    assert "frame-ancestors https://outlook.office.com" in csp and "https://outlook.live.com" in csp
    assert "x-frame-options" not in pane.headers
    page = app_client.get("/")
    assert page.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in page.headers["content-security-policy"]


def test_manifest_is_served_only_for_a_public_https_address(make_client):
    assert make_client().get("/outlook/manifest.xml").status_code == 503
    public = make_client(public_url="https://trust.example.com").get("/outlook/manifest.xml")
    assert public.status_code == 200 and public.headers["content-type"].startswith("application/xml")
    assert "https://trust.example.com/static/outlook/taskpane.html" in public.text
