#!/usr/bin/env python3
"""
LocalBiz Pro — Daily Instagram Content Generator
Creates brand card images for each day's theme.
Run: python3 daily-post-generator.py
"""

from PIL import Image, ImageDraw, ImageFont
import os, sys, datetime

BRAND_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(BRAND_DIR, "logo-localbiz-pro.jpeg")
PHOTO_PATH = os.path.join(BRAND_DIR, "founder-photo.jpeg")
OUTPUT_DIR = os.path.join(BRAND_DIR, "posts")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Colors
BG      = (10, 10, 20)
CARD_BG = (17, 17, 40)
CREAM   = (240, 234, 204)
BLUE    = (74, 144, 217)
DIM     = (100, 120, 160)

# 1080x1080 square — Instagram feed format
W = H = 1080

WEEKLY_THEMES = {
    0: {  # Monday
        "type": "brand_card",
        "headline": "MEET LOCALBIZ PRO",
        "sub": "Smart AI Solutions For Your Business",
        "cta": "Free Audit → Link in Bio",
        "tag": "#LocalBizPro #AIBusiness",
    },
    1: {  # Tuesday
        "type": "value",
        "headline": "87% OF CUSTOMERS\nRESEARCH ONLINE FIRST",
        "sub": "Is your business ready to be found?",
        "cta": "Book Free Audit Today",
        "tag": "#WebDesign #OnlineBusiness",
    },
    2: {  # Wednesday
        "type": "faq",
        "headline": '"HOW MUCH DOES IT COST?"',
        "sub": "Starter from $500 · Pro from $1,500\nROI: clients report 10x returns",
        "cta": "DM PRICING for our guide",
        "tag": "#WebsitePricing #LocalBusiness",
    },
    3: {  # Thursday
        "type": "social_proof",
        "headline": "FROM 0 TO 5 CLIENTS/MONTH",
        "sub": "One professional website changed everything.\nThis could be your story.",
        "cta": "DM CASE STUDY for details",
        "tag": "#SuccessStory #AIAutomation",
    },
    4: {  # Friday
        "type": "community",
        "headline": "TAG 3 ENTREPRENEURS\nWHO NEED THIS",
        "sub": "Their first audit is FREE if they reach out today.",
        "cta": "Tag them below 👇",
        "tag": "#Antreprenor #Romania",
    },
    5: {  # Saturday
        "type": "behind_scenes",
        "headline": "BUILDING YOUR BUSINESS\nONLINE IS OUR MISSION",
        "sub": "AI Automation · Productivity · Custom Solutions",
        "cta": "See what we built → Link in Bio",
        "tag": "#BehindTheScenes #Startup",
    },
    6: {  # Sunday
        "type": "weekly_recap",
        "headline": "THIS WEEK IN REVIEW",
        "sub": "New clients. New websites. New growth.\nJoin the LocalBiz Pro community.",
        "cta": "Start your journey → Free Audit",
        "tag": "#WeeklyRecap #LocalBizPro",
    },
}


def rounded_rect(draw, xy, radius, fill, outline=None, outline_width=2):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill,
                           outline=outline, width=outline_width)


