export const setupSteps = [
  { id: 1, time: '10 min', icon: '📅', title: 'Create Booking Calendar', items: [
    'Go to calendly.com (free account)',
    'Create 15-min "Free Website Audit" slot',
    'Set availability: Mon-Fri 2–5 PM (Romanian time)',
    'Copy your calendar link',
    'Add to Linktree (step 2) OR Instagram bio',
  ]},
  { id: 2, time: '5 min', icon: '🔗', title: 'Create Bio Link Hub', items: [
    'Go to linktree.com (free)',
    '"📅 Book Free Audit" → Calendly link',
    '"💰 See Pricing" → Google Drive PDF link',
    '"💬 Join Community" → WhatsApp group link',
    'Update Instagram bio with Linktree URL NOW',
  ]},
  { id: 3, time: '15 min', icon: '📄', title: 'Create Lead Magnet PDF', items: [
    'Use Canva.com (free) — search "ebook" template',
    'Option A: 25-Point Website Audit Checklist',
    'Option B: Pricing & Packages Breakdown',
    'Option C: 5 Mistakes Killing Your Sales',
    'Export PDF → Upload to Google Drive → Add to Linktree',
  ]},
  { id: 4, time: '5 min', icon: '💬', title: 'Write DM Templates', items: [
    'Copy templates to Notes app on phone',
    'Template 1: for "website" comments',
    'Template 2: for price questions',
    'Template 3: for tags/mentions',
  ]},
  { id: 5, time: '1 min', icon: '🔔', title: 'Enable Notifications', items: [
    'Instagram → Settings → Notifications',
    'Turn ON: Direct message notifications',
    'Set phone to "priority" for Instagram DMs',
    'Goal: Reply to DMs within 5 minutes',
  ]},
]

export const dmTemplates = [
  {
    tag: 'Template 1',
    label: "For 'website' comments",
    text: `Hey! 👋 Most businesses lose money because their website doesn't convert. Free audit? Just say YES and we'll send details.`,
  },
  {
    tag: 'Template 2',
    label: 'For price questions',
    text: `Good Q! Depends on your needs (500-5000+). Real question: how much will you MAKE? Free 15min call to figure your number?\n[Calendly link]`,
  },
  {
    tag: 'Template 3',
    label: 'For tags/mentions',
    text: `Love this! Hey [name] - professional website yet? We helped [similar business] go from 0 to X leads/month. Free audit?\n[Link in bio]`,
  },
]

export const dailyPlan = [
  { time: '9–10 AM', title: 'Morning Check', duration: '10 min', color: '#7c3aed', items: [
    'Check overnight DMs — reply to ALL (use templates)',
    'Respond personally to all comments',
    'Note which posts got most engagement',
  ]},
  { time: '10–11 AM', title: 'Post Content', duration: '5 min', color: '#2563eb', items: [
    'Mon: Business card video',
    'Tue: Value post (benefits/results)',
    'Wed: FAQ or tips',
    'Thu: Testimonial',
    'Fri: Community challenge',
    'Sat: Behind-the-scenes',
    'Sun: Weekly recap + CTA',
  ]},
  { time: '6–7 PM', title: 'Engagement Sprint', duration: '10 min', color: '#059669', items: [
    'Post evening content',
    'Reply to ALL new DMs',
    'Like + comment on 10–15 similar accounts',
    'Check trending hashtags in your niche',
  ]},
]

