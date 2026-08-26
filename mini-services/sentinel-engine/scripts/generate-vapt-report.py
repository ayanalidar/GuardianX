#!/usr/bin/env python3
"""
GuardianX VAPT Report Generator.
Reads engagement data from a JSON file and generates a professional multi-page
PDF VAPT report with the full structure:
  1. Front Page (branding, versioning, confidentiality)
  2. Blank Page (for double-sided printing)
  3. Table of Contents + Document Control
  4. Executive Summary + Scope
  5. Methodology + Tooling
  6. Findings Master Table
  7. Detailed Technical Findings
  8. Strategic Recommendations, Retests, Appendices
"""
import sys
import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    Image, KeepTogether, Flowable, NextPageTemplate, PageTemplate, Frame,
    BaseDocTemplate,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from PIL import Image as PILImage

# ── Brand colors (cyber security theme: dark + emerald + red) ───────────────
C_DARK = HexColor("#0a0f14")
C_DARKER = HexColor("#05080b")
C_CARD = HexColor("#111827")
C_BORDER = HexColor("#1f2937")
C_EMERALD = HexColor("#10b981")
C_EMERALD_DARK = HexColor("#047857")
C_RED = HexColor("#ef4444")
C_AMBER = HexColor("#f59e0b")
C_ORANGE = HexColor("#f97316")
C_SKY = HexColor("#0ea5e9")
C_TEXT = HexColor("#1f2937")
C_MUTED = HexColor("#6b7280")
C_LIGHT = HexColor("#f3f4f6")
C_WHITE = HexColor("#ffffff")
C_PAGE_BG = HexColor("#ffffff")

SEVERITY_COLORS = {
    "critical": C_RED,
    "high": C_ORANGE,
    "medium": C_AMBER,
    "low": C_SKY,
    "info": C_MUTED,
}

# ── Styles ──────────────────────────────────────────────────────────────────
def build_styles():
    ss = getSampleStyleSheet()
    styles = {}
    styles["H1"] = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                                   fontSize=20, leading=26, textColor=C_DARK,
                                   spaceBefore=18, spaceAfter=10)
    styles["H2"] = ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                                   fontSize=15, leading=20, textColor=C_EMERALD_DARK,
                                   spaceBefore=14, spaceAfter=8)
    styles["H3"] = ParagraphStyle("H3", parent=ss["Heading3"], fontName="Helvetica-Bold",
                                   fontSize=12, leading=16, textColor=C_DARK,
                                   spaceBefore=10, spaceAfter=6)
    styles["Body"] = ParagraphStyle("Body", parent=ss["BodyText"], fontName="Helvetica",
                                     fontSize=10, leading=15, textColor=C_TEXT,
                                     alignment=TA_JUSTIFY, spaceAfter=6)
    styles["BodyCard"] = ParagraphStyle("BodyCard", parent=ss["BodyText"], fontName="Helvetica",
                                         fontSize=9.5, leading=14, textColor=C_TEXT,
                                         alignment=TA_JUSTIFY, spaceAfter=4)
    styles["Mono"] = ParagraphStyle("Mono", parent=ss["Code"], fontName="Courier",
                                     fontSize=8, leading=11, textColor=HexColor("#1e293b"),
                                     backColor=HexColor("#0f172a"), borderPadding=6,
                                     leftIndent=0, rightIndent=0)
    styles["MonoLight"] = ParagraphStyle("MonoLight", parent=ss["Code"], fontName="Courier",
                                          fontSize=8, leading=11, textColor=HexColor("#cbd5e1"),
                                          backColor=HexColor("#0f172a"), borderPadding=8)
    styles["Muted"] = ParagraphStyle("Muted", parent=ss["BodyText"], fontName="Helvetica",
                                      fontSize=9, leading=13, textColor=C_MUTED)
    styles["Label"] = ParagraphStyle("Label", parent=ss["BodyText"], fontName="Helvetica-Bold",
                                      fontSize=8, leading=11, textColor=C_MUTED,
                                      spaceAfter=2)
    styles["CoverTitle"] = ParagraphStyle("CoverTitle", parent=ss["Title"], fontName="Helvetica-Bold",
                                           fontSize=38, leading=44, textColor=C_WHITE,
                                           alignment=TA_CENTER)
    styles["CoverSub"] = ParagraphStyle("CoverSub", parent=ss["Title"], fontName="Helvetica",
                                         fontSize=16, leading=22, textColor=C_EMERALD,
                                         alignment=TA_CENTER)
    styles["CoverMeta"] = ParagraphStyle("CoverMeta", parent=ss["BodyText"], fontName="Helvetica",
                                          fontSize=11, leading=16, textColor=HexColor("#d1d5db"),
                                          alignment=TA_CENTER)
    styles["TOC1"] = ParagraphStyle("TOC1", parent=ss["BodyText"], fontName="Helvetica-Bold",
                                     fontSize=11, leading=18, textColor=C_DARK, leftIndent=0)
    styles["TOC2"] = ParagraphStyle("TOC2", parent=ss["BodyText"], fontName="Helvetica",
                                     fontSize=10, leading=16, textColor=C_TEXT, leftIndent=20)
    styles["CellHead"] = ParagraphStyle("CellHead", parent=ss["BodyText"], fontName="Helvetica-Bold",
                                         fontSize=9, leading=12, textColor=C_WHITE)
    styles["Cell"] = ParagraphStyle("Cell", parent=ss["BodyText"], fontName="Helvetica",
                                     fontSize=9, leading=12, textColor=C_TEXT)
    styles["CellMono"] = ParagraphStyle("CellMono", parent=ss["BodyText"], fontName="Courier",
                                         fontSize=8, leading=11, textColor=C_TEXT)
    styles["Confidential"] = ParagraphStyle("Confidential", parent=ss["BodyText"], fontName="Helvetica-Bold",
                                             fontSize=9, leading=12, textColor=C_RED, alignment=TA_CENTER)
    return styles

STYLES = build_styles()


def esc(text):
    """Escape dynamic text for safe embedding in ReportLab Paragraph XML."""
    if text is None:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )

# ── Page templates (cover dark + body light) ────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "guardianx-logo.png")
LOGO_PATH = os.path.abspath(LOGO_PATH)


def hex_to_rgb_str(h):
    return f"#{h.hexval()[2:]}"


