import { useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

type MemoryRecord = {
  memoryId: string;
  content: string;
  tier: string;
  segment: string;
  importance: number;
};

type HubNode = {
  id: string;
  kind: "hub";
  label: string;
  memoryCount: number;
  dominantSegment: string;
};

type MemoryNode = {
  id: string;
  kind: "memory";
  label: string;
  content: string;
  segment: string;
  tier: string;
  importance: number;
};

type GraphNode = HubNode | MemoryNode;

const SEGMENT_COLORS: Record<string, string> = {
  identity: "#f43f5e",
  preference: "#14b8a6",
  relationship: "#ec4899",
  project: "#f97316",
  knowledge: "#3b82f6",
  context: "#64748b",
};
const DEFAULT_COLOR = "#94a3b8";

function segmentColor(segment: string): string {
  return SEGMENT_COLORS[segment] ?? DEFAULT_COLOR;
}

function humanizeSegment(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildGraph(records: MemoryRecord[]) {
  const bySegment = new Map<string, MemoryRecord[]>();
  for (const r of records) {
    const seg = r.segment || "unknown";
    const list = bySegment.get(seg);
    if (list) list.push(r);
    else bySegment.set(seg, [r]);
  }

  const nodes: GraphNode[] = [];
  const links: { source: string; target: string }[] = [];

  for (const [segment, members] of bySegment) {
    const hubId = `hub:${segment}`;
    nodes.push({
      id: hubId,
      kind: "hub",
      label: humanizeSegment(segment),
      memoryCount: members.length,
      dominantSegment: segment,
    });
    for (const m of members) {
      nodes.push({
        id: m.memoryId,
        kind: "memory",
        label: m.content.slice(0, 50) + (m.content.length > 50 ? "…" : ""),
        content: m.content,
        segment: m.segment,
        tier: m.tier,
        importance: m.importance,
      });
      links.push({ source: hubId, target: m.memoryId });
    }
  }

  return { nodes, links };
}

export default function MemoryGraphView({
  records,
  isDark,
}: {
  records: any[];
  isDark: boolean;
}) {
  const graph = useMemo(() => buildGraph(records as MemoryRecord[]), [records]);
  const fgRef = useRef<any>(null);

  if (records.length === 0) {
    return (
      <div
        className={`flex items-center justify-center h-full text-sm ${
          isDark ? "text-zinc-600" : "text-zinc-400"
        }`}
      >
        No memories yet. Chat with the agent to build your graph.
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ForceGraph2D
        ref={fgRef}
        graphData={graph}
        backgroundColor={isDark ? "#202024" : "#ffffff"}
        nodeRelSize={4}
        linkColor={() => (isDark ? "rgba(148,163,184,0.15)" : "rgba(15,23,42,0.15)")}
        linkWidth={1}
        nodeLabel={(n: any) =>
          n.kind === "hub"
            ? `<div style="padding:4px 8px;background:#020617;color:#fff;border-radius:4px;font-size:12px">${n.label} — ${n.memoryCount} memories</div>`
            : `<div style="padding:4px 8px;background:#020617;color:#fff;border-radius:4px;font-size:12px;max-width:280px">${n.content}</div>`
        }
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const isHub = node.kind === "hub";
          const color = isHub
            ? segmentColor(node.dominantSegment)
            : segmentColor(node.segment);

          if (isHub) {
            const radius = Math.max(10, Math.min(30, 8 + Math.log2(node.memoryCount + 1) * 4));
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.max(10, 12 / globalScale)}px Geist, ui-sans-serif, system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(node.label, node.x, node.y);
          } else {
            const radius = Math.max(3, Math.min(8, 3 + node.importance * 5));
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            if (globalScale > 1.5) {
              ctx.fillStyle = isDark ? "rgba(244,244,245,0.9)" : "rgba(39,39,42,0.9)";
              ctx.font = `${10 / globalScale}px Geist, ui-sans-serif, system-ui`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText(node.label.slice(0, 40), node.x, node.y + radius + 2);
            }
          }
        }}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
      />
    </div>
  );
}
