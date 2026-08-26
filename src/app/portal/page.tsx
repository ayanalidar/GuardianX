import { ClientPortal } from "@/components/sentinel/client-portal";

// /portal, public client-facing route.
// Renders the ClientPortal component (login + dashboard). Clients access
// this URL directly with their email + portal access code; the component
// handles auth via /api/client-portal-auth and then loads dashboard data
// from /api/client-portal.
export const dynamic = "force-dynamic";

export default function PortalPage() {
  return <ClientPortal />;
}
