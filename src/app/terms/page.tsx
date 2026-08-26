"use client";

import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { FileText, Shield, Scale } from "lucide-react";

const AUP_RULES = [
  { allowed: true, text: "Use GuardianX to scan codebases and targets you own or have written authorization to test." },
  { allowed: true, text: "Use generated patches and findings in your internal security workflows." },
  { allowed: true, text: "Participate in the GuardianX bug bounty program in good faith." },
  { allowed: false, text: "Scanning third-party systems without explicit written authorization from their owner." },
  { allowed: false, text: "Using GuardianX to attack, exploit, or compromise systems you do not own." },
  { allowed: false, text: "Uploading malware, ransomware, or other malicious code with intent to deploy (vs. analyze)." },
  { allowed: false, text: "Attempting to access other users' data, credentials, or audit logs." },
  { allowed: false, text: "Reverse-engineering, decompiling, or circumventing the GuardianX application or its licensing." },
  { allowed: false, text: "Reselling, sublicensing, or white-labeling the GuardianX service without written agreement." },
  { allowed: false, text: "Running high-volume automated scans against GuardianX infrastructure itself (use the bug bounty program instead)." },
  { allowed: false, text: "Spam, phishing, or any illegal activity through the platform's email or webhook features." },
  { allowed: false, text: "Uploading personal data of third parties without their consent (e.g. customer PII belonging to your end users)." },
  { allowed: false, text: "Using GuardianX to train competing AI models on aggregated scan data without written consent." },
];

const SLA_TIERS = [
  { tier: "Free / Trial", uptime: "Best-effort", support: "Community only", response: "Best-effort" },
  { tier: "Pro", uptime: "99.5%", support: "Email, business hours IST", response: "≤ 24h (Critical); ≤ 72h (High)" },
  { tier: "Enterprise", uptime: "99.9% with SLA credits", support: "Dedicated CSM + Slack channel, 24×7", response: "≤ 1h (Critical); ≤ 4h (High)" },
];

