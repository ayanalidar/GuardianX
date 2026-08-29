/**
 * Agent X barrel export
 * ----------------------
 * Surface the two public components for the central coordinator:
 *   - <AgentX />                    — the always-on conversational panel
 *   - <AgentXActivationButton />    — the dashboard header toggle
 *
 * Internals (types, voice persona helpers, briefing stat cell) stay
 * co-located inside their respective files.
 */

export { AgentX } from "./agent-x";
export type { AgentXProps, AgentXUser } from "./agent-x";

export { AgentXActivationButton } from "./activation-button";
export type { AgentXActivationButtonProps } from "./activation-button";

export { AgentX as default } from "./agent-x";