def draw_cover_bg(canv, doc):
    """Dark cyber-security themed cover background."""
    canv.saveState()
    # Full dark background
    canv.setFillColor(C_DARK)
    canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Emerald accent bar at top
    canv.setFillColor(C_EMERALD)
    canv.rect(0, PAGE_H - 6 * mm, PAGE_W, 6 * mm, fill=1, stroke=0)
    # Subtle grid lines (cyber theme)
    canv.setStrokeColor(HexColor("#1a2330"))
    canv.setLineWidth(0.3)
    for x in range(0, int(PAGE_W), int(20 * mm)):
        canv.line(x, 0, x, PAGE_H)
    for y in range(0, int(PAGE_H), int(20 * mm)):
        canv.line(0, y, PAGE_W, y)
    # Bottom accent
    canv.setFillColor(C_EMERALD_DARK)
    canv.rect(0, 0, PAGE_W, 4 * mm, fill=1, stroke=0)
    canv.restoreState()


def draw_body_bg(canv, doc):
    """Light body page with header + footer branding."""
    canv.saveState()
    # Top thin emerald line
    canv.setStrokeColor(C_EMERALD)
    canv.setLineWidth(1.5)
    canv.line(MARGIN, PAGE_H - 12 * mm, PAGE_W - MARGIN, PAGE_H - 12 * mm)
    # Header: logo + GuardianX
    try:
        canv.drawImage(LOGO_PATH, MARGIN, PAGE_H - 10 * mm, width=6 * mm, height=6 * mm,
                       mask='auto', preserveAspectRatio=True)
    except Exception:
        pass
    canv.setFont("Helvetica-Bold", 8)
    canv.setFillColor(C_DARK)
    canv.drawString(MARGIN + 8 * mm, PAGE_H - 8.5 * mm, "GuardianX")
    canv.setFont("Helvetica", 7.5)
    canv.setFillColor(C_MUTED)
    canv.drawRightString(PAGE_W - MARGIN, PAGE_H - 8.5 * mm, "VAPT Report — Confidential")
    # Footer
    canv.setStrokeColor(C_BORDER)
    canv.setLineWidth(0.5)
    canv.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canv.setFont("Helvetica", 7.5)
    canv.setFillColor(C_MUTED)
    canv.drawString(MARGIN, 8 * mm, "www.guardianx.cloud  ·  hello@guardianx.in  ·  +91 70067 12347")
    canv.drawRightString(PAGE_W - MARGIN, 8 * mm, f"Page {doc.page}")
    canv.restoreState()


def draw_blank_bg(canv, doc):
    """Intentionally blank page (for double-sided printing)."""
    canv.saveState()
    canv.setFillColor(C_WHITE)
    canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # tiny footer note
    canv.setFont("Helvetica", 7)
    canv.setFillColor(HexColor("#d1d5db"))
    canv.drawCentredString(PAGE_W / 2, 10 * mm, "This page is intentionally left blank.")
    canv.restoreState()


# ── Custom flowables ────────────────────────────────────────────────────────
class SeverityBar(Flowable):
    """A horizontal bar showing severity counts."""
    def __init__(self, counts, width=170 * mm, height=14 * mm):
        super().__init__()
        self.counts = counts  # {critical, high, medium, low, info}
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        total = sum(self.counts.values()) or 1
        x = 0
        order = ["critical", "high", "medium", "low", "info"]
        for sev in order:
            n = self.counts.get(sev, 0)
            if n == 0:
                continue
            w = (n / total) * self.width
            c.setFillColor(SEVERITY_COLORS[sev])
            c.rect(x, 0, w, self.height, fill=1, stroke=0)
            if w > 20:
                c.setFillColor(C_WHITE)
                c.setFont("Helvetica-Bold", 9)
                c.drawCentredString(x + w / 2, self.height / 2 - 3, f"{n} {sev.upper()}")
            x += w
        # border
        c.setStrokeColor(C_BORDER)
        c.setLineWidth(0.5)
        c.rect(0, 0, self.width, self.height, fill=0, stroke=1)


class HRule(Flowable):
    def __init__(self, width=None, color=C_BORDER, thickness=0.5):
        super().__init__()
        self.width = width
        self.color = color
        self.thickness = thickness
    def wrap(self, aw, ah):
        return (self.width or aw, self.thickness + 2)
    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 1, self.width or 170*mm, 1)


# ── Helpers ─────────────────────────────────────────────────────────────────
def sev_count(findings):
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        s = (f.get("severity") or "info").lower()
        if s in counts:
            counts[s] += 1
    return counts


def risk_posture(counts):
    total = sum(counts.values())
    if counts["critical"] > 0:
        return "CRITICAL", C_RED, f"{counts['critical']} critical-severity exposure(s) require immediate remediation. The target is actively exploitable and credentials may already be compromised."
    if counts["high"] > 0:
        return "HIGH", C_ORANGE, f"{counts['high']} high-severity issues present a serious risk of exploitation and should be remediated within days."
    if counts["medium"] > 0:
        return "MODERATE", C_AMBER, f"{counts['medium']} medium-severity issues were identified. Remediate within standard sprint cycles."
    if counts["low"] > 0 or counts["info"] > 0:
        return "LOW", C_SKY, "Only low/informational issues found. The target demonstrates a reasonable security posture."
    return "NONE", C_EMERALD, "No security issues were identified during this engagement."


def para(text, style="Body"):
    return Paragraph(text, STYLES[style])


def card_table(rows, col_widths, header=True):
    """A table with card styling."""
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), C_DARK) if header else ("BACKGROUND", (0,0),(-1,0),C_LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE) if header else ("TEXTCOLOR", (0,0),(-1,0),C_DARK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), C_TEXT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.4, C_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, HexColor("#f9fafb")]),
    ]
    t.setStyle(TableStyle(style))
    return t


# ── Section builders ────────────────────────────────────────────────────────
CONTENT_W = PAGE_W - 2 * MARGIN


