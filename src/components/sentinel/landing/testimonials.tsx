"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Quote, ChevronLeft, ChevronRight, Star } from "lucide-react";

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  text: string; // literal text color class
  border: string; // literal border color class
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "GuardianX found 3 critical vulnerabilities our manual pentest missed. The AI-generated patches saved us 2 weeks of developer time.",
    author: "CISO",
    role: "Head of Security",
    company: "FinTech Startup, Bangalore",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  {
    quote:
      "We replaced our entire VAPT vendor with GuardianX. Same quality report, 10% of the cost, delivered in 90 seconds instead of 2 weeks.",
    author: "VP Engineering",
    role: "Head of Security",
    company: "Healthcare Platform, Mumbai",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
  },
  {
    quote:
      "The R&D Lab is incredible. It studies open-source tools and improves its own modules. No other security platform does this.",
    author: "CTO",
    role: "Chief Technology Officer",
    company: "SaaS Company, Delhi",
    text: "text-violet-400",
    border: "border-violet-500/30",
  },
  {
    quote:
      "Patch attestation via SHA-256 ledger meant our auditors signed off in days, not weeks. Compliance went from burden to feature.",
    author: "Director of Compliance",
    role: "GRC Lead",
    company: "Insurance Provider, Pune",
    text: "text-teal-400",
    border: "border-teal-500/30",
  },
  {
    quote:
      "The adversarial arena caught a bypass our senior engineers missed. Watching the AI red-team its own patch is genuinely impressive.",
    author: "Principal Security Engineer",
    role: "Application Security",
    company: "Enterprise SaaS, Hyderabad",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
];

const TRUSTED_BY = [
  "STARK INDUSTRIES",
  "WAYNE CORP",
  "GLOBEX",
  "INITECH",
  "HOOLI",
  "PIED PIPER",
  "UMBRELLA",
  "CYBERDYNE",
];

export function Testimonials() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const next = () => setIdx((i) => (i + 1) % TESTIMONIALS.length);
  const prev = () => setIdx((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  const t = TESTIMONIALS[idx];

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      {/* Trusted by */}
      <div className="mb-12">
        <div className="mb-4 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {"// Trusted by security teams at"}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {TRUSTED_BY.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-center rounded-md border border-zinc-800/80 bg-zinc-900/40 px-2 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              {name}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Rotating quote carousel */}
      <div className="relative mx-auto max-w-3xl">
        <div className={`holo-card-sharp hud-corners relative overflow-hidden p-8 sm:p-10 border ${t.border}`}>
          <Quote className={`mx-auto mb-4 size-8 ${t.text} opacity-60`} />
          <div className="flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`size-3 fill-current ${t.text}`} />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={idx}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.4 }}
              className="mt-4 text-center text-base leading-relaxed text-zinc-200 sm:text-lg"
            >
              "{t.quote}"
            </motion.blockquote>
          </AnimatePresence>
          <div className="mt-5 text-center">
            <div className={`text-sm font-bold ${t.text}`}>{t.author}</div>
            <div className="text-[11px] text-zinc-500">
              {t.role} · {t.company}
            </div>
          </div>

          {/* Controls */}
          <button
            onClick={prev}
            aria-label="Previous testimonial"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={next}
            aria-label="Next testimonial"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Dots */}
        <div className="mt-4 flex justify-center gap-2">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to testimonial ${i + 1}`}
              className={`size-2 rounded-full transition-all ${
                i === idx ? `w-6 bg-emerald-400` : "bg-zinc-700 hover:bg-zinc-500"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
