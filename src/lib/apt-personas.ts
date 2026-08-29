// APT Persona Engine — 10+ real-world threat actor group personas used by
// the APT Persona Simulator (/api/apt-simulate + apt-persona-engine.tsx).
//
// Each persona captures the group's origin, motivation, known TTPs,
// preferred vulnerability classes, sophistication tier, and known attacks.
// The simulator builds a system prompt that asks an LLM to role-play as
// the persona and analyze how THEY would attack the user's codebase.
//
// Sources: public MITRE ATT&CK group pages, CISA advisories, Mandiant and
// CrowdStrike threat intel reports. Severity of TTPs + preferred vuln
// classes are aggregated from those sources.

export type Sophistication = "low" | "medium" | "high" | "elite";

export interface AptPersona {
  id: string;
  name: string;        // "Lazarus Group"
  alias: string;       // "APT38, Hidden Cobra"
  origin: string;      // "North Korea"
  flag: string;        // emoji flag for the origin country/region
  activeSince: string; // "2009"
  motivation: string;  // "Financial gain, espionage"
  ttps: string[];      // ["Spear-phishing", "SWIFT exploits", ...]
  preferredVulns: string[]; // ["SQLi", "deserialization", ...]
  knownFor: string;    // "Sony hack, Bangladesh Bank heist, WannaCry"
  sophistication: Sophistication;
  color: string;       // tailwind neon-* color name (emerald|cyan|amber|rose|red|violet)
  description: string; // 1-2 sentence flavor text for the persona card
}