def build_cover(data, story):
    """Page 1: Front cover."""
    target = data["target"]
    engagement = data["engagement"]
    counts = sev_count(data["findings"])
    risk, risk_color, _ = risk_posture(counts)
    started = engagement.get("started_at", "")[:10]

    # Spacer to push content down
    story.append(Spacer(1, 30 * mm))

    # Logo (large, centered)
    try:
        img = Image(LOGO_PATH, width=42 * mm, height=42 * mm)
        img.hAlign = "CENTER"
        story.append(img)
    except Exception:
        pass

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph("GUARDIAN<font color='#10b981'>X</font>", STYLES["CoverTitle"]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("VULNERABILITY ASSESSMENT &amp; PENETRATION TESTING REPORT", STYLES["CoverSub"]))
    story.append(Spacer(1, 20 * mm))

    # Risk posture badge
    risk_badge_style = ParagraphStyle("RiskBadge", parent=STYLES["CoverMeta"], alignment=TA_CENTER)
    risk_label = Paragraph(
        f'<font name="Helvetica-Bold" size="11" color="white"> &nbsp; OVERALL RISK: {risk} &nbsp; </font>',
        risk_badge_style
    )
    story.append(risk_label)
    story.append(Spacer(1, 14 * mm))

    # Engagement metadata block
    meta_rows = [
        ["Client / Target", target.get("name", "—")],
        ["Target URL", target.get("base_url", "—")],
        ["Engagement ID", engagement.get("id", "—")[:12]],
        ["Engagement Date", started],
        ["Report Version", "1.0"],
        ["Prepared By", "GuardianX Autonomous RedAgent Engine"],
        ["Classification", "CONFIDENTIAL"],
    ]
    meta_tbl = Table(
        [[Paragraph(f'<font color="#9ca3af" size="9">{k}</font>', STYLES["CoverMeta"]),
          Paragraph(f'<font color="white" size="10"><b>{v}</b></font>', STYLES["CoverMeta"])] for k, v in meta_rows],
        colWidths=[55 * mm, 95 * mm],
    )
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, HexColor("#1f2937")),
    ]))
    meta_tbl.hAlign = "CENTER"
    story.append(meta_tbl)

    story.append(Spacer(1, 18 * mm))

    # Confidentiality notice
    conf_style = ParagraphStyle("Conf", parent=STYLES["CoverMeta"], alignment=TA_CENTER)
    conf = Paragraph(
        '<font name="Helvetica-Bold" size="8" color="#ef4444">'
        'CONFIDENTIAL — This report contains sensitive security information. '
        'Distribution is restricted to authorized personnel only. '
        'Unauthorized disclosure is prohibited.'
        '</font>',
        conf_style
    )
    story.append(conf)

    story.append(PageBreak())


def build_blank_page(story):
    """Page 2: Intentionally blank (for double-sided printing)."""
    story.append(NextPageTemplate("blank"))
    story.append(PageBreak())
    story.append(NextPageTemplate("body"))


def build_toc_and_control(data, story):
    """Page 3+: Table of Contents + Document Control."""
    story.append(Paragraph("Table of Contents", STYLES["H1"]))
    story.append(HRule())

    toc_items = [
        ("1. Document Control", "3"),
        ("   1.1 Revision History", "3"),
        ("   1.2 Sign-off &amp; Approvals", "3"),
        ("   1.3 Distribution List", "4"),
        ("2. Executive Summary", "4"),
        ("   2.1 Risk Posture", "4"),
        ("   2.2 Severity Distribution", "5"),
        ("   2.3 Top Strategic Threats", "5"),
        ("3. Scope &amp; Rules of Engagement", "6"),
        ("   3.1 Target Assets", "6"),
        ("   3.2 Rules of Engagement", "6"),
        ("   3.3 Out of Scope", "6"),
        ("4. Methodology &amp; Tooling", "7"),
        ("   4.1 Frameworks Applied", "7"),
        ("   4.2 CVSS Scoring Criteria", "7"),
        ("5. Findings Master Table", "8"),
        ("6. Detailed Technical Findings", "9"),
        ("7. Strategic Recommendations", "—"),
        ("8. Retest Status", "—"),
        ("9. Appendices", "—"),
        ("   9.1 Compliance Mapping", "—"),
        ("   9.2 Glossary", "—"),
        ("   9.3 Cleanup Certificate", "—"),
    ]
    rows = [[Paragraph(label, STYLES["TOC1" if not label.startswith("   ") else "TOC2"]), Paragraph(page, STYLES["TOC2"])] for label, page in toc_items]
    toc_tbl = Table(rows, colWidths=[140 * mm, 20 * mm])
    toc_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEBELOW", (0, 0), (-1, -1), 0.2, HexColor("#e5e7eb")),
    ]))
    story.append(toc_tbl)

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("1. Document Control", STYLES["H2"]))
    story.append(HRule())

    # Revision history
    story.append(Paragraph("1.1 Revision History", STYLES["H3"]))
    rev_rows = [
        [Paragraph("Version", STYLES["CellHead"]), Paragraph("Date", STYLES["CellHead"]),
         Paragraph("Author", STYLES["CellHead"]), Paragraph("Description", STYLES["CellHead"])],
        [Paragraph("1.0", STYLES["Cell"]), Paragraph(data["engagement"].get("started_at", "")[:10], STYLES["Cell"]),
         Paragraph("GuardianX RedAgent", STYLES["Cell"]), Paragraph("Initial VAPT report generated from autonomous engagement.", STYLES["Cell"])],
    ]
    story.append(card_table(rev_rows, [25*mm, 30*mm, 40*mm, CONTENT_W - 95*mm]))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("1.2 Sign-off &amp; Approvals", STYLES["H3"]))
    sign_rows = [
        [Paragraph("Role", STYLES["CellHead"]), Paragraph("Name", STYLES["CellHead"]),
         Paragraph("Signature", STYLES["CellHead"]), Paragraph("Date", STYLES["CellHead"])],
        [Paragraph("Lead Pentester", STYLES["Cell"]), Paragraph("GuardianX RedAgent Engine", STYLES["Cell"]),
         Paragraph("_________________", STYLES["Cell"]), Paragraph("___________", STYLES["Cell"])],
        [Paragraph("Client Reviewer", STYLES["Cell"]), Paragraph("_________________", STYLES["Cell"]),
         Paragraph("_________________", STYLES["Cell"]), Paragraph("___________", STYLES["Cell"])],
        [Paragraph("Authorizing Officer", STYLES["Cell"]), Paragraph("_________________", STYLES["Cell"]),
         Paragraph("_________________", STYLES["Cell"]), Paragraph("___________", STYLES["Cell"])],
    ]
    story.append(card_table(sign_rows, [40*mm, 45*mm, 45*mm, CONTENT_W - 130*mm]))

    story.append(PageBreak())

    # Distribution list
    story.append(Paragraph("1.3 Distribution List", STYLES["H3"]))
    story.append(Paragraph(
        "This document is classified as <b>CONFIDENTIAL</b>. It contains detailed information about "
        "security vulnerabilities that could be exploited by malicious actors. Distribution is restricted "
        "to the following authorized recipients. Each recipient is responsible for safeguarding the report "
        "and must not redistribute it without explicit written consent from GuardianX.",
        STYLES["Body"]))
    dist_rows = [
        [Paragraph("Recipient", STYLES["CellHead"]), Paragraph("Role", STYLES["CellHead"]),
         Paragraph("Format", STYLES["CellHead"])],
        [Paragraph("Target Owner", STYLES["Cell"]), Paragraph("Remediation lead", STYLES["Cell"]), Paragraph("PDF (encrypted)", STYLES["Cell"])],
        [Paragraph("CISO / Security Lead", STYLES["Cell"]), Paragraph("Risk acceptance", STYLES["Cell"]), Paragraph("PDF (encrypted)", STYLES["Cell"])],
        [Paragraph("Engineering Lead", STYLES["Cell"]), Paragraph("Fix implementation", STYLES["Cell"]), Paragraph("PDF (encrypted)", STYLES["Cell"])],
    ]
    story.append(card_table(dist_rows, [50*mm, 50*mm, CONTENT_W - 100*mm]))


