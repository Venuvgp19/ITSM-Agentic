import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Theme Colors
    bg_color = RGBColor(11, 15, 25)          # Dark Slate
    card_bg = RGBColor(18, 24, 38)           # Card Panel
    title_color = RGBColor(255, 255, 255)    # White
    text_color = RGBColor(203, 213, 225)     # Slate 300
    brand_blue = RGBColor(99, 102, 241)      # Indigo 500
    accent_emerald = RGBColor(16, 185, 129)  # Emerald 500
    accent_amber = RGBColor(245, 158, 11)    # Amber 500
    accent_rose = RGBColor(244, 63, 94)      # Rose 500

    def apply_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = bg_color
        bg.line.fill.background()

    def add_header(slide, title_text, category_text="ENTERPRISE ITSM PLATFORM"):
        apply_background(slide)
        
        # Category Tag
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.733), Inches(0.3))
        tf_cat = cat_box.text_frame
        tf_cat.word_wrap = True
        p_cat = tf_cat.paragraphs[0]
        p_cat.text = category_text.upper()
        p_cat.font.size = Pt(10)
        p_cat.font.bold = True
        p_cat.font.color.rgb = brand_blue

        # Main Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.65), Inches(11.733), Inches(0.6))
        tf_title = title_box.text_frame
        tf_title.word_wrap = True
        p_title = tf_title.paragraphs[0]
        p_title.text = title_text
        p_title.font.size = Pt(22)
        p_title.font.bold = True
        p_title.font.color.rgb = title_color

    # SLIDE 1: Title Slide
    slide1 = prs.slides.add_slide(blank_layout)
    apply_background(slide1)

    accent_box = slide1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(11.733), Inches(4.2))
    accent_box.fill.solid()
    accent_box.fill.fore_color.rgb = card_bg
    accent_box.line.color.rgb = brand_blue

    tf1 = accent_box.text_frame
    tf1.word_wrap = True
    p1 = tf1.paragraphs[0]
    p1.text = "Enterprise IT Service Management (ITSM) Platform"
    p1.font.size = Pt(32)
    p1.font.bold = True
    p1.font.color.rgb = title_color

    p2 = tf1.add_paragraph()
    p2.text = "\nNext-Gen Autonomous AI Ticket Routing & Continuous Knowledge Base Architecture"
    p2.font.size = Pt(18)
    p2.font.color.rgb = brand_blue

    p3 = tf1.add_paragraph()
    p3.text = "\n\n• Continuous Agentic AI Ticket Router (NVIDIA Nemotron 3 550B LLM)\n• Continuous Knowledge Base & KEDB Synthesizer (Meta Llama 3.3 70B LLM)\n• 100% Persistent JSON Database File (Zero Data Loss on Restart)\n• Native Stdio Model Context Protocol (MCP) Server Integration"
    p3.font.size = Pt(14)
    p3.font.color.rgb = text_color

    # SLIDE 2: System Architecture Diagram & Token Calculation Per Incident
    slide2 = prs.slides.add_slide(blank_layout)
    add_header(slide2, "2. System Architecture & Token Calculation Engine", "PLATFORM INFRASTRUCTURE & LLM METRICS")

    img_path_arch = "docs/screenshots/architecture_diagram.png"
    if os.path.exists(img_path_arch):
        slide2.shapes.add_picture(img_path_arch, Inches(0.8), Inches(1.4), width=Inches(7.2))

    card_token = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.2), Inches(1.4), Inches(4.3), Inches(5.4))
    card_token.fill.solid()
    card_token.fill.fore_color.rgb = card_bg
    card_token.line.color.rgb = brand_blue
    tf_tok = card_token.text_frame
    tf_tok.word_wrap = True

    p = tf_tok.paragraphs[0]
    p.text = "Token Calculation Per Incident"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = accent_emerald

    token_bullets = [
      "🤖 NVIDIA Nemotron 3 550B (AI Ticket Router):",
      "  • Tokens: ~1,200 / incident (850 input + 350 output)",
      "  • Cost: $0.00190 / incident (~0.19 cents)",
      "\n📚 Meta Llama 3.3 70B (Knowledge Synthesizer):",
      "  • Tokens: ~600 / incident (~6,000 per 10-ticket batch)",
      "  • Cost: $0.00018 / incident (~0.018 cents)",
      "\n💰 TOTAL PIPELINE COST / INCIDENT:",
      "  • $0.00208 / incident (~0.2 cents per ticket)",
      "  • 1,000 Incidents Total Cost: $2.08",
      "\n📈 ROI & SAVINGS:",
      "  • Human Helpdesk Labor: $15.00 - $25.00 / incident",
      "  • Cost Reduction: 99.99% Savings! 🚀",
    ]
    for b in token_bullets:
        pb = tf_tok.add_paragraph()
        pb.text = b
        pb.font.size = Pt(9.5)
        if b.startswith("🤖") or b.startswith("📚") or b.startswith("💰") or b.startswith("📈"):
            pb.font.bold = True
            pb.font.color.rgb = accent_emerald if "💰" in b or "📈" in b else brand_blue
        else:
            pb.font.color.rgb = text_color

    # SLIDE 3: Live Dashboard Overview
    slide3 = prs.slides.add_slide(blank_layout)
    add_header(slide3, "3. Live Dashboard & Command Center Overview", "EXECUTIVE SERVICE MANAGEMENT DEMO")

    img_path_dash = "docs/screenshots/dashboard_overview.png"
    if os.path.exists(img_path_dash):
        slide3.shapes.add_picture(img_path_dash, Inches(0.8), Inches(1.4), width=Inches(8.2))

    card3 = slide3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.2), Inches(1.4), Inches(3.3), Inches(5.4))
    card3.fill.solid()
    card3.fill.fore_color.rgb = card_bg
    card3.line.color.rgb = brand_blue
    tf3 = card3.text_frame
    tf3.word_wrap = True

    p = tf3.paragraphs[0]
    p.text = "Dashboard Highlights"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = accent_emerald

    bullets3 = [
      "100% Dynamic Synchronization with backend database file (`incidents.json`).",
      "Total Database Incidents metric tracks 1,000+ persistent records.",
      "Live Unassigned Queue countdown reflects real-time AI Router progress.",
      "Real-time Active Incident Stream table with direct clickable links.",
      "98.4%+ SLA target compliance monitoring across P1 & P2 tickets."
    ]
    for b in bullets3:
        pb = tf3.add_paragraph()
        pb.text = f"\n• {b}"
        pb.font.size = Pt(11)
        pb.font.color.rgb = text_color

    # SLIDE 4: Agentic AI Ticket Router Terminal Logs
    slide4 = prs.slides.add_slide(blank_layout)
    add_header(slide4, "4. Agentic AI Ticket Router (NVIDIA Nemotron 3 550B LLM)", "AUTONOMOUS ITIL TRIAGE ENGINE")

    img_path_ai = "docs/screenshots/ai_router_terminal.png"
    if os.path.exists(img_path_ai):
        slide4.shapes.add_picture(img_path_ai, Inches(0.8), Inches(1.5), width=Inches(8.2))

    card4 = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.2), Inches(1.5), Inches(3.3), Inches(5.3))
    card4.fill.solid()
    card4.fill.fore_color.rgb = card_bg
    card4.line.color.rgb = brand_blue
    tf4 = card4.text_frame
    tf4.word_wrap = True

    p = tf4.paragraphs[0]
    p.text = "AI Router Features"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = accent_amber

    bullets4 = [
      "Continuous Background Monitoring: Scans unassigned queue every 10 seconds.",
      "NVIDIA Nemotron 3 550B LLM performs multi-factor diagnostic reasoning.",
      "Strict ITIL Group Routing (Unix, Network Ops, App Support, SecOps, DBA).",
      "High-Availability Rule Engine Fallback guarantees 96%+ routing uptime.",
      "Automatic execution logs emitted directly in NestJS console."
    ]
    for b in bullets4:
        pb = tf4.add_paragraph()
        pb.text = f"\n• {b}"
        pb.font.size = Pt(11)
        pb.font.color.rgb = text_color

    # SLIDE 5: Incident Console & Triage Queue
    slide5 = prs.slides.add_slide(blank_layout)
    add_header(slide5, "5. Incident Management Console & Triage Queue", "ITIL PROCESS EXECUTION")

    img_path_list = "docs/screenshots/incident_list.png"
    if os.path.exists(img_path_list):
        slide5.shapes.add_picture(img_path_list, Inches(0.8), Inches(1.4), width=Inches(8.2))

    card5 = slide5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.2), Inches(1.4), Inches(3.3), Inches(5.4))
    card5.fill.solid()
    card5.fill.fore_color.rgb = card_bg
    card5.line.color.rgb = brand_blue
    tf5 = card5.text_frame
    tf5.word_wrap = True

    p = tf5.paragraphs[0]
    p.text = "Console Capabilities"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = brand_blue

    bullets5 = [
      "1,000+ Record Database view powered by single source of truth.",
      "Multi-field search filter by Ticket ID, Title, Group, or Assigned Tech.",
      "Real-time counters for Unassigned Queue, Assigned & Resolved, and P1s.",
      "ITIL Impact x Urgency matrix automatically calculates P1 - P4 priorities.",
      "Direct integration with NestJS REST API (`GET /api/v1/incidents`)."
    ]
    for b in bullets5:
        pb = tf5.add_paragraph()
        pb.text = f"\n• {b}"
        pb.font.size = Pt(11)
        pb.font.color.rgb = text_color

    # SLIDE 6: Incident Detail & Agentic AI Work Notes
    slide6 = prs.slides.add_slide(blank_layout)
    add_header(slide6, "6. Incident Detail & Agentic AI Work Notes Log", "DIAGNOSTIC WORKFLOW & AUDIT TRAIL")

    img_path_det = "docs/screenshots/incident_detail.png"
    if os.path.exists(img_path_det):
        slide6.shapes.add_picture(img_path_det, Inches(0.8), Inches(1.4), width=Inches(8.2))

    card6 = slide6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.2), Inches(1.4), Inches(3.3), Inches(5.4))
    card6.fill.solid()
    card6.fill.fore_color.rgb = card_bg
    card6.line.color.rgb = brand_blue
    tf6 = card6.text_frame
    tf6.word_wrap = True

    p = tf6.paragraphs[0]
    p.text = "Activity Log Audit"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = accent_emerald

    bullets6 = [
      "Agentic AI Router posts internal Department Work Notes automatically.",
      "Includes reasoning text, target group, assigned lead, and confidence score.",
      "ITIL Close Codes (Kernel Patch, DB Vacuum, SSO Fix, BGP Reset).",
      "SLA Target Metrics timer (Response SLA & Resolution SLA).",
      "Persistent activity timeline preserved in database file."
    ]
    for b in bullets6:
        pb = tf6.add_paragraph()
        pb.text = f"\n• {b}"
        pb.font.size = Pt(11)
        pb.font.color.rgb = text_color

    # SLIDE 7: Knowledge Base & KEDB Synthesizer
    slide7 = prs.slides.add_slide(blank_layout)
    add_header(slide7, "7. Continuous Knowledge Base (Meta Llama 3.3 70B)", "AUTONOMOUS KNOWLEDGE SYNTHESIS")

    img_path_kb = "docs/screenshots/knowledge_base.png"
    if os.path.exists(img_path_kb):
        slide7.shapes.add_picture(img_path_kb, Inches(0.8), Inches(1.4), width=Inches(8.2))

    card7 = slide7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.2), Inches(1.4), Inches(3.3), Inches(5.4))
    card7.fill.solid()
    card7.fill.fore_color.rgb = card_bg
    card7.line.color.rgb = brand_blue
    tf7 = card7.text_frame
    tf7.word_wrap = True

    p = tf7.paragraphs[0]
    p.text = "Knowledge Synthesizer"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = accent_amber

    bullets7 = [
      "Continuous Background AI Worker running in NestJS backend.",
      "Scans 1,000 incident diagnostic notes in 10-ticket batches.",
      "Synthesizes Standard Operating Procedures (SOPs) & KEDB workarounds.",
      "Meta Llama 3.3 70B Instruct LLM powers intelligent synthesis.",
      "Live progress bar tracks 100% completion across 1,000 tickets."
    ]
    for b in bullets7:
        pb = tf7.add_paragraph()
        pb.text = f"\n• {b}"
        pb.font.size = Pt(11)
        pb.font.color.rgb = text_color

    # Save Presentation to both filenames
    for fname in ["Enterprise_ITSM_Platform_Presentation.pptx", "Agentic_AI_ITSM_Platform.pptx"]:
        try:
            prs.save(fname)
            print(f"PowerPoint presentation successfully saved to: {fname}")
        except Exception as e:
            print(f"Could not write to {fname} (file may be open in PowerPoint): {e}")

if __name__ == '__main__':
    build_presentation()
