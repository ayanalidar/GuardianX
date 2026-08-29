// Barrel export for the AI Visualizer module.
// Importing from "@/components/sentinel/ai-visualizer" gives you the
// SignalBusProvider, useSignalBus hook, CircuitBoard, NeuralLink, and
// ImmersiveView — everything you need to mount the visualizer anywhere.

export { SignalBusProvider, useSignalBus, type VisualizerState, type VisualizerEvent } from "./signal-bus";
export { CircuitBoard } from "./circuit-board";
export { NeuralLink } from "./neural-link";
export { ImmersiveView } from "./immersive-view";
