"use client";

// 3D Threat Constellation — a WebGL visualization (@react-three/fiber +
// @react-three/drei) that maps clients, codebases, findings, and patches
// into a 3D force-directed constellation graph.
//
// Nodes:
//   clients     → emerald spheres
//   codebases   → cyan cubes
//   findings    → red octahedrons
//   patches      → amber tetrahedrons
// Edges:
//   client→codebase    cyan
//   codebase→finding   red
//   finding→patch      amber (dashed if patch pending)
//
// Spring-force simulation runs in useFrame (repulsion + spring attraction).
// Slow auto-rotate, pauses on hover. Click a node to zoom + open detail
// panel. Cap at 100 nodes.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import type { Line2, OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Cpu, FileCode2, Loader2, Satellite, ShieldAlert, Sparkles, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────────────
type NodeType = "client" | "codebase" | "finding" | "patch";
type EdgeType = "client-codebase" | "codebase-finding" | "finding-patch";

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
  type: EdgeType;
  dashed?: boolean;
}

interface ConstellationData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Visual config ─────────────────────────────────────────────────────────
const NODE_COLOR: Record<NodeType, string> = {
  client: "#10b981", // emerald
  codebase: "#06b6d4", // cyan
  finding: "#f43f5e", // rose
  patch: "#f59e0b", // amber
};

const EDGE_COLOR: Record<EdgeType, string> = {
  "client-codebase": "#06b6d4", // cyan
  "codebase-finding": "#f43f5e", // rose
  "finding-patch": "#f59e0b", // amber
};

const NODE_SIZE: Record<NodeType, number> = {
  client: 0.42,
  codebase: 0.36,
  finding: 0.32,
  patch: 0.34,
};

// ── Fetcher ───────────────────────────────────────────────────────────────
async function fetchConstellation(signal: AbortSignal): Promise<ConstellationData> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/threat-constellation", {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as ConstellationData & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `Constellation fetch failed (${res.status})`);
  return { nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

// ── Spring simulation + node renderer ──────────────────────────────────────
interface SceneProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  autoRotateRef: React.MutableRefObject<boolean>;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
}