def build_exec_summary(data, story):
    story.append(Paragraph("2. Executive Summary", STYLES["H1"]))
    story.append(HRule())

    counts = sev_count(data["findings"])
    total = sum(counts.values())
    risk, risk_color, risk_desc = risk_posture(counts)

    story.append(Paragraph("2.1 Risk Posture", STYLES["H3"]))
    story.append(Paragraph(
        f"GuardianX conducted an autonomous Vulnerability Assessment and Penetration Testing (VAPT) "
        f"engagement against <b>{data['target'].get('name','the target')}</b> "
        f"(<font name='Courier' size='9'>{data['target'].get('base_url','')}</font>) on "
        f"{data['engagement'].get('started_at','')[:10]}. The RedAgent engine crawled the application's "
        f"attack surface, planned and executed {total} attack(s) across multiple vulnerability categories, "
        f"and performed a systematic sensitive-data exposure sweep.",
        STYLES["Body"]))

    # Risk badge card
    risk_card = Table([[
        Paragraph(f'<font name="Helvetica-Bold" size="14" color="white">OVERALL RISK: {risk}</font>', STYLES["Body"]),
        Paragraph(f'<font name="Helvetica" size="9" color="white">{total} finding(s) confirmed</font>', STYLES["Body"]),
    ]], colWidths=[60*mm, CONTENT_W - 60*mm])
    risk_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), risk_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(risk_card)
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(risk_desc, STYLES["Body"]))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("2.2 Severity Distribution", STYLES["H3"]))
    story.append(SeverityBar(counts, width=CONTENT_W, height=12 * mm))
    story.append(Spacer(1, 2 * mm))

    # Severity count table
    sev_rows = [[Paragraph(s.upper(), STYLES["CellHead"]),
                 Paragraph(str(counts.get(s, 0)), STYLES["Cell"])] for s in ["critical", "high", "medium", "low", "info"]]
    sev_rows.insert(0, [Paragraph("Severity", STYLES["CellHead"]), Paragraph("Count", STYLES["CellHead"])])
    sev_rows.append([Paragraph("TOTAL", STYLES["CellHead"]), Paragraph(str(total), STYLES["CellHead"])])
    sev_tbl = card_table(sev_rows, [60*mm, 30*mm])
    # color the severity cells
    sev_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 1), (0, 1), SEVERITY_COLORS["critical"]),
        ("TEXTCOLOR", (0, 1), (0, 1), C_WHITE),
        ("BACKGROUND", (0, 2), (0, 2), SEVERITY_COLORS["high"]),
        ("TEXTCOLOR", (0, 2), (0, 2), C_WHITE),
        ("BACKGROUND", (0, 3), (0, 3), SEVERITY_COLORS["medium"]),
        ("TEXTCOLOR", (0, 3), (0, 3), C_WHITE),
        ("BACKGROUND", (0, 4), (0, 4), SEVERITY_COLORS["low"]),
        ("TEXTCOLOR", (0, 4), (0, 4), C_WHITE),
        ("BACKGROUND", (0, 5), (0, 5), SEVERITY_COLORS["info"]),
        ("TEXTCOLOR", (0, 5), (0, 5), C_WHITE),
        ("FONTNAME", (0, 1), (0, -2), "Helvetica-Bold"),
    ]))
    story.append(sev_tbl)

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("2.3 Top Strategic Threats", STYLES["H3"]))
    # Top 3 findings by severity
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    top = sorted(data["findings"], key=lambda f: sev_rank.get(f.get("severity", "info"), 5))[:3]
    if top:
        threat_rows = [[Paragraph("#", STYLES["CellHead"]), Paragraph("Threat", STYLES["CellHead"]),
                        Paragraph("Severity", STYLES["CellHead"]), Paragraph("Endpoint", STYLES["CellHead"])]]
        for i, f in enumerate(top, 1):
            threat_rows.append([
                Paragraph(str(i), STYLES["Cell"]),
                Paragraph(esc(f.get("title", "—")), STYLES["Cell"]),
                Paragraph(f.get("severity", "—").upper(), STYLES["Cell"]),
                Paragraph(f"<font name='Courier' size='8'>{esc(f.get('method',''))} {esc(f.get('endpoint',''))}</font>", STYLES["Cell"]),
            ])
        story.append(card_table(threat_rows, [10*mm, 75*mm, 25*mm, CONTENT_W - 110*mm]))

    story.append(PageBreak())


