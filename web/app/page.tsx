"use client";
import { useRef, useState, useEffect, useCallback } from "react";

const BLUE = "#4a90d9";
const CREAM = "#f0eacc";
const DIM = "#6478a0";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const THEMES = [
  {
    headline: "MEET LOCALBIZ PRO",
    sub: "Smart AI Solutions For Your Business",
    cta: "Free Audit → Link in Bio",
  },
  {
    headline: "87% OF CUSTOMERS\nRESEARCH ONLINE FIRST",
    sub: "Is your business ready to be found?",
    cta: "Book Free Audit Today",
  },
  {
    headline: '"HOW MUCH DOES IT COST?"',
    sub: "Starter from $500 · Pro from $1,500\nROI: clients report 10x returns",
    cta: "DM PRICING for our guide",
  },
  {
    headline: "FROM 0 TO 5 CLIENTS/MONTH",
    sub: "One professional website changed everything.\nThis could be your story.",
    cta: "DM CASE STUDY for details",
  },
  {
    headline: "TAG 3 ENTREPRENEURS\nWHO NEED THIS",
    sub: "Their first audit is FREE if they reach out today.",
    cta: "Tag them below",
  },
  {
    headline: "BUILDING YOUR BUSINESS\nONLINE IS OUR MISSION",
    sub: "AI Automation · Productivity · Custom Solutions",
    cta: "See what we built → Link in Bio",
  },
  {
    headline: "THIS WEEK IN REVIEW",
    sub: "New clients. New websites. New growth.\nJoin the LocalBiz Pro community.",
    cta: "Start your journey → Free Audit",
  },
];