const LIABILITY_CAPS = [
  { tier: "Free / Trial", cap: "₹0 (service provided as-is)" },
  { tier: "Pro", cap: "Aggregate liability capped at fees paid in the 6 months preceding the claim." },
  { tier: "Enterprise", cap: "Aggregate liability capped at fees paid in the 12 months preceding the claim, or ₹50,00,000 (₹50 lakh), whichever is higher." },
];

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-24 py-20 sm:px-6">
          {/* Header */}
          <div className="mb-10">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="size-6 text-emerald-400" />
              <h1 className="text-3xl font-bold text-zinc-50">Terms of Service</h1>
            </div>
            <p className="text-xs text-zinc-600">
              Last updated: {new Date().getFullYear()} · GuardianX Technologies Pvt. Ltd.
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              These Terms of Service ("Terms") govern your use of the GuardianX platform (the "Service")
              operated by GuardianX Technologies Pvt. Ltd. ("GuardianX", "we", "us"). By creating an account
              or using the Service, you agree to these Terms. If you do not agree, you may not use the Service.
            </p>
          </div>

          <div className="space-y-10 text-sm leading-relaxed text-zinc-400">
            {/* 1. Definitions */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">1. Definitions</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• <span className="text-zinc-200">"Customer"</span>, "you" — the entity or individual that has created a GuardianX account.</li>
                <li>• <span className="text-zinc-200">"Service"</span> — the GuardianX SaaS platform including the web app, API, and CLI.</li>
                <li>• <span className="text-zinc-200">"User Data"</span> — data you upload to or generate via the Service.</li>
                <li>• <span className="text-zinc-200">"MSA"</span> — the Master Subscription Agreement signed by Enterprise customers; in case of conflict, the MSA governs.</li>
                <li>• <span className="text-zinc-200">"DPA"</span> — the Data Processing Agreement (see <a href="https://guardianx.in/docs/DPDPA-COMPLIANCE" className="text-emerald-400 hover:underline">DPDPA-COMPLIANCE.md §8</a>).</li>
              </ul>
            </section>

            {/* 2. Eligibility & accounts */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">2. Eligibility & Accounts</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• You must be at least 18 years old and able to form a legally binding contract under Indian law.</li>
                <li>• You must provide accurate information at signup and keep it current.</li>
                <li>• You are responsible for keeping your password and 2FA secret confidential and for all activity under your account.</li>
                <li>• New accounts require admin approval before accessing the Service. GuardianX may refuse or terminate accounts at its discretion.</li>
                <li>• One account per person; sharing accounts is prohibited. Service accounts must be clearly labeled.</li>
              </ul>
            </section>

            {/* 3. Acceptable use */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-emerald-300">
                <Shield className="size-4" /> 3. Acceptable Use Policy
              </h2>
              <p className="mb-3">
                You may use the Service only for lawful security testing on systems you own or are
                explicitly authorized to test. The following activities are permitted and prohibited:
              </p>
              <div className="overflow-x-auto rounded-lg border border-emerald-500/15">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-emerald-500/10 text-emerald-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold w-24">Status</th>
                      <th className="px-3 py-2 font-semibold">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {AUP_RULES.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-zinc-900/40">
                        <td className="px-3 py-2 align-top">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              rule.allowed
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-red-500/15 text-red-300"
                            }`}
                          >
                            {rule.allowed ? "Allowed" : "Prohibited"}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">{rule.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Violations may result in immediate account suspension, data deletion, and referral to law
                enforcement under the Information Technology Act, 2000 and the Bharatiya Nyaya Sanhita, 2023.
              </p>
            </section>

            {/* 4. Service level expectations */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">4. Service Level Expectations</h2>
              <p className="mb-3">
                GuardianX offers three service tiers. Uptime is measured monthly excluding scheduled
                maintenance (announced ≥ 48h in advance) and force-majeure events.
              </p>
              <div className="overflow-x-auto rounded-lg border border-emerald-500/15">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-emerald-500/10 text-emerald-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Tier</th>
                      <th className="px-3 py-2 font-semibold">Uptime</th>
                      <th className="px-3 py-2 font-semibold">Support</th>
                      <th className="px-3 py-2 font-semibold">Response time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {SLA_TIERS.map((row) => (
                      <tr key={row.tier} className="hover:bg-zinc-900/40">
                        <td className="px-3 py-2 align-top font-medium text-zinc-200">{row.tier}</td>
                        <td className="px-3 py-2 align-top">{row.uptime}</td>
                        <td className="px-3 py-2 align-top">{row.support}</td>
                        <td className="px-3 py-2 align-top text-zinc-500">{row.response}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Enterprise customers with custom SLAs are governed by their MSA. SLA credits are issued as
                service extensions, not cash refunds, and must be claimed within 30 days of the incident.
              </p>
            </section>

            {/* 5. Data & privacy */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">5. Your Data & Privacy</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• You retain all right, title, and interest in your User Data.</li>
                <li>• GuardianX processes User Data as a Data Processor for B2B customers per the DPA (incorporated by reference).</li>
                <li>• We will not access your User Data except to provide the Service, prevent/ address security or technical issues, or comply with legal process.</li>
                <li>• See our <a href="/privacy" className="text-emerald-400 hover:underline">Privacy Policy</a> for what personal data we collect and your DPDPA rights.</li>
                <li>• You are responsible for ensuring you have all necessary rights and consents to upload User Data (including source code and credentials) to GuardianX.</li>
                <li>• Upon account termination, we delete User Data within 30 days except where retention is required by law (see Privacy Policy §5).</li>
              </ul>
            </section>

            {/* 6. Intellectual property */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-emerald-300">
                <Scale className="size-4" /> 6. Intellectual Property
              </h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• <span className="text-zinc-200">GuardianX IP.</span> The Service, including the GuardianX name, logo, software, documentation, and underlying AI models, is the exclusive property of GuardianX Technologies Pvt. Ltd. and is protected by Indian and international IP laws.</li>
                <li>• <span className="text-zinc-200">User Data.</span> You retain all IP rights in your User Data, including uploaded source code and generated findings/patches. Granting GuardianX a limited, non-exclusive, worldwide license to process User Data solely to deliver the Service.</li>
                <li>• <span className="text-zinc-200">Generated findings & patches.</span> Vulnerability findings and AI-generated patches derived from your User Data belong to you. GuardianX may use aggregated, de-identified statistics (e.g. "X% of codebases had SQL injection") to improve the Service, but never in a way that re-identifies you or your clients.</li>
                <li>• <span className="text-zinc-200">Open-source components.</span> The Service uses open-source components under their respective licenses. A list is available on request.</li>
                <li>• <span className="text-zinc-200">Feedback.</span> If you provide feedback or suggestions about the Service, GuardianX may use them without restriction or compensation.</li>
                <li>• <span className="text-zinc-200">Trademarks.</span> "GuardianX", the GuardianX logo, and related marks are trademarks of GuardianX Technologies Pvt. Ltd. You may not use them without written permission.</li>
              </ul>
            </section>

            {/* 7. Fees & payment */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">7. Fees & Payment</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• Fees are described on our <a href="/pricing" className="text-emerald-400 hover:underline">Pricing page</a> or in your MSA.</li>
                <li>• Paid plans are billed in advance, monthly or annually as you select.</li>
                <li>• We use Stripe/Razorpay — your card data never touches GuardianX servers.</li>
                <li>• All fees are exclusive of applicable taxes (GST, etc.) which are added at checkout.</li>
                <li>• Refunds: annual plans are refundable on a pro-rata basis for the unused portion within the first 30 days; monthly plans are non-refundable.</li>
                <li>• We may change fees with 30 days' notice; existing subscribers keep the current rate until renewal.</li>
              </ul>
            </section>

            {/* 8. Limitation of liability */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">8. Limitation of Liability</h2>
              <p className="mb-2">
                To the maximum extent permitted by law:
              </p>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• The Service is provided <span className="text-zinc-200">"as is"</span> and "as available" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, or non-infringement.</li>
                <li>• GuardianX does not warrant that the Service will find every vulnerability, that generated patches will be free of defects, or that the Service will be uninterrupted or error-free.</li>
                <li>• You are responsible for independently verifying all findings and patches before applying them.</li>
                <li>• In no event will GuardianX be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, lost data, or business interruption.</li>
                <li>• GuardianX's aggregate liability under these Terms is capped as follows:</li>
              </ul>
              <div className="mt-3 overflow-x-auto rounded-lg border border-emerald-500/15">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-emerald-500/10 text-emerald-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Tier</th>
                      <th className="px-3 py-2 font-semibold">Liability cap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {LIABILITY_CAPS.map((row) => (
                      <tr key={row.tier} className="hover:bg-zinc-900/40">
                        <td className="px-3 py-2 align-top font-medium text-zinc-200">{row.tier}</td>
                        <td className="px-3 py-2 align-top">{row.cap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                These caps do not apply to liability for: (a) death or personal injury caused by negligence;
                (b) fraud or fraudulent misrepresentation; (c) breach of confidentiality obligations; or
                (d) any liability that cannot be excluded under Indian law.
              </p>
            </section>

            {/* 9. Indemnification */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">9. Indemnification</h2>
              <p>
                You will indemnify, defend, and hold harmless GuardianX, its officers, directors, employees,
                and agents from any claims, damages, losses, liabilities, costs, and expenses (including
                reasonable attorneys' fees) arising out of or related to: (a) your User Data; (b) your
                violation of these Terms or the Acceptable Use Policy; (c) your violation of applicable law
                or third-party rights (including IP rights); or (d) your unauthorized scanning of third-party
                systems.
              </p>
            </section>

            {/* 10. Termination */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">10. Termination</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• <span className="text-zinc-200">By you.</span> You may terminate your account at any time via Settings → Account → Delete. No refunds for partial billing periods on monthly plans; pro-rata refund for annual plans within 30 days of renewal.</li>
                <li>• <span className="text-zinc-200">By GuardianX — for cause.</span> We may suspend or terminate your account immediately for: (a) breach of the Acceptable Use Policy; (b) non-payment after 15 days' notice; (c) violation of applicable law; (d) your insolvency or bankruptcy.</li>
                <li>• <span className="text-zinc-200">By GuardianX — for convenience.</span> We may discontinue the Service or a tier with 90 days' notice, with a pro-rata refund of any prepaid fees.</li>
                <li>• <span className="text-zinc-200">Effect of termination.</span> Your right to use the Service ceases. We will delete your User Data within 30 days except where retention is required by law. Sections that by their nature should survive (IP, liability, indemnification, governing law) will survive termination.</li>
                <li>• <span className="text-zinc-200">Account recovery.</span> If your admin is locked out and email recovery is unavailable, see our <a href="https://guardianx.in/docs/BREAK-GLASS-RECOVERY" className="text-emerald-400 hover:underline">Break-Glass Recovery runbook</a>.</li>
              </ul>
            </section>

            {/* 11. Disclaimers & dispute resolution */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">11. Disclaimers & Dispute Resolution</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• <span className="text-zinc-200">No security guarantee.</span> GuardianX is a security-testing tool, not a security guarantee. Use of the Service does not ensure that your systems are free from vulnerabilities.</li>
                <li>• <span className="text-zinc-200">Independent verification.</span> You are responsible for independently verifying all findings and patches before applying them. GuardianX is not liable for damages caused by applying an AI-generated patch.</li>
                <li>• <span className="text-zinc-200">Negotiation.</span> Any dispute will first be addressed by good-faith negotiation for 30 days.</li>
                <li>• <span className="text-zinc-200">Arbitration.</span> Unresolved disputes will be settled by binding arbitration administered by the Mumbai Centre for International Arbitration (MCIA), seated in Bengaluru. One arbitrator, English language, Indian law.</li>
                <li>• <span className="text-zinc-200">Injunctive relief.</span> Notwithstanding the above, GuardianX may seek injunctive relief in any court of competent jurisdiction for IP violations or breach of confidentiality.</li>
              </ul>
            </section>

            {/* 12. Governing law */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">12. Governing Law & Jurisdiction</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• These Terms are governed by the laws of the Republic of India, without regard to conflict-of-law principles.</li>
                <li>• Subject to the arbitration clause in §11, the courts at <span className="text-zinc-200">Bengaluru, Karnataka</span> have exclusive jurisdiction over any dispute.</li>
                <li>• The Information Technology Act, 2000; the Digital Personal Data Protection Act, 2023; the Bharatiya Nyaya Sanhita, 2023; and the Consumer Protection Act, 2019 apply to your use of the Service.</li>
                <li>• The United Nations Convention on Contracts for the International Sale of Goods (CISG) does not apply.</li>
              </ul>
            </section>

            {/* 13. Changes to terms */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">13. Changes to These Terms</h2>
              <p>
                We may update these Terms. Material changes (fees, liability, AUP, governing law) will be
                announced 30 days before taking effect via email + dashboard banner. Non-material changes
                (typographical, clarifications) take effect on publication. Continued use after the effective
                date constitutes acceptance. If you do not agree with material changes, you may terminate
                your account before the effective date for a pro-rata refund.
              </p>
            </section>

            {/* 14. General provisions */}
            <section>
              <h2 className="mb-3 text-lg font-bold text-emerald-300">14. General Provisions</h2>
              <ul className="mt-1 space-y-1 pl-4">
                <li>• <span className="text-zinc-200">Entire agreement.</span> These Terms + the Privacy Policy + any signed MSA/DPA constitute the entire agreement between you and GuardianX.</li>
                <li>• <span className="text-zinc-200">Severability.</span> If any provision is held unenforceable, the rest remain in effect.</li>
                <li>• <span className="text-zinc-200">No waiver.</span> Failure to enforce a provision is not a waiver of that provision.</li>
                <li>• <span className="text-zinc-200">Assignment.</span> You may not assign these Terms without GuardianX's written consent; GuardianX may assign freely in connection with a merger, acquisition, or asset sale.</li>
                <li>• <span className="text-zinc-200">Force majeure.</span> GuardianX is not liable for delays caused by acts of God, war, terrorism, pandemic, government action, or major infrastructure outage beyond our control.</li>
                <li>• <span className="text-zinc-200">Notices.</span> Legal notices to GuardianX: <a href="mailto:legal@guardianx.in" className="text-emerald-400 hover:underline">legal@guardianx.in</a> or by registered post to our registered office.</li>
                <li>• <span className="text-zinc-200">Export control.</span> You represent that you are not located in a country subject to Indian export sanctions and will not use the Service in violation of such sanctions.</li>
              </ul>
            </section>

            {/* 15. Contact */}
            <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
              <h2 className="mb-3 text-lg font-bold text-emerald-300">15. Contact</h2>
              <ul className="space-y-1 pl-4 text-sm">
                <li>• <span className="text-zinc-200">General:</span> <a href="mailto:hello@guardianx.in" className="text-emerald-400 hover:underline">hello@guardianx.in</a></li>
                <li>• <span className="text-zinc-200">Legal:</span> <a href="mailto:legal@guardianx.in" className="text-emerald-400 hover:underline">legal@guardianx.in</a></li>
                <li>• <span className="text-zinc-200">Privacy / DPDPA:</span> <a href="mailto:privacy@guardianx.in" className="text-emerald-400 hover:underline">privacy@guardianx.in</a></li>
                <li>• <span className="text-zinc-200">Security / bug bounty:</span> <a href="mailto:security@guardianx.in" className="text-emerald-400 hover:underline">security@guardianx.in</a> (PGP — see <a href="https://guardianx.in/.well-known/security.txt" className="text-emerald-400 hover:underline">security.txt</a>)</li>
                <li>• <span className="text-zinc-200">Registered office:</span> GuardianX Technologies Pvt. Ltd., Bengaluru, Karnataka, India.</li>
              </ul>
              <p className="mt-3 text-xs text-zinc-500">
                See also: <a href="/privacy" className="text-emerald-400 hover:underline">Privacy Policy</a> ·{" "}
                <a href="https://guardianx.in/docs/BUG-BOUNTY" className="text-emerald-400 hover:underline">Bug Bounty Program</a> ·{" "}
                <a href="https://guardianx.in/docs/DPDPA-COMPLIANCE" className="text-emerald-400 hover:underline">DPDPA Compliance</a>
              </p>
            </section>
          </div>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