export const APT_PERSONAS: AptPersona[] = [
  {
    id: "lazarus",
    name: "Lazarus Group",
    alias: "APT38, Hidden Cobra, Guardians of Peace",
    origin: "North Korea",
    flag: "🇰🇵",
    activeSince: "2007",
    motivation: "Financial gain, espionage, destructive attacks",
    ttps: [
      "Spear-phishing with malicious Office documents",
      "Watering hole attacks on financial-sector websites",
      "SWIFT transaction manipulation",
      "Custom malware (Manuscrypt, AppleJeus, TrickMo)",
      "Supply-chain compromise (3CX, CoinTrade)",
      "Social engineering on crypto exchange employees",
    ],
    preferredVulns: [
      "Insecure deserialization",
      "SQL injection",
      "Hardcoded credentials",
      "Supply-chain dependency confusion",
      "Weak authentication bypass",
    ],
    knownFor: "Sony Pictures hack (2014), Bangladesh Bank heist ($81M, 2016), WannaCry ransomware (2017), 3CX supply-chain attack (2023)",
    sophistication: "elite",
    color: "red",
    description: "State-sponsored North Korean group — the most prolific financially-motivated APT in the world. Patient, well-resourced, and ruthless.",
  },
  {
    id: "apt29",
    name: "APT29",
    alias: "Cozy Bear, The Dukes, Midnight Blizzard",
    origin: "Russia (SVR)",
    flag: "🇷🇺",
    activeSince: "2008",
    motivation: "Espionage, diplomatic intelligence collection",
    ttps: [
      "Spear-phishing with credential-harvesting links",
      "Password spraying + token theft",
      "Supply-chain compromise (SolarWinds)",
      "Abuse of OAuth + cloud service accounts",
      "Living-off-the-land binaries (WMI, PowerShell)",
      "Long-dwell recon before exfiltration",
    ],
    preferredVulns: [
      "SSRF (metadata service abuse)",
      "Broken authentication / token reuse",
      "Excessive file/path permissions",
      "Insufficient logging & monitoring",
      "Misconfigured OAuth scopes",
    ],
    knownFor: "SolarWinds supply-chain attack (2020), Democratic National Committee breach (2016), Microsoft + HPE cloud intrusions (2024)",
    sophistication: "elite",
    color: "violet",
    description: "Russia's SVR. Quiet, surgical, maximizes dwell time. Specializes in trust-chain compromise — they own your vendor, then they own you.",
  },
  {
    id: "apt28",
    name: "APT28",
    alias: "Fancy Bear, Sofacy, Forest Blizzard, STRONTIUM",
    origin: "Russia (GRU Unit 26165)",
    flag: "🇷🇺",
    activeSince: "2007",
    motivation: "Espionage, disruptive attacks, geopolitical influence",
    ttps: [
      "Spear-phishing with credential-harvesting pages",
      "Zero-day exploitation (Flash, IE, Win kernel)",
      "Credential theft via Mimikatz + Kerberoasting",
      "Wiper malware (NotPetya, WhisperGate)",
      "Website defacement + leak operations",
      " spear-phishing campaigns at scale (thousands of targets)",
    ],
    preferredVulns: [
      "Cross-site scripting (XSS)",
      "Open redirect for phishing chains",
      "Outdated software / unpatched CVEs",
      "Weak password policies",
      "Insufficient MFA enforcement",
    ],
    knownFor: "DNC email leak (2016), NotPetya (2017 — $10B damage), SolarWinds follow-on, WhisperGate (2022 Ukraine)",
    sophistication: "elite",
    color: "rose",
    description: "Russia's GRU. Aggressive, high-tempo, willing to burn zero-days at scale. Weaponizes every vuln class — they want impact, not stealth.",
  },
  {
    id: "fin7",
    name: "FIN7",
    alias: "Carbanak Group, Navigator Bear, GOLD NIAGARA",
    origin: "Russia / Ukraine",
    flag: "🇺🇦",
    activeSince: "2013",
    motivation: "Financial gain (credit card theft, wire fraud)",
    ttps: [
      "Spear-phishing restaurant + retail staff",
      "Drive-by compromise via compromised ad networks",
      "Carbanak / VileRAT / METAmorph custom malware",
      "POS RAM scraper deployment",
      "SQL injection against external-facing apps",
      "Domain fronting for C2",
    ],
    preferredVulns: [
      "SQL injection",
      "Deserialization RCE",
      "Privilege escalation in Active Directory",
      "Exposed RDP / SSH",
      "Outdated web framework CVEs",
    ],
    knownFor: "Targeted 100+ US companies (over $3B stolen), Chili's, Arby's, Red Robin breaches, $1B bank heists via SWIFT",
    sophistication: "high",
    color: "amber",
    description: "Financially-motivated cybercrime syndicate with SOC-level tradecraft. They operate like a business — with developers, ops, and a 24/7 help desk.",
  },
  {
    id: "apt41",
    name: "APT41",
    alias: "BARIUM, Winnti, Double Dragon",
    origin: "China (state-aligned + financially motivated)",
    flag: "🇨🇳",
    activeSince: "2012",
    motivation: "Espionage + financial gain (dual mission)",
    ttps: [
      "Supply-chain compromise of game studios + software vendors",
      "Living-off-the-land via PowerShell, WMI",
      "Custom malware (Winnti, ShadowPad, PlugX)",
      "Exploitation of popular web apps (Citrix, Cisco, Zoho)",
      "Credential stuffing + 2FA interception",
      "Cryptojacking side-operations",
    ],
    preferredVulns: [
      "Dependency confusion / typosquatting",
      "Deserialization (Java/Python)",
      "Server-side request forgery (SSRF)",
      "Hardcoded signing keys in binaries",
      "Outdated VPN appliance CVEs",
    ],
    knownFor: "CCleaner supply-chain attack (2017 — 2.3M infected), SolarWinds predecessor, gaming-industry compromises, ShadowPad campaigns",
    sophistication: "elite",
    color: "red",
    description: "Unique dual-mission Chinese group: state espionage by day, financially-motivated cybercrime by night. Supply-chain experts — they poison your build pipeline.",
  },
  {
    id: "sandworm",
    name: "Sandworm",
    alias: "IRIDIUM, Voodoo Bear, Seashell Blizzard",
    origin: "Russia (GRU Unit 74455)",
    flag: "🇷🇺",
    activeSince: "2009",
    motivation: "Disruptive + destructive attacks, geopolitical coercion",
    ttps: [
      "Spear-phishing with malicious Office macros",
      "Supply-chain compromise (VPN appliances)",
      "Destructive wiper malware (NotPetya, HermeticWiper, CaddyWiper)",
      "OT/ICS disruption (Industroyer, BlackEnergy)",
      "Critical-infrastructure recon (power, water, telecom)",
      "Living-off-the-land via legitimate admin tools",
    ],
    preferredVulns: [
      "Exposed management interfaces",
      "Hardcoded credentials in IoT/OT",
      "Outdated VPN/router firmware",
      "Insecure ICS protocols (Modbus, DNP3)",
      "Insufficient network segmentation",
    ],
    knownFor: "NotPetya ($10B damage), Ukraine power grid attack (2015), Industroyer (2016), Garmin outage (2020), ViaSat KA-SAT (2022)",
    sophistication: "elite",
    color: "red",
    description: "Russia's most destructive unit. Their goal isn't data theft — it's kinetic impact. If they breach you, they're going to destroy data and brick systems.",
  },
  {
    id: "equation-group",
    name: "Equation Group",
    alias: "STRAITBIZARRE, OUTERSPACE",
    origin: "United States (NSA TAO)",
    flag: "🇺🇸",
    activeSince: "2001",
    motivation: "Counterterrorism, foreign-intelligence espionage",
    ttps: [
      "Air-gapped system compromise via USB implants",
      "Hardware/firmware-level implants (BIOS, HDD firmware)",
      "Zero-day stockpiling + EternalBlue, EternalRomance",
      "Compromised certificate authorities",
      "Quantum insert (MITM via backbone taps)",
      "SIGINT-enabled tailored access",
    ],
    preferredVulns: [
      "SMBv1 / NetBIOS vulnerabilities",
      "Unpatched Windows kernel CVEs",
      "Exposed management interfaces",
      "Insecure boot chains",
      "Unencrypted inter-domain traffic",
    ],
    knownFor: "Stuxnet (Iran nuclear facility), Regin, DoubleFeature, EternalBlue (later weaponized by WannaCry), Shadow Brokers leak (2017)",
    sophistication: "elite",
    color: "cyan",
    description: "NSA's elite Tailored Access Operations unit. The most sophisticated APT ever publicly identified. Their lost tools built the modern cybercrime economy.",
  },
  {
    id: "anonymous-sudan",
    name: "Anonymous Sudan",
    alias: "Storm-1359, Sudan Anonymous",
    origin: "Sudan (claim) / Russia (suspected affiliation)",
    flag: "🇸🇩",
    activeSince: "2023",
    motivation: "Religious/political hacktivism, DDoS-for-hire",
    ttps: [
      "Volumetric DDoS (Layer 7 — HTTP floods)",
      "Botnet-driven reflection/amplification attacks",
      " credential-stuffing against identity providers",
      "Social-engineering pretexting on helpdesks",
      "Defacement of high-profile landing pages",
      "MFA-fatigue bombing on Azure / Okta",
    ],
    preferredVulns: [
      "Missing rate limiting",
      "Insufficient WAF / bot protection",
      "MFA push fatigue (no number-matching)",
      "Helpdesk password-reset bypass",
      "Missing CDN DDoS protection",
    ],
    knownFor: "DDoS against Microsoft 365, Outlook, Azure Portal (2023), OpenAI ChatGPT, Steam, PayPal — thousands of high-profile takedowns",
    sophistication: "medium",
    color: "amber",
    description: "High-volume DDoS hacktivists. Lower technical sophistication, but relentless — they've taken down Microsoft, OpenAI, and Steam. Defense is about rate-limiting, not patches.",
  },
  {
    id: "lapsus",
    name: "Lapsus$",
    alias: "DEV-0537, Scattered Spider (overlapping)",
    origin: "Brazil / UK / International (teen-led collective)",
    flag: "🇧🇷",
    activeSince: "2021",
    motivation: "Financial gain, notoriety, extortion",
    ttps: [
      "Social-engineering of helpdesk staff (impersonation)",
      "MFA fatigue bombing + SIM-swap attacks",
      "Insider recruitment via Telegram/Discord",
      " credential reuse from public breach corpora",
      "Session-token theft via malicious browser extensions",
      "Mass-assignment abuse on identity APIs",
    ],
    preferredVulns: [
      "Helpdesk password-reset workflow bypass",
      "MFA push fatigue (no number-matching)",
      "Excessive OAuth / API token scopes",
      "Missing session binding (IP / device)",
      "Excessive administrative privilege grants",
    ],
    knownFor: "NVIDIA, Samsung, Microsoft, Okta, T-Mobile, Uber, Rockstar Games breaches (2022), GTA VI leak — caused $10M+ losses each",
    sophistication: "medium",
    color: "amber",
    description: "Teen-led extortion group. Their tradecraft isn't advanced — they social-engineer the helpdesk. But they've owned Microsoft, NVIDIA, Uber, and Rockstar. The human is the weakest link.",
  },
  {
    id: "scattered-spider",
    name: "Scattered Spider",
    alias: "Octo Tempest, UNC3944, 0ktapus",
    origin: "US / UK / International (loose collective)",
    flag: "🇺🇸",
    activeSince: "2022",
    motivation: "Extortion, data theft, ransomware-as-a-service partnerships",
    ttps: [
      "Targeted SMS phishing (0ktapus campaign)",
      "SIM-swap attacks against MFA-enrolled accounts",
      "Helpdesk social engineering + vishing",
      " credential harvesting via AiTM phishing kits (Evilginx)",
      "Living-off-the-land via Azure AD, vCenter, ESXi",
      "ALPHV/BlackCat ransomware deployment",
    ],
    preferredVulns: [
      "AiTM-vulnerable phishing-resistant MFA gaps",
      "Helpdesk workflow bypass (no callback verification)",
      "Excessive privileged role assignments",
      "Missing conditional access policies",
      "MFA push fatigue (no number-matching)",
    ],
    knownFor: "Twilio, Cloudflare, Mailchimp, Reddit, Caesars ($15M ransom), MGM Resorts ($100M+ loss, 2023) — 130+ orgs in the 0ktapus campaign alone",
    sophistication: "high",
    color: "rose",
    description: "The most successful social-engineering APT of the 2020s. They don't break your code — they break your helpdesk. Caesars, MGM, Twilio, Cloudflare: all paid or lost money to them.",
  },
  {
    id: "mustang-panda",
    name: "Mustang Panda",
    alias: "Budworm, Earth Preta, Bronze President",
    origin: "China (state-sponsored)",
    flag: "🇨🇳",
    activeSince: "2014",
    motivation: "Espionage — diplomatic, government, NGO targets",
    ttps: [
      "Spear-phishing with weaponized Office documents",
      "USB-based worm propagation via plugged devices",
      "PlugX + Korplug custom RATs",
      "Living-off-the-land via CMSTP, Control Panel items",
      "Credential theft via LSASS dumping",
      "Side-loading via legitimate signed binaries",
    ],
    preferredVulns: [
      "Macro-enabled documents (no Mark-of-the-Web)",
      "DLL search-order hijacking",
      "Permissive USB auto-run policies",
      "Insufficient endpoint detection (EDR gaps)",
      "Outdated signed-binary side-loading surfaces",
    ],
    knownFor: "Targeted EU + ASEAN governments (2020-2023), Vatican compromise, Myanmar government breach, Tibetan/Uyghur diaspora surveillance",
    sophistication: "high",
    color: "violet",
    description: "Patient Chinese APT specializing in NGO + government compromises. USB-based worm spread + PlugX RAT — quietly persistent across air-gapped networks.",
  },
];