export const posts = [
  {
    day: 'Monday', emoji: '🚀', title: 'Business Card Video', cta: 'DM for free audit',
    caption: `Meet the LocalBiz Pro team! 🚀\n\nWe build websites that actually CONVERT.\n\nWant to see what your business could look like online?\n\nFree audit: Reply "AUDIT" or click link in bio 👇\n\n#LocalBizPro #WebDesign #AntreprenoruiRomani\n#WebsiteProfesional #OnlineBusiness`,
  },
  {
    day: 'Tuesday', emoji: '📱', title: 'Value Post – 3 Reasons', cta: 'Click link in bio for free consultation',
    caption: `3 reasons your business needs a professional website in 2024 📱\n\nReason #1: 87% of customers research online before buying\nReason #2: Your competitors are already there\nReason #3: A website works 24/7 (you don't have to!)\n\nSmart move = Better website = More customers\n\nReady? Free 15-min consultation [link in bio] ↗️\n\nWhat's the #1 reason YOU need a website? Comment 👇`,
  },
  {
    day: 'Wednesday', emoji: '💰', title: 'FAQ – Price Question', cta: 'Get pricing guide (PDF from Linktree)',
    caption: `"How much does a website cost?" 💰\n\nGreat question! Honest answer:\n\n🔵 Starter: $500 (5 pages, basics)\n🔵 Growth: $1,500 (10 pages, SEO ready)\n🔵 Pro: $3,000+ (custom, full setup)\n\nBut here's what really matters...\n\nThat $2K investment is bringing clients $50K+ yearly 📈\n\nWhat's YOUR budget looking like? Let's talk:\n[Link in bio] or DM "PRICING"`,
  },
  {
    day: 'Thursday', emoji: '🎯', title: 'Testimonial / Case Study', cta: 'Book free audit',
    caption: `[Business Name] went from ZERO online to 5+ customers/month\n\nThe change? A professional website with clear CTAs.\n\nClient said: "[Quote about their results]"\n\nThis could be YOUR story! 🎯\n\nSimilar business? Let's chat:\n📅 Free audit: [Calendly link in bio]\nDM: "CASE STUDY" for more examples`,
  },
  {
    day: 'Friday', emoji: '🌍', title: 'Community Challenge', cta: 'Tag someone + they get free audit offer',
    caption: `Challenge: Tag 3 entrepreneurs who NEED a website 🚀\n\nKnow anyone still doing business without proper online presence?\n\nTag them below! Let's build the community of smart business owners.\n\nPs: Their first audit is free if they reach out 👇`,
  },
]

export const conversionScripts = [
  {
    stage: 'First DM', desc: 'They reach out',
    text: `Hey [Name]! 👋 So glad you reached out!\n\nQuick question to make sure I can help:\n1. What's your business type?\n2. Do you have a website already?\n3. What's the biggest challenge with your online presence?\n\nOnce I know more, I can give you a real audit, not BS. 💪`,
  },
  {
    stage: 'After They Respond', desc: 'Send the next step',
    text: `Perfect! That makes sense.\n\nI want to send you two things:\n1. Our free 25-point website audit checklist\n2. A calendar link to book a quick 15-min call (zero pressure)\n\nIn that call, I'll show you exactly what's working and what's costing you money.\n\nCool?\n[Links]`,
  },
  {
    stage: 'Before the Call', desc: 'Reminder message',
    text: `Excited for our chat tomorrow at [time]!\n\nQuick reminder: We'll look at your current situation and I'll show you exactly what could change (no sales pitch, just real talk).\n\nSee you then! 🎯`,
  },
]

export const donts = [
  'Not responding to DMs within 5 minutes (kills conversion)',
  'Using too many hashtags (looks spammy, algorithm punishes)',
  'Posting at random times (timing = 80% of reach)',
  "Not asking for the sale (just 'building community' won't pay bills)",
  'Generic captions (boring = ignored)',
  'Ignoring top comments (engagement signals lead to more reach)',
]

export const dos = [
  'Fast reply (< 5 min) = 60% of people say YES to call',
  'Personal touch (use their name) = Trust building',
  'Clear CTA (book call, audit, etc) = Action',
  'Daily posts = Algorithm loves consistency',
  'Respond in Romanian (personal connection)',
  'Reference Romanian businesses & local pain points',
]

export const timeline = [
  { week: 'Week 1', goal: 'Setup + 5 posts + 40 leads', pct: 0.25 },
  { week: 'Week 2', goal: 'Optimize best content + 50 leads + 1–2 clients', pct: 0.5 },
  { week: 'Week 3', goal: 'Scale + referral program + 60 leads', pct: 0.75 },
  { week: 'Week 4', goal: 'Systematize + build case studies + 70+ leads', pct: 1 },
]

export const immediateActions = [
  'Create Calendly account',
  'Create Linktree account',
  'Update Instagram bio link',
  'Copy DM templates to phone',
  'Enable DM notifications',
  'Schedule first 3 posts',
]
