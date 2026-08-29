"use client";

// VR Threat Walkthrough (WebXR)
// ───────────────────────────────────────────────────────────────────────────
// A full-screen 3D/WebXR view that turns your attack surface into a city you
// can literally walk through:
//   • Each client  = an emerald building (height ∝ codebase count)
//   • Each codebase = a cyan floor inside the building
//   • Each finding  = a glowing orb above the building, color-coded by
//                     severity (red/amber/yellow/sky). Orbs pulse + rotate.
//
// Desktop: WASD movement + mouse-look (PointerLockControls) + click orbs.
// VR (Quest / Vision Pro): raw WebXR via navigator.xr.requestSession + the
// three.js gl.xr manager (no @react-three/xr dependency needed).
//
// Data: GET /api/threat-constellation (existing — re-used, NOT modified).
// Dark theme · emerald/cyan accents · hud-corners · mobile-first.
// Mobile: 3D scene still renders (orbit-mode), but VR requires a headset.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PointerLockControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Eye,
  FileCode2,
  Gamepad2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Vibrate,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types (mirror the existing /api/threat-constellation response) ──────────
type NodeType = "client" | "codebase" | "finding" | "patch";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  severity?: string;
  status?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: "client-codebase" | "codebase-finding" | "finding-patch";
  dashed?: boolean;
}

interface ConstellationData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Severity → orb color mapping ────────────────────────────────────────────
function severityColor(sev?: string): string {
  switch (sev) {
    case "critical":
      return "#ef4444"; // red
    case "high":
      return "#f97316"; // amber (avoid pure orange-blue clash)
    case "medium":
      return "#eab308"; // yellow
    case "low":
      return "#0ea5e9"; // sky
    default:
      return "#a1a1aa"; // zinc
  }
}

