// Nmap wrapper — runs nmap with the appropriate flags based on scanType and
// parses the XML output (`-oX -`) into structured JSON.
//
// SECURITY: target/ports are validated before being passed to the args array.
// Bun.spawn([tool, ...args]) never invokes a shell, so there is no command
// injection vector, but validation catches malformed requests early.

import {
  isValidPortSpec,
  isValidTarget,
  runWithTimeout,
  type NmapInput,
  type NmapPort,
  type NmapResult,
  type NmapScript,
  type NmapScanType,
} from "./types.js";

const TIMEOUT_MS = 120_000;

const SCAN_FLAGS: Record<NmapScanType, string[]> = {
  quick: ["-T4", "-F"],
  full: ["-p-"],
  service: ["-sV", "-sC"],
  vuln: ["--script", "vuln"],
};

// ── XML parsing ─────────────────────────────────────────────────────────────
// We don't ship a dependency on a full XML parser, so we implement a small
// regex/scan parser that handles the subset nmap emits. nmap's XML is
// well-formed and stable across versions, so this is reliable in practice.

interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

function parseXml(xml: string): XmlElement | null {
  // Strip XML declaration + DOCTYPE
  const cleaned = xml.replace(/<\?xml[^>]*\?>/g, "").replace(/<!DOCTYPE[^>]*>/g, "");
  let idx = 0;
  const s = cleaned;

  function skipWs() {
    while (idx < s.length && /\s/.test(s[idx]!)) idx++;
  }

  function parseElement(): XmlElement | null {
    skipWs();
    if (s[idx] !== "<") return null;
    idx++; // skip <
    // Closing tag or comment?
    if (s[idx] === "/" || s[idx] === "?" || s[idx] === "!") {
      // skip to >
      while (idx < s.length && s[idx] !== ">") idx++;
      if (s[idx] === ">") idx++;
      return null;
    }
    // Read tag name
    let name = "";
    while (idx < s.length && /[A-Za-z0-9_\-:]/.test(s[idx]!)) {
      name += s[idx];
      idx++;
    }
    if (!name) return null;
    // Read attrs
    const attrs: Record<string, string> = {};
    while (idx < s.length && s[idx] !== ">" && s[idx] !== "/") {
      skipWs();
      // attr="value"
      const m = /^([A-Za-z0-9_\-:]+)\s*=\s*"([^"]*)"/.exec(s.slice(idx));
      if (m) {
        attrs[m[1]!] = m[2]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&apos;/g, "'");
        idx += m[0].length;
      } else {
        idx++;
      }
    }
    if (s[idx] === "/") {
      // self-closing
      idx++;
      if (s[idx] === ">") idx++;
      return { name, attrs, children: [], text: "" };
    }
    if (s[idx] === ">") idx++;
    // Read children + text until matching close
    const children: XmlElement[] = [];
    let text = "";
    while (idx < s.length) {
      if (s[idx] === "<" && s[idx + 1] === "/") {
        // close tag
        idx += 2;
        while (idx < s.length && s[idx] !== ">") idx++;
        if (s[idx] === ">") idx++;
        break;
      }
      if (s[idx] === "<") {
        const child = parseElement();
        if (child) children.push(child);
      } else {
        text += s[idx];
        idx++;
      }
    }
    return { name, attrs, children, text };
  }

  return parseElement();
}

function findChildren(el: XmlElement | null, name: string): XmlElement[] {
  if (!el) return [];
  return el.children.filter((c) => c.name === name);
}

