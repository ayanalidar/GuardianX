"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal, Menu, X, ChevronDown, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { GuardianXLogo } from "./guardianx-logo";
import { ThemeToggle } from "./theme-toggle";

// ── Nav structure with dropdowns ──────────────────────────────────────────
interface NavSubItem {
  href: string;
  label: string;
  desc?: string;
}
interface NavItem {
  href: string;
  label: string;
  children?: NavSubItem[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Platform" },
  {
    href: "/solutions",
    label: "Solutions",
    children: [
      { href: "/solutions#use-case", label: "By Use Case", desc: "Cloud Posture · SOC Acceleration · Exposure Mgmt" },
      { href: "/solutions#compliance", label: "By Compliance", desc: "ISO 27001 · SOC 2 · NIST · PCI-DSS" },
      { href: "/solutions#role", label: "By Role", desc: "CISOs · SecOps · Cloud Architects" },
    ],
  },
  { href: "/architecture", label: "Architecture" },
  {
    href: "/resources",
    label: "Resources",
    children: [
      { href: "/resources#whitepapers", label: "Whitepapers & Threat Reports", desc: "Technical deep-dives + DPDPA guide" },
      { href: "/resources#case-studies", label: "Case Studies & Benchmarks", desc: "Real ROI data from 500+ engagements" },
      { href: "/resources#docs", label: "Documentation & API Docs", desc: "80+ endpoints + integration guides" },
    ],
  },
  { href: "/company", label: "Company" },
];

export function SiteHeader({ onEnter }: { onEnter?: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close dropdown when route changes (back/forward navigation)
  useEffect(() => {
    // Using a microtask to avoid setState-during-effect lint warning
    const id = requestAnimationFrame(() => {
      setOpenDropdown(null);
      setMobileOpen(false);
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header
      role="banner"
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "border-b border-emerald-500/20 bg-zinc-950/90 backdrop-blur-xl" : "bg-zinc-950/40 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-md" aria-label="GuardianX home">
          <GuardianXLogo size={48} />
          <span className="text-lg font-bold tracking-tight text-zinc-50">
            Guardian<span className="text-emerald-400 neon-emerald">X</span>
          </span>
          <Badge className="ml-1 hidden border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300 sm:inline-block" aria-hidden="true">
            SOC
          </Badge>
        </a>

        {/* Desktop Nav with dropdowns */}
        <nav aria-label="Main navigation" className="hidden items-center gap-1 text-sm text-zinc-400 lg:flex">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.href + item.label}
              className="relative"
              onMouseEnter={() => item.children && setOpenDropdown(item.href)}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <a
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`flex items-center gap-1 rounded-md px-3 py-2 transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  isActive(item.href) ? "text-emerald-400" : ""
                }`}
              >
                {item.label}
                {item.children && <ChevronDown className="size-3 opacity-60" aria-hidden="true" />}
              </a>

              {/* Dropdown */}
              {item.children && openDropdown === item.href && (
                <div className="absolute left-0 top-full pt-1">
                  <div className="w-72 overflow-hidden rounded-lg border border-emerald-500/20 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur-xl">
                    {item.children.map((child) => (
                      <a
                        key={child.href + child.label}
                        href={child.href}
                        className="block rounded-md p-3 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                      >
                        <div className="text-sm font-medium text-zinc-100">{child.label}</div>
                        {child.desc && (
                          <div className="mt-0.5 text-[11px] text-zinc-400">{child.desc}</div>
                        )}
                      </a>
                    ))}
                    <div className="mt-1 border-t border-zinc-800/60 px-3 pt-2 pb-1">
                      <a
                        href={item.href}
                        className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 rounded"
                      >
                        View all →
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <a
            href="/contact"
            className="hidden rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/20 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:inline-flex"
          >
            <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
            Request Demo
          </a>
          {onEnter ? (
            <Button
              onClick={onEnter}
              className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <Terminal className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Enter Lab</span>
            </Button>
          ) : (
            <a href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-md">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                <Terminal className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Enter Lab</span>
              </Button>
            </a>
          )}
          {/* Theme toggle (dark/light) — marketing pages only.
              Dashboard console uses hardcoded dark surfaces so it stays
              dark regardless of the html class. */}
          <ThemeToggle />
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-zinc-400 hover:text-emerald-400 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-md p-1"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav id="mobile-nav" aria-label="Mobile navigation" className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1 px-4 py-3">
            {NAV_ITEMS.map((item) => (
              <div key={item.href + item.label}>
                <a
                  href={item.href}
                  onClick={() => item.children && setOpenDropdown(openDropdown === item.href ? null : item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                    isActive(item.href) ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-300"
                  }`}
                >
                  {item.label}
                  {item.children && <ChevronDown className={`size-3.5 transition-transform ${openDropdown === item.href ? "rotate-180" : ""}`} aria-hidden="true" />}
                </a>
                {/* Mobile sub-items */}
                {item.children && openDropdown === item.href && (
                  <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-zinc-800 pl-3">
                    {item.children.map((child) => (
                      <a
                        key={child.href + child.label}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-lg px-3 py-2 text-[13px] text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                      >
                        {child.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Mobile Request Demo */}
            <a
              href="/contact"
              onClick={() => setMobileOpen(false)}
              className="mt-2 flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <Sparkles className="mr-1.5 size-4" aria-hidden="true" />
              Request Demo
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