export function getPersonaById(id: string): AptPersona | undefined {
  return APT_PERSONAS.find((p) => p.id === id);
}

// Maps persona.color to a tailwind neon-* CSS class + matching hex for inline styles.
export const PERSONA_COLOR_MAP: Record<
  AptPersona["color"],
  { neonClass: string; borderClass: string; hex: string }
> = {
  emerald: { neonClass: "neon-emerald", borderClass: "neon-border", hex: "#10b981" },
  cyan: { neonClass: "neon-cyan", borderClass: "neon-border-cyan", hex: "#06b6d4" },
  amber: { neonClass: "neon-amber", borderClass: "neon-border-amber", hex: "#f59e0b" },
  rose: { neonClass: "neon-rose", borderClass: "neon-border-rose", hex: "#f43f5e" },
  red: { neonClass: "neon-red", borderClass: "neon-border-red", hex: "#ef4444" },
  violet: { neonClass: "neon-violet", borderClass: "neon-border-violet", hex: "#8b5cf6" },
};

// Sophistication → badge color (must stay within the no-indigo/blue palette).
export const SOPHISTICATION_COLOR: Record<Sophistication, string> = {
  low: "#f59e0b",     // amber
  medium: "#06b6d4",  // cyan
  high: "#f43f5e",    // rose
  elite: "#ef4444",   // red
};

export const SOPHISTICATION_LABEL: Record<Sophistication, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  elite: "ELITE",
};