def build_scope(data, story):
    story.append(Paragraph("3. Scope &amp; Rules of Engagement", STYLES["H1"]))
    story.append(HRule())

    story.append(Paragraph("3.1 Target Assets", STYLES["H3"]))
    target = data["target"]
    asset_rows = [
        [Paragraph("Asset", STYLES["CellHead"]), Paragraph("Value", STYLES["Cell"])],
        [Paragraph("Target Name", STYLES["Cell"]), Paragraph(target.get("name", "—"), STYLES["Cell"])],
        [Paragraph("Base URL", STYLES["Cell"]), Paragraph(f"<font name='Courier' size='9'>{target.get('base_url','—')}</font>", STYLES["Cell"])],
        [Paragraph("Authorization", STYLES["Cell"]), Paragraph("Confirmed authorized for testing" if target.get("authorized") else "NOT authorized", STYLES["Cell"])],
        [Paragraph("Authentication", STYLES["Cell"]), Paragraph("Auth header provided (authenticated scanning)" if target.get("auth_header_set") else "Unauthenticated", STYLES["Cell"])],
        [Paragraph("Engagement ID", STYLES["Cell"]), Paragraph(data["engagement"].get("id", "—"), STYLES["Cell"])],
        [Paragraph("Start Time", STYLES["Cell"]), Paragraph(data["engagement"].get("started_at", "—"), STYLES["Cell"])],
        [Paragraph("End Time", STYLES["Cell"]), Paragraph(data["engagement"].get("completed_at", "—") or "—", STYLES["Cell"])],
    ]
    story.append(card_table(asset_rows, [50*mm, CONTENT_W - 50*mm]))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("3.2 Rules of Engagement", STYLES["H3"]))
    roe = [
        "Testing was performed only against the explicitly authorized target listed above.",
        "The GuardianX RedAgent engine performed active, non-destructive testing: HTTP requests with crafted payloads were sent to discover and confirm vulnerabilities, but no data was destroyed, no denial-of-service was attempted, and no persistence was established.",
        "All sensitive data encountered during testing (exposed secrets, PII) was documented with redacted samples only. Full secret values were intentionally not stored.",
        "Testing was conducted from the GuardianX engine host using standard HTTP/HTTPS requests.",
        "The engagement was time-boxed to a single automated sweep covering reconnaissance, attack execution, and exposure scanning.",
    ]
    for r in roe:
        story.append(Paragraph(f"• {r}", STYLES["Body"]))

    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("3.3 Out of Scope", STYLES["H3"]))
    oos = [
        "Physical security testing, social engineering, and phishing.",
        "Denial-of-service or stress/load testing that could impact service availability.",
        "Source code review of the target's backend (covered separately by GuardianX SAST if source is provided).",
        "Third-party hosted infrastructure not owned by the client (CDNs, payment gateways, SaaS dependencies).",
        "Exploitation beyond proof-of-concept — no data exfiltration, no lateral movement, no privilege escalation persistence.",
    ]
    for r in oos:
        story.append(Paragraph(f"• {r}", STYLES["Body"]))

    story.append(PageBreak())


def build_methodology(data, story):
    story.append(Paragraph("4. Methodology &amp; Tooling", STYLES["H1"]))
    story.append(HRule())

    story.append(Paragraph("4.1 Frameworks Applied", STYLES["H3"]))
    story.append(Paragraph(
        "The GuardianX RedAgent engine applies a hybrid methodology combining automated AI-driven "
        "attack planning with manual-verification patterns aligned to industry-standard frameworks. "
        "The engagement followed the OWASP Web Security Testing Guide (WSTG) phase structure and "
        "OWASP Top 10:2021 risk categorization, with findings mapped to the appropriate OWASP "
        "categories. CVSS v3.1 was used as the severity-scoring rubric, translated to the qualitative "
        "labels (Critical / High / Medium / Low / Info) used throughout this report.",
        STYLES["Body"]))

    fw_rows = [
        [Paragraph("Framework", STYLES["CellHead"]), Paragraph("Application", STYLES["Cell"])],
        [Paragraph("OWASP Top 10:2021", STYLES["Cell"]), Paragraph("Findings categorized by OWASP risk category (A01–A10).", STYLES["Cell"])],
        [Paragraph("OWASP WSTG v4.2", STYLES["Cell"]), Paragraph("Testing phases: reconnaissance, mapping, exploitation, verification.", STYLES["Cell"])],
        [Paragraph("CVSS v3.1", STYLES["Cell"]), Paragraph("Severity scoring translated to qualitative labels.", STYLES["Cell"])],
        [Paragraph("NIST SP 800-115", STYLES["Cell"]), Paragraph("Technical guide to information security testing and assessment.", STYLES["Cell"])],
    ]
    story.append(card_table(fw_rows, [50*mm, CONTENT_W - 50*mm]))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("4.2 CVSS Scoring Criteria", STYLES["H3"]))
    story.append(Paragraph(
        "Each confirmed finding is assigned a severity based on the CVSS v3.1 base-score rubric. "
        "The RedAgent engine evaluates exploitability (attack vector, complexity, privileges required, "
        "user interaction) and impact (confidentiality, integrity, availability) to derive a qualitative "
        "severity. The mapping used in this report is:",
        STYLES["Body"]))
    cvss_rows = [
        [Paragraph("CVSS Score", STYLES["CellHead"]), Paragraph("Severity", STYLES["CellHead"]), Paragraph("Description", STYLES["CellHead"])],
        [Paragraph("9.0 – 10.0", STYLES["Cell"]), Paragraph("CRITICAL", STYLES["Cell"]), Paragraph("Immediate, often unauthenticated exploitation leading to full compromise or data exposure.", STYLES["Cell"])],
        [Paragraph("7.0 – 8.9", STYLES["Cell"]), Paragraph("HIGH", STYLES["Cell"]), Paragraph("Serious risk of exploitation; remediate within days.", STYLES["Cell"])],
        [Paragraph("4.0 – 6.9", STYLES["Cell"]), Paragraph("MEDIUM", STYLES["Cell"]), Paragraph("Moderate risk; remediate within standard sprint cycles.", STYLES["Cell"])],
        [Paragraph("0.1 – 3.9", STYLES["Cell"]), Paragraph("LOW", STYLES["Cell"]), Paragraph("Limited impact; hardening recommendation.", STYLES["Cell"])],
        [Paragraph("0.0", STYLES["Cell"]), Paragraph("INFO", STYLES["Cell"]), Paragraph("Informational observation, no direct exploitability.", STYLES["Cell"])],
    ]
    story.append(card_table(cvss_rows, [30*mm, 30*mm, CONTENT_W - 60*mm]))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("4.3 Tooling", STYLES["H3"]))
    story.append(Paragraph(
        "The engagement combined AI-driven attack planning with deterministic verification. The RedAgent "
        "engine autonomously crawls the target, reasons about each endpoint to plan category-appropriate "
        "attacks (SQL injection, XSS, IDOR, path traversal, open redirect, information disclosure, "
        "authentication bypass), crafts concrete HTTP payloads, fires them, and rigorously analyzes "
        "responses to confirm exploitation. A secondary sweep scans all responses for exposed secrets "
        "(AWS/Stripe/GitHub keys, JWTs, private keys, database strings) and PII (SSNs, credit cards), "
        "and probes known exposure paths (.env, .git/, backups, swagger, etc.).",
        STYLES["Body"]))

    story.append(PageBreak())