def add_glow_line(img, y, color, alpha=60):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for i in range(8, 0, -1):
        a = int(alpha * (i / 8))
        d.line([(0, y - i), (W, y - i)], fill=(*color, a), width=1)
        d.line([(0, y + i), (W, y + i)], fill=(*color, a), width=1)
    d.line([(0, y), (W, y)], fill=(*color, alpha), width=2)
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def paste_circle_photo(base_img, photo_path, center, radius):
    try:
        photo = Image.open(photo_path).convert("RGBA")
        size = radius * 2
        photo = photo.resize((size, size), Image.LANCZOS)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
        photo.putalpha(mask)
        # Blue ring
        ring = Image.new("RGBA", (size + 16, size + 16), (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse([0, 0, size + 15, size + 15],
                                     outline=(*BLUE, 220), width=3)
        base_img.paste(ring, (center[0] - radius - 8, center[1] - radius - 8), ring)
        base_img.paste(photo, (center[0] - radius, center[1] - radius), photo)
    except Exception as e:
        print(f"  [photo] {e}")


def get_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial Black.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def generate_post(day_index=None, date_label=None):
    if day_index is None:
        day_index = datetime.date.today().weekday()
    if date_label is None:
        date_label = datetime.date.today().strftime("%b %d, %Y")

    theme = WEEKLY_THEMES[day_index % 7]
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # subtle grid
    for x in range(0, W, 54):
        draw.line([(x, 0), (x, H)], fill=(74, 144, 217, 8), width=1)
    for y in range(0, H, 54):
        draw.line([(0, y), (W, y)], fill=(74, 144, 217, 8), width=1)

    # Card
    rounded_rect(draw, [60, 60, W - 60, H - 60], 20, CARD_BG,
                 outline=(*BLUE, 80), outline_width=2)

    # Top accent line
    draw.line([(160, 61), (W - 160, 61)], fill=BLUE, width=2)

    # Brand name
    f_brand = get_font(100, bold=True)
    f_sub   = get_font(32)
    f_cta   = get_font(28, bold=True)
    f_tag   = get_font(22)
    f_small = get_font(20)

    draw.text((120, 110), "LOCALBIZ", font=f_brand, fill=CREAM)
    draw.text((120, 205), "PRO", font=f_brand, fill=BLUE)

    # Thin divider
    draw.line([(120, 320), (320, 320)], fill=BLUE, width=3)

    # Headline
    headline_lines = theme["headline"].split("\n")
    f_head = get_font(48, bold=True)
    y = 345
    for line in headline_lines:
        draw.text((120, y), line, font=f_head, fill=CREAM)
        y += 58

    # Sub text
    y += 10
    for line in theme["sub"].split("\n"):
        draw.text((120, y), line, font=f_sub, fill=DIM)
        y += 42

    # CTA pill
    y += 30
    cta_text = theme["cta"]
    bbox = draw.textbbox((0, 0), cta_text, font=f_cta)
    tw = bbox[2] - bbox[0]
    pill_x0, pill_y0 = 120, y
    pill_x1, pill_y1 = pill_x0 + tw + 40, y + 50
    rounded_rect(draw, [pill_x0, pill_y0, pill_x1, pill_y1], 25,
                 None, outline=BLUE, outline_width=2)
    draw.text((pill_x0 + 20, pill_y0 + 10), cta_text, font=f_cta, fill=BLUE)

    # Photo (right side)
    paste_circle_photo(img, PHOTO_PATH, center=(820, 260), radius=160)
    draw.text((740, 445), "AI Expert", font=f_small, fill=DIM)

    # Icons row
    icons_y = H - 200
    draw.line([(120, icons_y - 20), (W - 120, icons_y - 20)],
              fill=(74, 144, 217, 40), width=1)

    services = ["AI AUTO", "PRODUC-\nTIVITY", "INTEGRA-\nTION", "CUSTOM\nSOL."]
    icon_x = 140
    for svc in services:
        rounded_rect(draw, [icon_x, icons_y, icon_x + 80, icons_y + 80], 12,
                     None, outline=(*BLUE, 140), outline_width=2)
        draw.text((icon_x + 8, icons_y + 8), svc, font=get_font(14), fill=BLUE)
        icon_x += 140

    # Bottom bar
    draw.line([(120, H - 100), (W - 120, H - 100)], fill=(74, 144, 217, 30), width=1)
    draw.text((120, H - 80), "localbizpro.ro", font=f_small, fill=DIM)
    draw.text((W - 320, H - 80), date_label, font=f_small, fill=DIM)

    # Hashtags
    draw.text((120, H - 50), theme["tag"], font=get_font(18), fill=(60, 100, 150))

    # Corner accents
    for (cx, cy, dx, dy) in [(80, 80, 1, 1), (W-80, 80, -1, 1),
                              (80, H-80, 1, -1), (W-80, H-80, -1, -1)]:
        draw.line([(cx, cy), (cx + dx*30, cy)], fill=(*BLUE, 180), width=2)
        draw.line([(cx, cy), (cx, cy + dy*30)], fill=(*BLUE, 180), width=2)

    day_name = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][day_index % 7]
    fname = f"post_{day_name.lower()}_{datetime.date.today().strftime('%Y%m%d')}.jpg"
    out = os.path.join(OUTPUT_DIR, fname)
    img.save(out, "JPEG", quality=95)
    print(f"✅ Saved: {out}")
    return out


def generate_week():
    print(f"Generating full week of posts...\n")
    for i in range(7):
        generate_post(i)
    print(f"\nAll posts saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "week":
        generate_week()
    else:
        out = generate_post()
        print(f"Today's post: {out}")