function Scene({ nodes, edges, selectedId, onSelect, hoveredId, setHoveredId, autoRotateRef, controlsRef }: SceneProps) {
  const nodeMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const lineRefs = useRef<(Line2 | null)[]>([]);
  const positionsRef = useRef<THREE.Vector3[]>([]);
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  const targetLookAt = useRef<THREE.Vector3 | null>(null);

  // Build id → index lookup
  const idToIndex = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [nodes]);

  // Initialize positions on a Fibonacci sphere (even distribution). Run in an
  // effect (not useMemo) because writing to refs during render is forbidden
  // by react-hooks/refs.
  useEffect(() => {
    const n = nodes.length;
    const r = Math.max(4, Math.min(9, 2 + n * 0.18));
    positionsRef.current = nodes.map((_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
    });
    nodeMeshRefs.current = nodes.map(() => null);
    lineRefs.current = edges.map(() => null);
    targetCamPos.current = null;
    targetLookAt.current = null;
  }, [nodes, edges]);

  // Per-frame: spring simulation + apply positions + update edges.
  useFrame((state, delta) => {
    const positions = positionsRef.current;
    if (positions.length === 0) return;
    const dt = Math.min(delta, 0.05); // clamp dt for stability
    const repulsion = 1.8;
    const springK = 1.2;
    const restLen = 3.0;
    const damping = 0.92;
    const maxRadius = 11;

    // Repulsion between all pairs
    for (let i = 0; i < positions.length; i++) {
      const a = positions[i]!;
      for (let j = i + 1; j < positions.length; j++) {
        const b = positions[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const distSq = Math.max(0.6, dx * dx + dy * dy + dz * dz);
        const force = repulsion / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force * dt;
        const fy = (dy / dist) * force * dt;
        const fz = (dz / dist) * force * dt;
        a.x += fx; a.y += fy; a.z += fz;
        b.x -= fx; b.y -= fy; b.z -= fz;
      }
    }

    // Spring attraction along edges
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k]!;
      const i = idToIndex.get(e.from);
      const j = idToIndex.get(e.to);
      if (i === undefined || j === undefined) continue;
      const a = positions[i]!;
      const b = positions[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const displacement = (dist - restLen) * springK * dt;
      const ux = dx / dist;
      const uy = dy / dist;
      const uz = dz / dist;
      a.x += ux * displacement; a.y += uy * displacement; a.z += uz * displacement;
      b.x -= ux * displacement; b.y -= uy * displacement; b.z -= uz * displacement;
    }

    // Damping + clamp to maxRadius sphere
    for (const p of positions) {
      p.multiplyScalar(damping);
      const len = p.length();
      if (len > maxRadius) p.multiplyScalar(maxRadius / len);
    }

    // Apply to node meshes (lerp for smoothness)
    for (let i = 0; i < nodeMeshRefs.current.length; i++) {
      const mesh = nodeMeshRefs.current[i];
      const p = positions[i];
      if (mesh && p) mesh.position.lerp(p, 0.35);
    }

    // Update edge geometries
    for (let k = 0; k < lineRefs.current.length; k++) {
      const line = lineRefs.current[k];
      const e = edges[k];
      if (!line || !e) continue;
      const i = idToIndex.get(e.from);
      const j = idToIndex.get(e.to);
      if (i === undefined || j === undefined) continue;
      const a = nodeMeshRefs.current[i]?.position;
      const b = nodeMeshRefs.current[j]?.position;
      if (a && b) {
        line.geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
        if (e.dashed) line.computeLineDistances();
      }
    }

    // Camera animation: lerp toward target if a node is selected
    if (targetCamPos.current && targetLookAt.current) {
      const cam = state.camera;
      cam.position.lerp(targetCamPos.current, 0.08);
      // Also move OrbitControls target so the camera orbits the selected node
      const controls = controlsRef.current;
      if (controls?.target) {
        controls.target.lerp(targetLookAt.current, 0.08);
      }
    }
  });

  // Trigger camera zoom when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      targetCamPos.current = null;
      targetLookAt.current = null;
      return;
    }
    const i = idToIndex.get(selectedId);
    if (i === undefined) return;
    const nodePos = positionsRef.current[i];
    if (!nodePos) return;
    const dir = nodePos.clone().normalize();
    targetCamPos.current = nodePos.clone().add(dir.multiplyScalar(3.5));
    targetLookAt.current = nodePos.clone();
  }, [selectedId, idToIndex]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} color="#10b981" intensity={0.6} />
      <pointLight position={[-10, -10, -10]} color="#f43f5e" intensity={0.6} />
      <pointLight position={[0, 0, 8]} color="#06b6d4" intensity={0.3} />

      <Stars radius={60} depth={50} count={1500} factor={3} saturation={0} fade speed={1} />

      {/* Nodes */}
      {nodes.map((n, i) => (
        <NodeMesh
          key={n.id}
          node={n}
          index={i}
          meshRefCallback={(el) => {
            nodeMeshRefs.current[i] = el;
          }}
          isSelected={selectedId === n.id}
          isHovered={hoveredId === n.id}
          onSelect={onSelect}
          onHover={setHoveredId}
        />
      ))}

      {/* Edges */}
      {edges.map((e, i) => (
        <Line
          key={`edge-${i}`}
          ref={(el) => {
            // drei Line ref exposes Line2 (non-segments mode). Cast safely.
            lineRefs.current[i] = (el as Line2 | null) ?? null;
          }}
          points={[
            [0, 0, 0],
            [0, 0, 0],
          ]}
          color={EDGE_COLOR[e.type]}
          lineWidth={1}
          dashed={!!e.dashed}
          dashSize={0.25}
          gapSize={0.15}
          transparent
          opacity={0.7}
        />
      ))}

      <CameraAutoRotate autoRotateRef={autoRotateRef} controlsRef={controlsRef} />
    </>
  );
}