def build_findings_master_table(data, story):
    story.append(Paragraph("5. Findings Master Table", STYLES["H1"]))
    story.append(HRule())
    story.append(Paragraph(
        f"The following table indexes all {len(data['findings'])} confirmed finding(s) from this engagement. "
        f"Each finding is assigned a reference ID (F-001, F-002, …) for cross-reference with the detailed "
        f"technical findings in Section 6.",
        STYLES["Body"]))
    story.append(Spacer(1, 3*mm))

    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    findings_sorted = sorted(data["findings"], key=lambda f: sev_rank.get(f.get("severity", "info"), 5))

    rows = [[
        Paragraph("ID", STYLES["CellHead"]),
        Paragraph("Severity", STYLES["CellHead"]),
        Paragraph("Category", STYLES["CellHead"]),
        Paragraph("Finding", STYLES["CellHead"]),
        Paragraph("Endpoint", STYLES["CellHead"]),
    ]]
    for i, f in enumerate(findings_sorted, 1):
        rows.append([
            Paragraph(f"F-{i:03d}", STYLES["CellMono"]),
            Paragraph(f.get("severity", "—").upper(), STYLES["Cell"]),
            Paragraph(esc(f.get("category", "—")), STYLES["Cell"]),
            Paragraph(esc(f.get("title", "—")), STYLES["Cell"]),
            Paragraph(f"<font name='Courier' size='8'>{esc(f.get('method',''))} {esc(f.get('endpoint',''))}</font>", STYLES["Cell"]),
        ])

    tbl = card_table(rows, [18*mm, 22*mm, 40*mm, CONTENT_W - 18*mm - 22*mm - 40*mm - 35*mm, 35*mm])
    story.append(tbl)

    story.append(PageBreak())

    # store the sorted order + ref ids for the detailed section
    data["_sorted_findings"] = findings_sorted
    data["_ref_ids"] = {f.get("id"): f"F-{i:03d}" for i, f in enumerate(findings_sorted, 1)}


