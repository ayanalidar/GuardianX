"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { GuardianXLogo } from "./guardianx-logo";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/why-guardianx", label: "Why GuardianX" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/whitepaper", label: "Whitepaper" },
];

export function SiteHeader({ onEnter }: { onEnter?: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header className={`fixed top-0 z-50 w-full transition-all duration-300 ${scrolled ? "border-b border-emerald-500/20 bg-zinc-950/90 backdrop-blur-xl" : "bg-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <GuardianXLogo size={48} />
          <span className="text-lg font-bold tracking-tight text-zinc-50">
            Guardian<span className="text-emerald-400 neon-emerald">X</span>
          </span>
          <Badge className="ml-1 hidden border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300 sm:inline-block">SOC</Badge>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`transition-colors hover:text-emerald-400 ${pathname === link.href ? "text-emerald-400" : ""}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onEnter ? (
            <Button onClick={onEnter} className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
              <Terminal className="size-4" />
              <span className="hidden sm:inline">Enter Lab</span>
            </Button>
          ) : (
            <a href="/">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                <Terminal className="size-4" />
                <span className="hidden sm:inline">Enter Lab</span>
              </Button>
            </a>
          )}
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-zinc-400 hover:text-emerald-400 md:hidden"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm transition-colors hover:bg-zinc-800/50 ${pathname === link.href ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-400"}`}
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