// ── Camera auto-rotate controller ──────────────────────────────────────────
function CameraAutoRotate({
  autoRotateRef,
  controlsRef,
}: {
  autoRotateRef: React.MutableRefObject<boolean>;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
  useFrame(() => {
    const c = controlsRef.current;
    if (c) {
      c.autoRotate = autoRotateRef.current;
    }
  });
  return null;
}

// ── Individual node mesh ────────────────────────────────────────────────────
interface NodeMeshProps {
  node: GraphNode;
  index: number;
  meshRefCallback: (el: THREE.Mesh | null) => void;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

function NodeMesh({ node, meshRefCallback, isSelected, isHovered, onSelect, onHover }: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = NODE_COLOR[node.type];
  const baseSize = NODE_SIZE[node.type];
  const targetScale = isHovered || isSelected ? baseSize * 1.6 : baseSize;

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    // Smooth scale toward target
    const cur = m.scale.x;
    const next = cur + (targetScale - cur) * 0.18;
    m.scale.setScalar(next);
    // Slow self-rotation
    m.rotation.y += 0.004;
    if (node.type === "codebase") m.rotation.x += 0.002;
  });

  return (
    <group>
      <mesh
        ref={(el) => {
          meshRef.current = el;
          meshRefCallback(el);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(node.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "default";
        }}
      >
        {/* Per-node-type geometry */}
        {node.type === "client" && <sphereGeometry args={[1, 24, 24]} />}
        {node.type === "codebase" && <boxGeometry args={[1, 1, 1]} />}
        {node.type === "finding" && <octahedronGeometry args={[1, 0]} />}
        {node.type === "patch" && <tetrahedronGeometry args={[1, 0]} />}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 1.5 : isHovered ? 1.0 : 0.4}
          roughness={0.4}
          metalness={0.6}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* Glow halo for selected */}
      {isSelected && (
        <mesh>
          <sphereGeometry args={[baseSize * 2.2, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.12} />
        </mesh>
      )}

      {/* Hover tooltip */}
      {isHovered && (
        <Html center distanceFactor={10} position={[0, baseSize + 0.6, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded border border-zinc-700 bg-zinc-950/90 px-2 py-1 font-mono text-[10px] text-zinc-200 shadow-lg">
            <span style={{ color }}>{node.type.toUpperCase()}</span>
            <span className="text-zinc-500"> · </span>
            {node.label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Detail panel (right side) ──────────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const color = NODE_COLOR[node.type];
  const typeIcon: Record<NodeType, React.ReactNode> = {
    client: <Box className="size-3.5" style={{ color }} />,
    codebase: <FileCode2 className="size-3.5" style={{ color }} />,
    finding: <ShieldAlert className="size-3.5" style={{ color }} />,
    patch: <Zap className="size-3.5" style={{ color }} />,
  };
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className="pointer-events-auto absolute right-3 top-3 z-20 w-[260px] rounded-md border border-zinc-700 bg-zinc-950/95 p-4 backdrop-blur-md sm:right-4 sm:top-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex size-7 items-center justify-center rounded"
            style={{ background: `${color}22`, border: `1px solid ${color}55` }}
          >
            {typeIcon[node.type]}
          </div>
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color }}>
            {node.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Close detail panel"
        >
          <X className="size-4" />
        </button>
      </div>
      <h3 className="mb-3 break-words font-mono text-sm font-bold text-zinc-100">
        {node.label}
      </h3>
      <div className="space-y-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">ID</span>
          <span className="font-mono text-zinc-400">{node.id.slice(0, 12)}…</span>
        </div>
        {node.severity && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Severity</span>
            <Badge
              variant="outline"
              className="font-mono text-[10px]"
              style={{
                color: node.severity === "critical" ? "#f43f5e" : node.severity === "high" ? "#f59e0b" : "#06b6d4",
                borderColor: "currentColor",
              }}
            >
              {node.severity}
            </Badge>
          </div>
        )}
        {node.status && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Status</span>
            <span className="font-mono text-zinc-300">{node.status}</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        {node.type === "client" && "Top-level entity grouping assets + pipeline stages."}
        {node.type === "codebase" && "Source code repository under analysis."}
        {node.type === "finding" && "Confirmed vulnerability discovered during an engagement."}
        {node.type === "patch" && "AI-generated remediation awaiting review or deployment."}
      </p>
    </motion.div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────
function Legend() {
  const items: Array<{ type: NodeType; label: string; shape: string }> = [
    { type: "client", label: "Clients", shape: "●" },
    { type: "codebase", label: "Codebases", shape: "■" },
    { type: "finding", label: "Findings", shape: "◆" },
    { type: "patch", label: "Patches", shape: "▲" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 px-2 py-2 sm:gap-5">
      {items.map((it) => (
        <div key={it.type} className="flex items-center gap-1.5">
          <span
            className="text-sm leading-none"
            style={{ color: NODE_COLOR[it.type], textShadow: `0 0 6px ${NODE_COLOR[it.type]}80` }}
          >
            {it.shape}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function ThreatConstellation() {
  const [data, setData] = useState<ConstellationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const autoRotateRef = useRef(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  // Pause auto-rotate while hovering or selecting
  useEffect(() => {
    autoRotateRef.current = hoveredId === null && selectedId === null;
  }, [hoveredId, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    try {
      const d = await fetchConstellation(ac.signal);
      setData(d);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Failed to load constellation.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId],
  );

  const isEmpty = !loading && !error && data && data.nodes.length === 0;

  return (
    <div className="holo-card-sharp hud-corners relative w-full overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
            <Satellite className="size-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-emerald-400">
              3D Threat Constellation
            </h2>
            <p className="text-[11px] text-zinc-500">
              Live force-directed map of clients · codebases · findings · patches
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className="border-zinc-700 font-mono text-[10px] text-zinc-400">
              <Sparkles className="mr-1 size-3 text-emerald-400" />
              {data.nodes.length} nodes · {data.edges.length} edges
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="border-emerald-500/30 bg-zinc-900/60 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <Cpu className="size-3.5" />
            RELOAD
          </Button>
        </div>
      </div>

      {/* Canvas + overlays */}
      <div className="relative h-[420px] w-full overflow-hidden rounded-md border border-zinc-800 bg-gradient-to-b from-zinc-950 via-zinc-900/50 to-zinc-950 sm:h-[520px]">
        {/* Subtle nebula gradient overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 40%, rgba(16,185,129,0.08), transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(244,63,94,0.06), transparent 50%)",
          }}
        />

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <Loader2 className="size-7 animate-spin text-emerald-400" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">
              Mapping constellation…
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
        ) : isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Satellite className="size-8 text-emerald-400/50" />
            <p className="font-mono text-xs uppercase tracking-widest text-zinc-400">
              Empty Constellation
            </p>
            <p className="max-w-md text-[11px] text-zinc-600">
              Add clients + run scans to see your threat constellation materialize here.
            </p>
          </div>
        ) : data ? (
          <>
            <Canvas
              camera={{ position: [0, 0, 15], fov: 50, near: 0.1, far: 100 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <Suspense fallback={null}>
                <Scene
                  nodes={data.nodes}
                  edges={data.edges}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  hoveredId={hoveredId}
                  setHoveredId={setHoveredId}
                  autoRotateRef={autoRotateRef}
                  controlsRef={controlsRef}
                />
                <OrbitControls
                  ref={controlsRef}
                  makeDefault
                  enablePan={false}
                  enableZoom
                  minDistance={4}
                  maxDistance={30}
                  autoRotate
                  autoRotateSpeed={0.6}
                  enableDamping
                  dampingFactor={0.08}
                />
              </Suspense>
            </Canvas>

            {/* Click-away to deselect */}
            {selectedId && (
              <button
                aria-label="Deselect node"
                className="absolute inset-0 z-10 cursor-default"
                onClick={() => setSelectedId(null)}
                tabIndex={-1}
              />
            )}

            {/* Detail panel */}
            <AnimatePresence>
              {selectedNode && (
                <DetailPanel node={selectedNode} onClose={() => setSelectedId(null)} />
              )}
            </AnimatePresence>
          </>
        ) : null}
      </div>

      {/* Legend */}
      {!isEmpty && <Legend />}
    </div>
  );
}

export default ThreatConstellation;
