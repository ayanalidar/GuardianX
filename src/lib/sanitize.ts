// Input sanitization utilities.

export function sanitizeText(input: string, maxLength: number = 1000): string {
  if (typeof input !== "string") return "";
  let s = input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s.trim();
}

export function sanitizeEmail(email: string): string {
  if (typeof email !== "string") return "";
  const s = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

export function sanitizeHtml(input: string): string {
  if (typeof input !== "string") return "";
  let s = input;
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<\/?(iframe|object|embed|form|meta|link|base|svg|math)[^>]*>/gi, "");
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  s = s.replace(/javascript:/gi, "");
  s = s.replace(/vbscript:/gi, "");
  return s;
}