const ICONS = [
  {
    label: "AI\nAuto",
    svg: (
      <svg viewBox="0 0 24 24" width="26" height="26" stroke={BLUE} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </svg>
    ),
  },
  {
    label: "Pro-\nductiv.",
    svg: (
      <svg viewBox="0 0 24 24" width="26" height="26" stroke={BLUE} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="5" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="3" y="11" width="7" height="10" rx="1" /><rect x="14" y="11" width="7" height="10" rx="1" />
      </svg>
    ),
  },
  {
    label: "Inte-\ngration",
    svg: (
      <svg viewBox="0 0 24 24" width="26" height="26" stroke={BLUE} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    label: "Custom\nSol.",
    svg: (
      <svg viewBox="0 0 24 24" width="26" height="26" stroke={BLUE} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
  },
];

interface CardFields {
  headline: string;
  sub: string;
  cta: string;
  website: string;
  badge: string;
}

function CardPreview({ fields }: { fields: CardFields }) {
  const headline = fields.headline.split("\n");
  const sub = fields.sub.split("\n");

  return (
    <div
      className="card-scene"
      style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}
    >
      <div className="card-grid" />
      <div className="card-orb-1" />
      <div className="card-orb-2" />

      {/* Corner accents */}
      <div className="card-corner" style={{ top: 24, left: 24, borderWidth: "2px 0 0 2px", borderRadius: "4px 0 0 0" }} />
      <div className="card-corner" style={{ top: 24, right: 24, borderWidth: "2px 2px 0 0", borderRadius: "0 4px 0 0" }} />
      <div className="card-corner" style={{ bottom: 24, left: 24, borderWidth: "0 0 2px 2px", borderRadius: "0 0 0 4px" }} />
      <div className="card-corner" style={{ bottom: 24, right: 24, borderWidth: "0 2px 2px 0", borderRadius: "0 0 4px 0" }} />

      <div className="card-main">
        <div className="card-box">
          <div style={{ display: "flex", gap: 60, alignItems: "center" }}>
            {/* LEFT */}
            <div style={{ flex: 1 }}>
              {/* Brand name */}
              <div style={{ lineHeight: 0.9 }}>
                <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: 8, color: CREAM, textShadow: "0 0 40px rgba(240,234,204,0.15)" }}>
                  LOCALBIZ
                </div>
                <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: 8, color: BLUE, textShadow: "0 0 30px rgba(74,144,217,0.4)" }}>
                  PRO
                </div>
              </div>

              <div style={{ marginTop: 20, fontSize: 14, fontWeight: 700, letterSpacing: 4, color: BLUE, textTransform: "uppercase" }}>
                B-2-B AI Solutions · Backed by AI
              </div>

              {/* Divider */}
              <div style={{ marginTop: 18, width: 60, height: 3, background: `linear-gradient(90deg, ${BLUE}, transparent)`, borderRadius: 2 }} />

              {/* Headline */}
              <div style={{ marginTop: 18 }}>
                {headline.map((l, i) => (
                  <div key={i} style={{ fontSize: 36, fontWeight: 900, letterSpacing: 2, color: CREAM, lineHeight: 1.2, textTransform: "uppercase" }}>{l}</div>
                ))}
              </div>

              {/* Sub */}
              <div style={{ marginTop: 12 }}>
                {sub.map((l, i) => (
                  <div key={i} style={{ fontSize: 20, color: DIM, lineHeight: 1.5 }}>{l}</div>
                ))}
              </div>

              {/* Icons */}
              <div style={{ display: "flex", gap: 20, marginTop: 28 }}>
                {ICONS.map((ic, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div className="icon-box-card">{ic.svg}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "rgba(240,234,204,0.7)", textAlign: "center", textTransform: "uppercase", lineHeight: 1.3, whiteSpace: "pre-line" }}>
                      {ic.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — photo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", width: 220, height: 220, borderRadius: "50%", border: `3px solid ${BLUE}`, boxShadow: `0 0 0 6px rgba(74,144,217,0.1), 0 0 40px rgba(74,144,217,0.25)`, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/founder-photo.jpeg"
                  alt="Founder"
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }}
                />
              </div>
              <div style={{ background: `linear-gradient(135deg, ${BLUE}, #7fc6ff)`, color: "#0a0a14", fontSize: 11, fontWeight: 900, letterSpacing: 2, padding: "8px 20px", borderRadius: 20, textTransform: "uppercase" }}>
                {fields.badge}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ marginTop: 36, paddingTop: 24, borderTop: "1px solid rgba(74,144,217,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, color: "rgba(240,234,204,0.5)", textTransform: "lowercase" }}>
              {fields.website}
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 3, color: BLUE, textTransform: "uppercase", border: `1.5px solid rgba(74,144,217,0.5)`, padding: "10px 24px", borderRadius: 30, background: "rgba(74,144,217,0.08)" }}>
              {fields.cta}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CardGenerator() {
  const [dayIdx, setDayIdx] = useState(0);
  const [fields, setFields] = useState<CardFields>({
    headline: THEMES[0].headline,
    sub: THEMES[0].sub,
    cta: THEMES[0].cta,
    website: "localbizpro.ro",
    badge: "AI Expert",
  });
  const [downloading, setDownloading] = useState(false);
  const [allProgress, setAllProgress] = useState<string | null>(null);
  const [scale, setScale] = useState(0.55);
  const previewRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const compute = () => {
      const availW = window.innerWidth - 340 - 64;
      const availH = window.innerHeight - 64;
      setScale(Math.min(availW / 1080, availH / 1080));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const selectDay = (i: number) => {
    setDayIdx(i);
    setFields(f => ({ ...f, headline: THEMES[i].headline, sub: THEMES[i].sub, cta: THEMES[i].cta }));
  };

  const downloadPNG = useCallback(async () => {
    if (!previewRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(previewRef.current, {
        width: 1080,
        height: 1080,
        scale: 1,
        useCORS: true,
        backgroundColor: "#0a0a14",
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `localbizpro-${DAYS[dayIdx].toLowerCase()}-card.png`;
      a.click();
    } finally {
      setDownloading(false);
    }
  }, [dayIdx, downloading]);

  const downloadAllDays = useCallback(async () => {
    if (downloading || allProgress) return;
    const html2canvas = (await import("html2canvas")).default;
    const savedFields = { ...fields };
    const savedDay = dayIdx;

    for (let i = 0; i < 7; i++) {
      setAllProgress(`${i + 1} / 7 — ${DAYS[i]}`);
      setDayIdx(i);
      setFields(f => ({ ...f, headline: THEMES[i].headline, sub: THEMES[i].sub, cta: THEMES[i].cta }));
      // Wait for React to re-render
      await new Promise(r => setTimeout(r, 300));
      if (!previewRef.current) continue;
      const canvas = await html2canvas(previewRef.current, {
        width: 1080, height: 1080, scale: 1, useCORS: true, backgroundColor: "#0a0a14",
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `localbizpro-${DAYS[i].toLowerCase()}-card.png`;
      a.click();
      await new Promise(r => setTimeout(r, 200));
    }

    // Restore original
    setDayIdx(savedDay);
    setFields(savedFields);
    setAllProgress(null);
  }, [downloading, allProgress, fields, dayIdx]);

  const update = (key: keyof CardFields) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setFields(f => ({ ...f, [key]: e.target.value }));

  const PREVIEW_SIZE = 1080;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a14" }}>
      {/* SIDEBAR */}
      <div className="sidebar">
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid rgba(74,144,217,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: BLUE, textTransform: "uppercase" }}>LocalBiz Pro</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: CREAM, marginTop: 2 }}>Card Generator</div>
        </div>

        {/* Day selector */}
        <div className="control-group">
          <span className="control-label">Weekly Theme</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DAYS.map((d, i) => (
              <button key={i} className={`day-btn${dayIdx === i ? " active" : ""}`} onClick={() => selectDay(i)}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Headline */}
        <div className="control-group">
          <label className="control-label">Headline (use \n for line break)</label>
          <textarea
            className="control-input"
            rows={3}
            value={fields.headline}
            onChange={update("headline")}
          />
        </div>

        {/* Sub */}
        <div className="control-group">
          <label className="control-label">Subtitle</label>
          <textarea
            className="control-input"
            rows={3}
            value={fields.sub}
            onChange={update("sub")}
          />
        </div>

        {/* CTA */}
        <div className="control-group">
          <label className="control-label">CTA Button Text</label>
          <input className="control-input" value={fields.cta} onChange={update("cta")} />
        </div>

        {/* Website */}
        <div className="control-group">
          <label className="control-label">Website</label>
          <input className="control-input" value={fields.website} onChange={update("website")} />
        </div>

        {/* Badge */}
        <div className="control-group">
          <label className="control-label">Badge Text</label>
          <input className="control-input" value={fields.badge} onChange={update("badge")} />
        </div>

        {/* Download */}
        <div style={{ padding: "20px 20px 8px" }}>
          <button className="dl-btn" onClick={downloadPNG} disabled={downloading || !!allProgress}>
            {downloading ? "Exporting..." : "Download PNG (1080×1080)"}
          </button>
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          <button
            className="dl-btn"
            onClick={downloadAllDays}
            disabled={downloading || !!allProgress}
            style={{ background: "transparent", border: `1.5px solid ${BLUE}`, color: BLUE }}
          >
            {allProgress ? `Exporting ${allProgress}...` : "Download All 7 Days"}
          </button>
        </div>

        <div style={{ padding: "0 20px 20px", fontSize: 11, color: DIM, lineHeight: 1.6 }}>
          Preview is scaled to fit screen. Export is full 1080×1080.
        </div>
      </div>

      {/* PREVIEW AREA */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          overflow: "hidden",
        }}
      >
        <div
          ref={scaleRef}
          style={{
            transformOrigin: "center center",
            transform: `scale(${scale})`,
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
          }}
        >
          <div ref={previewRef}>
            <CardPreview fields={fields} />
          </div>
        </div>
      </div>
    </div>
  );
}
