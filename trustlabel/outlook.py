"""Outlook add-in: XML manifest and the CSP for the task pane served under /static/outlook/."""

import re
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

ADDIN_ID = "eb92eee8-efe8-49e2-98c1-324e33992741"
ASSET_PREFIX = "/static/outlook/"
TASKPANE_PATH = "/static/outlook/taskpane.html"
OFFICE_JS_ORIGIN = "https://appsforoffice.microsoft.com"
# Origins that frame add-in task panes in Outlook on the web (work/school and Outlook.com) and new Outlook
# on Windows. Classic Outlook desktop hosts the pane top-level in a WebView, so it needs no entry.
FRAME_ANCESTORS = (
    "https://outlook.office.com",
    "https://outlook.office365.com",
    "https://outlook.cloud.microsoft",
    "https://outlook.live.com",
    "https://*.officeapps.live.com",
)
OUTLOOK_CSP = (
    f"default-src 'self'; script-src 'self' {OFFICE_JS_ORIGIN}; style-src 'self'; img-src 'self' data:; "
    f"connect-src 'self'; frame-ancestors {' '.join(FRAME_ANCESTORS)}; base-uri 'none'; form-action 'self'"
)

_HOST = re.compile(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?")
_LOCAL_HOSTS = frozenset({"127.0.0.1", "localhost"})


def _base(base_url: str) -> str:
    try:
        parts = urlsplit(base_url.strip().rstrip("/"))
        port = parts.port
    except ValueError:
        raise ValueError("Invalid base URL") from None
    host = parts.hostname or ""
    if (
        parts.scheme not in ("https", "http")
        or (parts.scheme == "http" and host not in _LOCAL_HOSTS)
        or not _HOST.fullmatch(host)
        or parts.username is not None
        or parts.password is not None
        or parts.path
        or parts.query
        or parts.fragment
        or "#" in base_url
        or "?" in base_url
    ):
        raise ValueError("Base URL must be https://host[:port] (or http://localhost for development)")
    return f"{parts.scheme}://{host}" + (f":{port}" if port is not None else "")


def manifest_xml(base_url: str) -> str:
    """Add-in only (XML) manifest for a read-mode Outlook task pane hosted at ``base_url``."""
    base = escape(_base(base_url), {'"': "&quot;"})
    pane = f"{base}{TASKPANE_PATH}"
    icon = f"{base}{ASSET_PREFIX}icon-"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
           xmlns:mailappor="http://schemas.microsoft.com/office/mailappversionoverrides/1.0"
           xsi:type="MailApp">
  <Id>{ADDIN_ID}</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>TrustLabel</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="TrustLabel"/>
  <Description DefaultValue="Trust-labelled answers for the client email you are reading"/>
  <IconUrl DefaultValue="{icon}64.png"/>
  <HighResolutionIconUrl DefaultValue="{icon}128.png"/>
  <SupportUrl DefaultValue="{base}/"/>
  <AppDomains>
    <AppDomain>{base}</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Mailbox"/>
  </Hosts>
  <Requirements>
    <Sets>
      <Set Name="Mailbox" MinVersion="1.5"/>
    </Sets>
  </Requirements>
  <FormSettings>
    <Form xsi:type="ItemRead">
      <DesktopSettings>
        <SourceLocation DefaultValue="{pane}"/>
        <RequestedHeight>450</RequestedHeight>
      </DesktopSettings>
    </Form>
  </FormSettings>
  <Permissions>ReadItem</Permissions>
  <Rule xsi:type="RuleCollection" Mode="Or">
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Read"/>
  </Rule>
  <DisableEntityHighlighting>false</DisableEntityHighlighting>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Requirements>
      <bt:Sets DefaultMinVersion="1.5">
        <bt:Set Name="Mailbox"/>
      </bt:Sets>
    </Requirements>
    <Hosts>
      <Host xsi:type="MailHost">
        <DesktopFormFactor>
          <FunctionFile resid="Taskpane.Url"/>
          <ExtensionPoint xsi:type="MessageReadCommandSurface">
            <OfficeTab id="TabDefault">
              <Group id="trustlabelReadGroup">
                <Label resid="GroupLabel"/>
                <Control xsi:type="Button" id="trustlabelOpenPane">
                  <Label resid="TaskpaneButton.Label"/>
                  <Supertip>
                    <Title resid="TaskpaneButton.Label"/>
                    <Description resid="TaskpaneButton.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16x16" DefaultValue="{icon}16.png"/>
        <bt:Image id="Icon.32x32" DefaultValue="{icon}32.png"/>
        <bt:Image id="Icon.80x80" DefaultValue="{icon}80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Taskpane.Url" DefaultValue="{pane}"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GroupLabel" DefaultValue="TrustLabel"/>
        <bt:String id="TaskpaneButton.Label" DefaultValue="Check with TrustLabel"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="TaskpaneButton.Tooltip"
                   DefaultValue="Grade the sources behind an answer to this email and see who can verify it."/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
"""
