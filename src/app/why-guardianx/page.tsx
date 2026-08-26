import { redirect } from "next/navigation";

// /why-guardianx → /company (renamed)
// Keep this redirect for backward compatibility with existing links/bookmarks.
export default function WhyGuardianXRedirect() {
  redirect("/company");
}