// ── Fetcher (reuses existing threat-constellation endpoint) ─────────────────
async function fetchConstellation(signal: AbortSignal): Promise<ConstellationData> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/threat-constellation", {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as ConstellationData & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data?.error ?? `Constellation fetch failed (${res.status})`);
  }
  return { nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

// ── Derived data: clients / codebases / findings / patches ──────────────────
interface Building {
  clientNode: GraphNode;
  position: [number, number, number];
  height: number;
  floors: GraphNode[]; // codebases under this client
  orbs: GraphNode[]; // findings associated with this client
}

interface DerivedScene {
  buildings: Building[];
  orphanFindings: GraphNode[]; // findings not attached to a client
  totalNodes: number;
}

// Convert flat nodes/edges into "city" layout: arrange client buildings in a
// grid, attach codebases (floors) + findings (orbs) by walking edges.
function deriveScene(data: ConstellationData): DerivedScene {
  const clients = data.nodes.filter((n) => n.type === "client");
  const codebases = data.nodes.filter((n) => n.type === "codebase");
  const findings = data.nodes.filter((n) => n.type === "finding");
  const patches = data.nodes.filter((n) => n.type === "patch");

  // Edge lookups
  const codebaseToClient = new Map<string, string>();
  const codebaseToFindings = new Map<string, Set<string>>();
  const findingToCodebase = new Map<string, string>();

  for (const e of data.edges) {
    if (e.type === "client-codebase") {
      codebaseToClient.set(e.to, e.from);
    } else if (e.type === "codebase-finding") {
      findingToCodebase.set(e.to, e.from);
      let s = codebaseToFindings.get(e.from);
      if (!s) {
        s = new Set();
        codebaseToFindings.set(e.from, s);
      }
      s.add(e.to);
    }
  }

  // Client → codebases + findings
  const clientCodebases = new Map<string, GraphNode[]>();
  const clientFindings = new Map<string, GraphNode[]>();
  const usedFindings = new Set<string>();

  for (const cb of codebases) {
    const clientId = codebaseToClient.get(cb.id);
    if (!clientId) continue;
    let arr = clientCodebases.get(clientId);
    if (!arr) {
      arr = [];
      clientCodebases.set(clientId, arr);
    }
    arr.push(cb);

    // Pull in findings attached to this codebase
    const fids = codebaseToFindings.get(cb.id);
    if (fids) {
      for (const fid of fids) {
        usedFindings.add(fid);
        const f = findings.find((x) => x.id === fid);
        if (!f) continue;
        let arr2 = clientFindings.get(clientId);
        if (!arr2) {
          arr2 = [];
          clientFindings.set(clientId, arr2);
        }
        arr2.push(f);
      }
    }
  }

  // Arrange client buildings in a grid (sqrt layout).
  const cols = Math.max(1, Math.ceil(Math.sqrt(clients.length)));
  const spacing = 8;
  const buildings: Building[] = clients.map((c, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * spacing;
    const z = (row - (Math.ceil(clients.length / cols) - 1) / 2) * spacing;
    const floors = clientCodebases.get(c.id) ?? [];
    const orbs = clientFindings.get(c.id) ?? [];
    // Height: 1 unit per codebase floor, min 2, capped at 10
    const height = Math.max(2, Math.min(10, 1.5 + floors.length * 1.4));
    return {
      clientNode: c,
      position: [x, 0, z] as [number, number, number],
      height,
      floors,
      orbs,
    };
  });

  // Findings not attached to any client — float above origin as orphans.
  const orphanFindings = findings.filter((f) => !usedFindings.has(f.id));

  // Patches are not visualized as 3D objects (kept for future expansion).
  void patches;

  return {
    buildings,
    orphanFindings,
    totalNodes: data.nodes.length,
  };
}

// ── WebXR session hook (raw three.js gl.xr) ─────────────────────────────────
type VRState = "unsupported" | "checking" | "available" | "in-session";

function useWebXRSupport(): VRState {
  const [state, setState] = useState<VRState>("checking");
  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr;
    // Always defer setState to a microtask so we never trigger a cascading
    // render synchronously inside the effect body.
    const supported: Promise<boolean> = xr?.isSessionSupported
      ? xr.isSessionSupported("immersive-vr")
      : Promise.resolve(false);
    supported
      .then((ok) => {
        if (!cancelled) setState(ok ? "available" : "unsupported");
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

// ── In-canvas WebXR controller ──────────────────────────────────────────────
// Mounts inside <Canvas>. When `enterVR` flips true, requests a session and
// hands it to three.js's gl.xr manager. Reports back via onSessionEnd.
function XRController({
  enterSignal,
  onSessionStart,
  onSessionEnd,
  onError,
}: {
  enterSignal: number;
  onSessionStart: () => void;
  onSessionEnd: () => void;
  onError: (msg: string) => void;
}) {
  const { gl } = useThree();
  const inSessionRef = useRef(false);

  useEffect(() => {
    if (enterSignal === 0) return;
    let cancelled = false;
    const xr = (navigator as Navigator & {
      xr?: {
        requestSession: (
          mode: string,
          opts?: { optionalFeatures?: string[] },
        ) => Promise<XRSession>;
      };
    }).xr;
    if (!xr?.requestSession) {
      onError("WebXR not available in this browser.");
      return;
    }
    if (inSessionRef.current) return;

    (async () => {
      try {
        const session = await xr.requestSession("immersive-vr", {
          optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
        });
        if (cancelled) {
          await session.end().catch(() => {});
          return;
        }
        // three.js WebXR manager wiring (no @react-three/xr needed).
        const glAny = gl as unknown as {
          xr: {
            setEnabled: (v: boolean) => void;
            setSession: (s: XRSession) => Promise<unknown>;
          };
        };
        glAny.xr.setEnabled(true);
        await glAny.xr.setSession(session);
        inSessionRef.current = true;
        onSessionStart();
        session.addEventListener("end", () => {
          inSessionRef.current = false;
          onSessionEnd();
        });
      } catch (e) {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : "Failed to enter VR.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enterSignal]);

  return null;
}

// ── WASD movement controller (desktop) ──────────────────────────────────────
function WASDController() {
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useFrame((state, delta) => {
    // Read camera from useFrame's state arg (not from useThree) so we don't
    // violate the react-hooks/immutability rule on hook return values.
    const camera = state.camera;
    const speed = 6 * Math.min(delta, 0.05);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const move = new THREE.Vector3();
    if (keys.current["w"] || keys.current["arrowup"]) move.add(forward);
    if (keys.current["s"] || keys.current["arrowdown"]) move.sub(forward);
    if (keys.current["d"] || keys.current["arrowright"]) move.add(right);
    if (keys.current["a"] || keys.current["arrowleft"]) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      // Apply horizontal movement, then snap to walking height (1.6m).
      camera.position.set(
        camera.position.x + move.x,
        1.6,
        camera.position.z + move.z,
      );
    }
  });

  return null;
}

// ── Building mesh (client + floors + orbs) ──────────────────────────────────
function BuildingMesh({
  building,
  selectedFindingId,
  onSelectFinding,
  hoveredId,
  setHoveredId,
}: {
  building: Building;
  selectedFindingId: string | null;
  onSelectFinding: (id: string | null) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}) {
  const [x, , z] = building.position;
  const h = building.height;
  const clientColor = "#10b981";

  return (
    <group position={[x, 0, z]}>
      {/* Building shell — semi-transparent emerald box */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[3, h, 3]} />
        <meshStandardMaterial
          color={clientColor}
          emissive={clientColor}
          emissiveIntensity={0.18}
          transparent
          opacity={0.18}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>
      {/* Wire outline */}
      <lineSegments position={[0, h / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(3, h, 3)]} />
        <lineBasicMaterial color={clientColor} transparent opacity={0.7} />
      </lineSegments>

      {/* Floors (codebases) */}
      {building.floors.map((cb, i) => {
        const floorY = 1 + i * 1.4;
        return (
          <mesh key={cb.id} position={[0, floorY, 0]}>
            <boxGeometry args={[2.7, 0.08, 2.7]} />
            <meshStandardMaterial
              color="#06b6d4"
              emissive="#06b6d4"
              emissiveIntensity={0.5}
              transparent
              opacity={0.55}
            />
          </mesh>
        );
      })}

      {/* Client label */}
      <Html position={[0, h + 0.5, 0]} center distanceFactor={14} occlude>
        <div className="pointer-events-none select-none whitespace-nowrap rounded border border-emerald-500/50 bg-zinc-950/85 px-2 py-0.5 font-mono text-[10px] text-emerald-300 shadow">
          {building.clientNode.label}
        </div>
      </Html>

      {/* Orbs (findings) — float above building in a ring */}
      {building.orbs.map((f, i) => {
        const angle = (i / Math.max(1, building.orbs.length)) * Math.PI * 2;
        const radius = 2.4;
        const ox = Math.cos(angle) * radius;
        const oz = Math.sin(angle) * radius;
        const oy = h + 1.2;
        return (
          <OrbMesh
            key={f.id}
            finding={f}
            position={[ox, oy, oz]}
            isSelected={selectedFindingId === f.id}
            isHovered={hoveredId === f.id}
            onSelect={onSelectFinding}
            onHover={setHoveredId}
          />
        );
      })}
    </group>
  );
}

// ── Orb (finding) mesh — pulses + rotates slowly ────────────────────────────
function OrbMesh({
  finding,
  position,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: {
  finding: GraphNode;
  position: [number, number, number];
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = severityColor(finding.severity);
  const baseSize = 0.35;

  useFrame((state) => {
    const m = meshRef.current;
    if (!m) return;
    // Slow rotation
    m.rotation.y += 0.008;
    m.rotation.x += 0.004;
    // Pulse — sine wave on scale
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 2 + position[0] + position[2]) * 0.12;
    const hoverBoost = isHovered || isSelected ? 1.4 : 1;
    const target = baseSize * pulse * hoverBoost;
    // Lerp scale for smoothness
    const cur = m.scale.x;
    m.scale.setScalar(cur + (target - cur) * 0.18);
    // Bob up/down
    m.position.y = position[1] + Math.sin(t * 1.3 + position[0]) * 0.2;
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(finding.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(finding.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 2.5 : isHovered ? 1.6 : 0.9}
          roughness={0.3}
          metalness={0.5}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Glow halo */}
      <mesh position={position}>
        <sphereGeometry args={[baseSize * 2.4, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} />
      </mesh>

      {/* Hover tooltip */}
      {isHovered && (
        <Html position={[position[0], position[1] + 0.7, position[2]]} center distanceFactor={10}>
          <div className="pointer-events-none whitespace-nowrap rounded border border-zinc-700 bg-zinc-950/90 px-2 py-1 font-mono text-[10px] text-zinc-200 shadow-lg">
            <span style={{ color }}>{finding.severity ?? "unknown"}</span>
            <span className="text-zinc-500"> · </span>
            {finding.label}
          </div>
        </Html>
      )}

      {/* Selected marker */}
      {isSelected && (
        <mesh position={position}>
          <ringGeometry args={[baseSize * 1.8, baseSize * 2.0, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ── Scene (lights + grid + buildings + orbs) ────────────────────────────────
interface SceneProps {
  scene: DerivedScene;
  selectedFindingId: string | null;
  onSelectFinding: (id: string | null) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  enterVRSignal: number;
  onVRStart: () => void;
  onVREnd: () => void;
  onVRError: (msg: string) => void;
  usePointerLock: boolean;
}

function Scene({
  scene,
  selectedFindingId,
  onSelectFinding,
  hoveredId,
  setHoveredId,
  enterVRSignal,
  onVRStart,
  onVREnd,
  onVRError,
  usePointerLock,
}: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const pointerLockRef = useRef<PointerLockControlsImpl | null>(null);

  return (
    <>
      <ambientLight intensity={0.4} />
      {/* Two point lights: emerald + red, low intensity */}
      <pointLight position={[12, 18, 12]} color="#10b981" intensity={0.55} distance={60} />
      <pointLight position={[-12, 14, -12]} color="#ef4444" intensity={0.45} distance={60} />
      {/* Cyan rim */}
      <pointLight position={[0, 8, 0]} color="#06b6d4" intensity={0.3} distance={40} />

      <Stars radius={80} depth={60} count={1800} factor={3} saturation={0} fade speed={0.6} />

      {/* Ground plane — dark with cyber-grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#0a0a0a"
          emissive="#0a0a0a"
          roughness={0.85}
          metalness={0.2}
        />
      </mesh>
      {/* Cyber grid overlay */}
      <gridHelper
        args={[120, 60, "#10b981", "#1a2a26"]}
        position={[0, 0.01, 0]}
      />

      {/* Buildings */}
      {scene.buildings.map((b) => (
        <BuildingMesh
          key={b.clientNode.id}
          building={b}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
        />
      ))}

      {/* Orphan findings — float above origin */}
      {scene.orphanFindings.map((f, i) => {
        const angle = (i / Math.max(1, scene.orphanFindings.length)) * Math.PI * 2;
        const radius = 3;
        return (
          <OrbMesh
            key={f.id}
            finding={f}
            position={[Math.cos(angle) * radius, 4 + (i % 3) * 0.6, Math.sin(angle) * radius]}
            isSelected={selectedFindingId === f.id}
            isHovered={hoveredId === f.id}
            onSelect={onSelectFinding}
            onHover={setHoveredId}
          />
        );
      })}

      {/* Desktop controls */}
      {usePointerLock ? (
        <>
          <PointerLockControls ref={pointerLockRef} />
          <WASDController />
        </>
      ) : (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan
          enableZoom
          minDistance={4}
          maxDistance={60}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 2, 0]}
        />
      )}

      {/* VR wiring */}
      <XRController
        enterSignal={enterVRSignal}
        onSessionStart={onVRStart}
        onSessionEnd={onVREnd}
        onError={onVRError}
      />

      {/* Click-away deselect */}
      <mesh
        visible={false}
        onClick={() => onSelectFinding(null)}
        position={[0, 0, 0]}
      >
        <boxGeometry args={[0.001, 0.001, 0.001]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}

// ── Finding detail panel ────────────────────────────────────────────────────
function FindingDetailPanel({
  finding,
  onClose,
}: {
  finding: GraphNode;
  onClose: () => void;
}) {
  const color = severityColor(finding.severity);
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className="pointer-events-auto absolute right-3 top-3 z-30 w-[260px] rounded-md border border-zinc-700 bg-zinc-950/95 p-4 backdrop-blur-md sm:right-4 sm:top-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex size-7 items-center justify-center rounded"
            style={{ background: `${color}22`, border: `1px solid ${color}55` }}
          >
            <ShieldAlert className="size-3.5" style={{ color }} />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color }}>
            finding
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Close finding detail"
        >
          <X className="size-4" />
        </button>
      </div>
      <h3 className="mb-3 break-words font-mono text-sm font-bold text-zinc-100">
        {finding.label}
      </h3>
      <div className="space-y-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">ID</span>
          <span className="font-mono text-zinc-400">{finding.id.slice(0, 12)}…</span>
        </div>
        {finding.severity && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Severity</span>
            <Badge
              variant="outline"
              className="font-mono text-[10px]"
              style={{ color, borderColor: "currentColor" }}
            >
              {finding.severity}
            </Badge>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Walk closer to investigate. Select another orb to compare severities.
      </p>
    </motion.div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
  const items: Array<{ sev: string; color: string }> = [
    { sev: "critical", color: severityColor("critical") },
    { sev: "high", color: severityColor("high") },
    { sev: "medium", color: severityColor("medium") },
    { sev: "low", color: severityColor("low") },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 px-2 py-2 sm:gap-5">
      <div className="flex items-center gap-1.5">
        <Box className="size-3.5 text-emerald-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Client</span>
      </div>
      <div className="flex items-center gap-1.5">
        <FileCode2 className="size-3.5 text-cyan-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Codebase</span>
      </div>
      {items.map((it) => (
        <div key={it.sev} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ background: it.color, boxShadow: `0 0 6px ${it.color}80` }}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            {it.sev}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function VRThreatWalkthrough() {
  const [data, setData] = useState<ConstellationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [enterVRSignal, setEnterVRSignal] = useState(0);
  const [inVR, setInVR] = useState(false);
  const [vrError, setVrError] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const vrState = useWebXRSupport();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    try {
      const d = await fetchConstellation(ac.signal);
      setData(d);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Failed to load scene.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scene = useMemo(() => (data ? deriveScene(data) : null), [data]);
  const selectedFinding = useMemo(
    () => data?.nodes.find((n) => n.id === selectedFindingId) ?? null,
    [data, selectedFindingId],
  );

  // ── VR button states ──────────────────────────────────────────────────
  let vrButton: React.ReactNode;
  if (isMobile) {
    vrButton = (
      <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] text-amber-300">
        <Smartphone className="size-3" />
        VR REQUIRES HEADSET
      </div>
    );
  } else if (vrState === "checking") {
    vrButton = (
      <div className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] text-zinc-400">
        <Loader2 className="size-3 animate-spin" />
        CHECKING VR…
      </div>
    );
  } else if (vrState === "unsupported") {
    vrButton = (
      <div className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] text-zinc-500">
        <Vibrate className="size-3" />
        VR UNAVAILABLE
      </div>
    );
  } else if (inVR) {
    vrButton = (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
        <Eye className="mr-1 size-3" />
        IN VR
      </Badge>
    );
  } else {
    vrButton = (
      <Button
        size="sm"
        onClick={() => {
          setVrError(null);
          setEnterVRSignal((n) => n + 1);
        }}
        className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[11px] text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
        variant="outline"
      >
        <Gamepad2 className="size-3.5" />
        ENTER VR
      </Button>
    );
  }

  return (
    <div className="holo-card-sharp hud-corners relative w-full overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
            <Gamepad2 className="size-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-emerald-400">
              VR Threat Walkthrough
            </h2>
            <p className="text-[11px] text-zinc-500">
              Walk through your attack surface in 3D · WebXR · Quest/Vision Pro ready
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Badge variant="outline" className="border-zinc-700 font-mono text-[10px] text-zinc-400">
              <Sparkles className="mr-1 size-3 text-emerald-400" />
              {scene?.totalNodes ?? 0} nodes · {scene?.buildings.length ?? 0} buildings
            </Badge>
          )}
          {vrButton}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="border-emerald-500/30 bg-zinc-900/60 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            RELOAD
          </Button>
        </div>
      </div>

      {/* Canvas + overlays */}
      <div className="relative h-[460px] w-full overflow-hidden rounded-md border border-zinc-800 bg-gradient-to-b from-zinc-950 via-zinc-900/50 to-zinc-950 sm:h-[560px]">
        {/* Subtle nebula overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 30%, rgba(16,185,129,0.10), transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(244,63,94,0.08), transparent 50%)",
          }}
        />

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <Loader2 className="size-7 animate-spin text-emerald-400" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">
              Constructing city…
            </span>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-zinc-500">
            <span className="font-mono text-sm text-rose-400">{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-rose-500/40 bg-rose-500/5 font-mono text-[11px] text-rose-300 hover:bg-rose-500/15"
            >
              RETRY
            </Button>
          </div>
        ) : !scene || scene.totalNodes === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Gamepad2 className="size-8 text-emerald-400/50" />
            <p className="font-mono text-xs uppercase tracking-widest text-zinc-400">
              Empty Cityscape
            </p>
            <p className="max-w-md text-[11px] text-zinc-600">
              Add clients + run scans — your threat city will materialize here.
            </p>
          </div>
        ) : scene ? (
          <>
            <Canvas
              camera={{ position: [0, 1.6, 14], fov: 70, near: 0.1, far: 200 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <Suspense fallback={null}>
                <Scene
                  scene={scene}
                  selectedFindingId={selectedFindingId}
                  onSelectFinding={setSelectedFindingId}
                  hoveredId={hoveredId}
                  setHoveredId={setHoveredId}
                  enterVRSignal={enterVRSignal}
                  onVRStart={() => {
                    setInVR(true);
                    setVrError(null);
                  }}
                  onVREnd={() => setInVR(false)}
                  onVRError={(msg) => setVrError(msg)}
                  usePointerLock={!isMobile && vrState !== "in-session"}
                />
              </Suspense>
            </Canvas>

            {/* Click-away */}
            {selectedFindingId && (
              <button
                aria-label="Deselect finding"
                className="absolute inset-0 z-10 cursor-default"
                onClick={() => setSelectedFindingId(null)}
                tabIndex={-1}
              />
            )}

            {/* Detail panel */}
            <AnimatePresence>
              {selectedFinding && (
                <FindingDetailPanel
                  finding={selectedFinding}
                  onClose={() => setSelectedFindingId(null)}
                />
              )}
            </AnimatePresence>

            {/* VR error toast */}
            <AnimatePresence>
              {vrError && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded border border-rose-500/40 bg-zinc-950/95 px-3 py-2 font-mono text-[11px] text-rose-300 shadow-lg"
                >
                  VR error: {vrError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls hint (desktop) */}
            {!isMobile && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded border border-zinc-800 bg-zinc-950/80 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
                <span className="text-emerald-400">WASD</span> move ·{" "}
                <span className="text-cyan-400">click</span> canvas to look ·{" "}
                <span className="text-cyan-400">click orb</span> to inspect
              </div>
            )}
            {/* Mobile hint */}
            {isMobile && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded border border-zinc-800 bg-zinc-950/80 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
                <span className="text-emerald-400">drag</span> rotate ·{" "}
                <span className="text-cyan-400">pinch</span> zoom ·{" "}
                <span className="text-cyan-400">tap orb</span> inspect
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Legend */}
      {scene && scene.totalNodes > 0 && <Legend />}
    </div>
  );
}

export default VRThreatWalkthrough;