function findChild(el: XmlElement | null, name: string): XmlElement | null {
  if (!el) return null;
  return el.children.find((c) => c.name === name) ?? null;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function validateNmapInput(input: NmapInput): void {
  const target = (input.target ?? "").trim();
  if (!isValidTarget(target)) {
    throw new Error(`Invalid target: ${target}`);
  }
  if (!isValidPortSpec(input.ports)) {
    throw new Error(`Invalid ports spec: ${input.ports}`);
  }
  const scanType: NmapScanType = input.scanType ?? "quick";
  if (!SCAN_FLAGS[scanType]) {
    throw new Error(`Invalid scanType: ${scanType}`);
  }
}

export async function runNmap(input: NmapInput): Promise<NmapResult> {
  validateNmapInput(input);
  const target = (input.target ?? "").trim();
  const scanType: NmapScanType = input.scanType ?? "quick";

  const args: string[] = [
    "nmap",
    ...SCAN_FLAGS[scanType],
    "-Pn", // skip host discovery (caller usually provides a known host)
    "-n", // no DNS reverse-lookup (faster, less noisy)
    "-oX",
    "-", // XML to stdout
  ];
  if (input.ports) {
    args.push("-p", input.ports);
  }
  args.push(target);

  const { exitCode, stdout, stderr, timedOut, durationMs } = await runWithTimeout({
    args,
    timeoutMs: TIMEOUT_MS,
  });

  if (timedOut) {
    return {
      host: target,
      status: "timeout",
      reason: "scan exceeded timeout",
      addresses: [],
      hostnames: [],
      ports: parsePorts(stdout),
      scripts: parseHostScripts(stdout),
      raw: stdout.slice(-4000),
      timedOut: true,
      durationMs,
    };
  }

  if (exitCode !== 0 && !stdout.trim()) {
    throw new Error(`nmap exited ${exitCode}: ${stderr || "(no stderr)"}`);
  }

  const ports = parsePorts(stdout);
  const hostScripts = parseHostScripts(stdout);
  const hostInfo = parseHostInfo(stdout);

  return {
    host: target,
    status: hostInfo.status ?? "up",
    reason: hostInfo.reason,
    addresses: hostInfo.addresses,
    hostnames: hostInfo.hostnames,
    ports,
    scripts: hostScripts,
    raw: undefined,
    timedOut: false,
    durationMs,
  };
}

interface HostInfo {
  status?: string;
  reason?: string;
  addresses: { type: string; addr: string }[];
  hostnames: string[];
}

function parseHostInfo(xml: string): HostInfo {
  const root = parseXml(xml);
  const host = findChild(root, "host") ?? findChild(root, "nmaprun");
  const hostEl = root?.name === "nmaprun" ? findChild(root, "host") : root;

  const addresses: { type: string; addr: string }[] = [];
  const hostnames: string[] = [];
  let status: string | undefined;
  let reason: string | undefined;

  if (hostEl) {
    const statusEl = findChild(hostEl, "status");
    if (statusEl) {
      status = statusEl.attrs.state;
      reason = statusEl.attrs.reason;
    }
    for (const addr of findChildren(hostEl, "address")) {
      addresses.push({ type: addr.attrs.addrtype ?? addr.attrs.type ?? "ipv4", addr: addr.attrs.addr ?? "" });
    }
    const hostnamesEl = findChild(hostEl, "hostnames");
    for (const hn of findChildren(hostnamesEl, "hostname")) {
      if (hn.attrs.name) hostnames.push(hn.attrs.name);
    }
  }

  return { status, reason, addresses, hostnames };
}

function parsePorts(xml: string): NmapPort[] {
  const root = parseXml(xml);
  if (!root) return [];
  const host = root.name === "nmaprun" ? findChild(root, "host") : root;
  if (!host) return [];
  const portsEl = findChild(host, "ports");
  if (!portsEl) return [];
  const out: NmapPort[] = [];
  for (const portEl of findChildren(portsEl, "port")) {
    const port = parseInt(portEl.attrs.portid ?? "0", 10);
    const protocol = portEl.attrs.protocol ?? "tcp";
    const stateEl = findChild(portEl, "state");
    const state = stateEl?.attrs.state ?? "unknown";
    const serviceEl = findChild(portEl, "service");
    const service = serviceEl?.attrs.name ?? "unknown";
    const version = serviceEl?.attrs.version;
    const product = serviceEl?.attrs.product;
    const extraInfo = serviceEl?.attrs.extrainfo;
    const scripts: NmapScript[] = [];
    for (const scriptEl of findChildren(portEl, "script")) {
      scripts.push({
        id: scriptEl.attrs.id ?? "",
        output: scriptEl.attrs.output ?? "",
        port,
        protocol,
      });
    }
    out.push({
      port,
      protocol,
      state,
      service,
      version,
      product,
      extraInfo,
      scripts: scripts.length ? scripts : undefined,
    });
  }
  return out;
}

function parseHostScripts(xml: string): NmapScript[] {
  const root = parseXml(xml);
  if (!root) return [];
  const host = root.name === "nmaprun" ? findChild(root, "host") : root;
  if (!host) return [];
  const hostscriptEl = findChild(host, "hostscript");
  if (!hostscriptEl) return [];
  const out: NmapScript[] = [];
  for (const scriptEl of findChildren(hostscriptEl, "script")) {
    out.push({
      id: scriptEl.attrs.id ?? "",
      output: scriptEl.attrs.output ?? "",
    });
  }
  return out;
}

// ── Mock mode (dev only) ────────────────────────────────────────────────────

export function mockNmap(input: NmapInput): NmapResult {
  return {
    host: input.target,
    status: "up",
    reason: "mock-response",
    addresses: [{ type: "ipv4", addr: "127.0.0.1" }],
    hostnames: [input.target],
    ports: [
      {
        port: 80,
        protocol: "tcp",
        state: "open",
        service: "http",
        version: "mock 1.0",
      },
      {
        port: 443,
        protocol: "tcp",
        state: "open",
        service: "https",
        version: "mock 1.0",
      },
    ],
    scripts: [],
    timedOut: false,
    durationMs: 0,
  };
}