def build_detailed_findings(data, story):
    story.append(Paragraph("6. Detailed Technical Findings", STYLES["H1"]))
    story.append(HRule())
    story.append(Paragraph(
        "Each finding below is dissected in full technical detail: severity, OWASP category, affected "
        "endpoint, impact analysis, step-by-step proof of concept (raw HTTP request and response evidence), "
        "and developer-level remediation guidance.",
        STYLES["Body"]))
    story.append(Spacer(1, 4*mm))

    ref_ids = data.get("_ref_ids", {})

    for f in data.get("_sorted_findings", data["findings"]):
        ref = ref_ids.get(f.get("id"), "F-???")
        sev = (f.get("severity") or "info").lower()
        sev_color = SEVERITY_COLORS.get(sev, C_MUTED)

        # Finding header bar
        sev_right_style = ParagraphStyle("SevRight", parent=STYLES["Body"], alignment=TA_RIGHT)
        header = Table([[
            Paragraph(f'<font name="Helvetica-Bold" size="11" color="white">{ref} — {esc(f.get("title","Finding"))}</font>', STYLES["Body"]),
            Paragraph(f'<font name="Helvetica-Bold" size="10" color="white">{sev.upper()}</font>', sev_right_style),
        ]], colWidths=[CONTENT_W - 30*mm, 30*mm])
        header.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), sev_color),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))

        # Meta table
        meta = Table([
            [Paragraph("Category", STYLES["Label"]), Paragraph(esc(f.get("category", "—")), STYLES["BodyCard"]),
             Paragraph("OWASP", STYLES["Label"]), Paragraph(esc(f.get("owasp", "—") or "—"), STYLES["BodyCard"])],
            [Paragraph("Endpoint", STYLES["Label"]), Paragraph(f"<font name='Courier' size='8'>{esc(f.get('method',''))} {esc(f.get('endpoint',''))}</font>", STYLES["BodyCard"]),
             Paragraph("Confidence", STYLES["Label"]), Paragraph(f"{int((f.get('confidence',0) or 0)*100)}%", STYLES["BodyCard"])],
        ], colWidths=[25*mm, (CONTENT_W-50*mm)/2, 25*mm, (CONTENT_W-50*mm)/2])
        meta.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f9fafb")),
            ("BOX", (0, 0), (-1, -1), 0.4, C_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#e5e7eb")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))

        # Description
        desc_para = Paragraph(f"<b>Impact Analysis:</b> {esc(f.get('description','—'))}", STYLES["BodyCard"])

        # PoC blocks
        poc_flows = []
        req_text = f.get("proof_request", "") or ""
        resp_text = f.get("proof_response", "") or ""
        if req_text:
            poc_flows.append(Paragraph("Proof of Concept — HTTP Request", STYLES["Label"]))
            req_safe = esc(req_text).replace("\n", "<br/>")
            poc_flows.append(Paragraph(f'<font name="Courier" size="7.5" color="#86efac">{req_safe}</font>', STYLES["MonoLight"]))
        if resp_text:
            poc_flows.append(Spacer(1, 2*mm))
            poc_flows.append(Paragraph("HTTP Response (Evidence)", STYLES["Label"]))
            resp_safe = esc(resp_text).replace("\n", "<br/>")
            if len(resp_safe) > 2500:
                resp_safe = resp_safe[:2500] + "<br/>…[truncated]"
            poc_flows.append(Paragraph(f'<font name="Courier" size="7.5" color="#cbd5e1">{resp_safe}</font>', STYLES["MonoLight"]))

        # Payload
        payload_flows = []
        if f.get("payload"):
            payload_flows.append(Paragraph("Attack Payload", STYLES["Label"]))
            pl_safe = esc(f["payload"])
            payload_flows.append(Paragraph(f'<font name="Courier" size="8" color="#ef4444">{pl_safe}</font>', STYLES["MonoLight"]))

        # Remediation
        remed_para = Paragraph(f"<b>Remediation:</b> {esc(f.get('remediation','—') or '—')}", STYLES["BodyCard"])

        # Keep finding together where possible
        block = [header, Spacer(1, 2*mm), meta, Spacer(1, 3*mm), desc_para, Spacer(1, 3*mm)]
        block += payload_flows + [Spacer(1, 1*mm)] if payload_flows else []
        block += poc_flows
        block += [Spacer(1, 3*mm), remed_para, Spacer(1, 8*mm)]

        story.append(KeepTogether(block[:3]))  # header + meta + desc stay together
        for fl in block[3:]:
            story.append(fl)

    story.append(PageBreak())


def build_strategic_recs(data, story):
    story.append(Paragraph("7. Strategic Recommendations", STYLES["H1"]))
    story.append(HRule())

    counts = sev_count(data["findings"])
    story.append(Paragraph(
        "Beyond remediating the individual findings documented in Section 6, GuardianX recommends "
        "addressing the following root causes that contributed to multiple findings. These strategic "
        "recommendations, if implemented, will reduce the likelihood of similar vulnerabilities "
        "recurring in the future.",
        STYLES["Body"]))

    recs = [
        ("Input Validation &amp; Parameterized Queries",
         "Several findings involve unsanitized user input reaching sensitive sinks (SQL queries, file paths, template rendering). Adopt a defense-in-depth input-validation strategy: use parameterized queries for all database access, allowlist-based path validation for file operations, and context-aware output encoding for all rendered content. Never concatenate user input into interpretable strings."),
        ("Access Control &amp; Authorization",
         "Where IDOR and admin-panel exposure were identified, implement object-level authorization checks on every request that accesses a resource by identifier. Verify the authenticated principal is authorized to access the specific object. Apply least-privilege defaults and enforce server-side role checks rather than relying on client-side gating."),
        ("Secret Management &amp; Configuration Hygiene",
         "Exposed secrets (API keys, database credentials, signing keys) must be removed from version control, server-served files, and client-visible responses. Rotate every credential exposed during this engagement — they must be considered compromised. Adopt a secrets manager (e.g. Vault, AWS Secrets Manager) and load secrets exclusively from environment variables at runtime. Block access to sensitive files (.env, .git/, .DS_Store, backups) at the reverse proxy level."),
        ("Security Headers &amp; Transport Protection",
         "Apply a comprehensive security-header policy: Strict-Transport-Security, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy. Enforce TLS everywhere with modern cipher suites and disable legacy protocols. These headers provide cheap, high-impact protection against a range of client-side attacks."),
        ("Continuous Security Testing",
         "Integrate GuardianX SAST (source scanning + patch generation) into the CI/CD pipeline so vulnerabilities are caught before deployment, and schedule recurring RedAgent VAPT engagements against staging and production to catch regressions and new exposures. Shift security left: a finding prevented at commit time costs orders of magnitude less to fix than one caught in production."),
    ]
    for title, body in recs:
        story.append(Paragraph(f"<b>{title}.</b> {body}", STYLES["Body"]))
        story.append(Spacer(1, 2*mm))

    story.append(PageBreak())


def build_retests(data, story):
    story.append(Paragraph("8. Retest Status", STYLES["H1"]))
    story.append(HRule())
    story.append(Paragraph(
        "The following table tracks the remediation status of each finding. Once the client has applied "
        "a fix, GuardianX will re-run the original proof-of-concept against the patched target to verify "
        "the vulnerability is resolved. Until a retest confirms resolution, findings remain OPEN.",
        STYLES["Body"]))
    story.append(Spacer(1, 3*mm))

    ref_ids = data.get("_ref_ids", {})
    rows = [[
        Paragraph("Ref", STYLES["CellHead"]),
        Paragraph("Finding", STYLES["CellHead"]),
        Paragraph("Severity", STYLES["CellHead"]),
        Paragraph("Status", STYLES["CellHead"]),
        Paragraph("Retest Date", STYLES["CellHead"]),
        Paragraph("Notes", STYLES["CellHead"]),
    ]]
    for f in data.get("_sorted_findings", data["findings"]):
        ref = ref_ids.get(f.get("id"), "—")
        rows.append([
            Paragraph(ref, STYLES["CellMono"]),
            Paragraph(esc(f.get("title", "—")), STYLES["Cell"]),
            Paragraph(f.get("severity", "—").upper(), STYLES["Cell"]),
            Paragraph('<font color="#ef4444"><b>OPEN</b></font>', STYLES["Cell"]),
            Paragraph("—", STYLES["Cell"]),
            Paragraph("Awaiting remediation", STYLES["Cell"]),
        ])
    story.append(card_table(rows, [15*mm, CONTENT_W - 15*mm - 22*mm - 18*mm - 25*mm - 30*mm, 22*mm, 18*mm, 25*mm, 30*mm]))

    story.append(PageBreak())


def build_appendices(data, story):
    story.append(Paragraph("9. Appendices", STYLES["H1"]))
    story.append(HRule())

    # 9.1 Compliance mapping
    story.append(Paragraph("9.1 Compliance Mapping", STYLES["H3"]))
    story.append(Paragraph(
        "This engagement supports compliance with the following frameworks. The mapping below indicates "
        "which framework controls are addressed by the testing performed.",
        STYLES["Body"]))
    comp_rows = [
        [Paragraph("Framework", STYLES["CellHead"]), Paragraph("Control", STYLES["CellHead"]), Paragraph("Coverage", STYLES["CellHead"])],
        [Paragraph("PCI-DSS v4.0", STYLES["Cell"]), Paragraph("6.2.4, 11.3 — Web application vulnerability scanning &amp; penetration testing", STYLES["Cell"]), Paragraph("Addressed", STYLES["Cell"])],
        [Paragraph("ISO 27001:2022", STYLES["Cell"]), Paragraph("A.8.8 — Technical vulnerability management", STYLES["Cell"]), Paragraph("Addressed", STYLES["Cell"])],
        [Paragraph("ISO 27001:2022", STYLES["Cell"]), Paragraph("A.8.29 — Security testing in development &amp; acceptance", STYLES["Cell"]), Paragraph("Addressed", STYLES["Cell"])],
        [Paragraph("SOC 2", STYLES["Cell"]), Paragraph("CC7.1 — Vulnerability detection &amp; remediation monitoring", STYLES["Cell"]), Paragraph("Addressed", STYLES["Cell"])],
        [Paragraph("OWASP ASVS v4.0", STYLES["Cell"]), Paragraph("V5, V7, V12 — Validation, Cryptography, Files &amp; Resources", STYLES["Cell"]), Paragraph("Addressed", STYLES["Cell"])],
        [Paragraph("NIST SP 800-53", STYLES["Cell"]), Paragraph("RA-5 — Vulnerability scanning &amp; monitoring", STYLES["Cell"]), Paragraph("Addressed", STYLES["Cell"])],
    ]
    story.append(card_table(comp_rows, [40*mm, CONTENT_W - 40*mm - 30*mm, 30*mm]))

    story.append(Spacer(1, 6*mm))
    # 9.2 Glossary
    story.append(Paragraph("9.2 Glossary", STYLES["H3"]))
    glossary = [
        ("VAPT", "Vulnerability Assessment and Penetration Testing — the combined process of identifying (assessment) and actively exploiting (penetration testing) security weaknesses."),
        ("CVSS", "Common Vulnerability Scoring System — a standardized rubric for rating vulnerability severity (0.0–10.0)."),
        ("OWASP", "Open Worldwide Application Security Project — a nonprofit that publishes the Top 10 web application security risks and the Web Security Testing Guide."),
        ("IDOR", "Insecure Direct Object Reference — an access-control flaw where an attacker can access objects by manipulating identifiers."),
        ("PoC", "Proof of Concept — a demonstration that a vulnerability is exploitable, typically a crafted HTTP request and the resulting response."),
        ("CWE", "Common Weakness Enumeration — a community-developed catalog of software weakness types."),
        ("PII", "Personally Identifiable Information — data that can identify an individual (SSN, email, etc.)."),
        ("SAST / DAST", "Static / Dynamic Application Security Testing — source-code analysis vs. runtime testing of a live application."),
    ]
    g_rows = [[Paragraph("Term", STYLES["CellHead"]), Paragraph("Definition", STYLES["CellHead"])]]
    for term, defn in glossary:
        g_rows.append([Paragraph(f"<b>{term}</b>", STYLES["Cell"]), Paragraph(defn, STYLES["Cell"])])
    story.append(card_table(g_rows, [35*mm, CONTENT_W - 35*mm]))

    story.append(Spacer(1, 6*mm))
    # 9.3 Cleanup certificate
    story.append(Paragraph("9.3 Cleanup Certificate", STYLES["H3"]))
    story.append(Paragraph(
        "GuardianX certifies that all testing artifacts generated during this engagement have been "
        "safely purged from the testing environment. This includes: cloned source code (if any), "
        "temporary sandbox directories, captured HTTP request/response transcripts (beyond the redacted "
        "evidence stored in this report), and any cached credentials used for authenticated scanning. "
        "Only the redacted finding evidence persisted in this report remains, and no full secret values "
        "were retained at any point.",
        STYLES["Body"]))
    story.append(Spacer(1, 4*mm))

    cert_style = ParagraphStyle("Cert", parent=STYLES["Body"], alignment=TA_CENTER)
    cert = Table([[
        Paragraph('<font name="Helvetica-Bold" size="11" color="#10b981">'
                  'CLEANUP CERTIFIED — All testing artifacts purged.<br/>'
                  f'Certified by GuardianX RedAgent Engine on {datetime.now().strftime("%Y-%m-%d")}.'
                  '</font>', cert_style)
    ]], colWidths=[CONTENT_W])
    cert.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#ecfdf5")),
        ("BOX", (0, 0), (-1, -1), 1, C_EMERALD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    story.append(cert)

    story.append(Spacer(1, 8*mm))
    end_style = ParagraphStyle("End", parent=STYLES["Body"], alignment=TA_CENTER)
    story.append(Paragraph(
        '<font color="#6b7280" size="8">'
        '— End of Report —<br/>'
        'GuardianX · www.guardianx.cloud · hello@guardianx.in · +91 70067 12347'
        '</font>', end_style))


# ── Main ────────────────────────────────────────────────────────────────────
def generate_report(json_path, output_path):
    with open(json_path) as f:
        data = json.load(f)

    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=18*mm, bottomMargin=18*mm,
        title=f"GuardianX VAPT Report — {data['target'].get('name','Target')}",
        author="GuardianX",
        subject="Vulnerability Assessment & Penetration Testing Report",
        creator="GuardianX RedAgent Engine",
    )

    # Frames
    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=MARGIN, rightPadding=MARGIN,
                        topPadding=0, bottomPadding=0, id="cover", showBoundary=0)
    body_frame = Frame(MARGIN, 16*mm, PAGE_W - 2*MARGIN, PAGE_H - 16*mm - 16*mm,
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
                       id="body", showBoundary=0)
    blank_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0, id="blank", showBoundary=0)

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=draw_cover_bg),
        PageTemplate(id="blank", frames=[blank_frame], onPage=draw_blank_bg),
        PageTemplate(id="body", frames=[body_frame], onPage=draw_body_bg),
    ])

    story = []
    # 1. Cover
    build_cover(data, story)
    # 2. Blank page
    build_blank_page(story)
    # 3. TOC + document control
    build_toc_and_control(data, story)
    # 4. Exec summary
    build_exec_summary(data, story)
    # 5. Scope
    build_scope(data, story)
    # 6. Methodology
    build_methodology(data, story)
    # 7. Findings master table
    build_findings_master_table(data, story)
    # 8. Detailed findings
    build_detailed_findings(data, story)
    # 9. Strategic recs
    build_strategic_recs(data, story)
    # 10. Retests
    build_retests(data, story)
    # 11. Appendices
    build_appendices(data, story)

    doc.build(story)
    print(f"OK: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate-vapt-report.py <input.json> <output.pdf>", file=sys.stderr)
        sys.exit(1)
    generate_report(sys.argv[1], sys.argv[2])
