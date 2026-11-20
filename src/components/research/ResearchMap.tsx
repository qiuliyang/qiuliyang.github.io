import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { AuthorLink } from '../../utils/authors';

export interface MapColumn {
  id: string;
  title: string;
  subtitle: string;
}

export interface OngoingWork {
  id: string;
  title: string;
  badge: string;
  venue: string;
  description: string;
}

export type NodeMode = 'experiment' | 'theory' | 'theory-experiment';

export interface MapNode {
  id: string;
  column: string;
  mode: NodeMode;
  title: string;
  tagline: string;
  era?: string;
  summary: string;
  ongoing?: string[];
  papers: string[];
  talks: string[];
}

export interface MapEdge {
  from: string;
  to: string;
  kind: 'flow' | 'bridge';
  shortLabel?: string;
  label: string;
}

export interface SerializedPaper {
  key: string;
  abbr?: string;
  title: string;
  authors: AuthorLink[];
  venue: string;
  year: number;
  doi?: string;
  arxiv?: string;
  cleanBibtex?: string;
}

export interface SerializedTalk {
  date: string;
  formattedDate: string;
  title: string;
  type?: 'conference' | 'workshop' | 'colloquium' | 'seminar';
  typeLabel?: string;
  event?: string;
  host?: string;
  url?: string;
}

interface Props {
  columns: MapColumn[];
  nodes: MapNode[];
  edges: MapEdge[];
  ongoingWorks: OngoingWork[];
  papers: SerializedPaper[];
  talks: SerializedTalk[];
}

interface ComputedLine {
  id: string;
  edge: MapEdge;
  d: string;
  x1: number;
  y1: number;
}

const MODE_LABEL: Record<NodeMode, string> = {
  experiment: 'Experiment',
  theory: 'Theory',
  'theory-experiment': 'Theory + Exp.',
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function ResearchMap({ columns, nodes, edges, ongoingWorks, papers, talks }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredWorkNodeIds, setHoveredWorkNodeIds] = useState<string[]>([]);
  const [openBibKeys, setOpenBibKeys] = useState<Record<string, boolean>>({});
  const [lines, setLines] = useState<ComputedLine[]>([]);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailRef = useRef<HTMLDivElement | null>(null);

  const nodeMap = useMemo(() => {
    const m = new Map<string, MapNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const colIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, idx) => m.set(c.id, idx));
    return m;
  }, [columns]);

  // Reverse index: paper key or ongoing id → node ids
  const paperToNodes = useMemo(() => {
    const m = new Map<string, MapNode[]>();
    for (const n of nodes) {
      for (const pKey of n.papers) {
        const list = m.get(pKey) ?? [];
        list.push(n);
        m.set(pKey, list);
      }
    }
    return m;
  }, [nodes]);

  const ongoingToNodes = useMemo(() => {
    const m = new Map<string, MapNode[]>();
    for (const n of nodes) {
      for (const oKey of n.ongoing ?? []) {
        const list = m.get(oKey) ?? [];
        list.push(n);
        m.set(oKey, list);
      }
    }
    return m;
  }, [nodes]);

  const activeFocusId = hoveredId ?? selectedId;

  const { highlightedNodes, highlightedEdges } = useMemo(() => {
    if (hoveredWorkNodeIds.length > 0 && !hoveredId) {
      const nSet = new Set<string>(hoveredWorkNodeIds);
      const eSet = new Set<string>();
      for (const e of edges) {
        if (nSet.has(e.from) && nSet.has(e.to)) {
          eSet.add(`${e.from}->${e.to}`);
        }
      }
      return { highlightedNodes: nSet, highlightedEdges: eSet };
    }

    if (!activeFocusId) {
      return { highlightedNodes: null, highlightedEdges: null };
    }

    const nSet = new Set<string>([activeFocusId]);
    const eSet = new Set<string>();
    for (const e of edges) {
      if (e.from === activeFocusId || e.to === activeFocusId) {
        nSet.add(e.from);
        nSet.add(e.to);
        eSet.add(`${e.from}->${e.to}`);
      }
    }
    return { highlightedNodes: nSet, highlightedEdges: eSet };
  }, [activeFocusId, edges, hoveredId, hoveredWorkNodeIds]);

  const computeLines = useCallback(() => {
    const container = canvasRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    if (cRect.width === 0 || cRect.height === 0) return;

    const rects: Record<
      string,
      { left: number; right: number; top: number; bottom: number; cx: number; cy: number }
    > = {};
    for (const n of nodes) {
      const el = nodeRefs.current[n.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      rects[n.id] = {
        left: r.left - cRect.left,
        right: r.right - cRect.left,
        top: r.top - cRect.top,
        bottom: r.bottom - cRect.top,
        cx: r.left - cRect.left + r.width / 2,
        cy: r.top - cRect.top + r.height / 2,
      };
    }

    // Group cross-column outgoing & incoming edges to stagger port y-offsets cleanly.
    const outGroups = new Map<string, MapEdge[]>();
    const inGroups = new Map<string, MapEdge[]>();

    for (const e of edges) {
      const uNode = nodeMap.get(e.from);
      const vNode = nodeMap.get(e.to);
      if (!uNode || !vNode) continue;
      const colU = colIndexMap.get(uNode.column) ?? 0;
      const colV = colIndexMap.get(vNode.column) ?? 0;
      if (colU !== colV) {
        const outs = outGroups.get(e.from) ?? [];
        outs.push(e);
        outGroups.set(e.from, outs);

        const ins = inGroups.get(e.to) ?? [];
        ins.push(e);
        inGroups.set(e.to, ins);
      }
    }

    for (const list of outGroups.values()) {
      list.sort((a, b) => (rects[a.to]?.cy ?? 0) - (rects[b.to]?.cy ?? 0));
    }
    for (const list of inGroups.values()) {
      list.sort((a, b) => (rects[a.from]?.cy ?? 0) - (rects[b.from]?.cy ?? 0));
    }

    const nextLines: ComputedLine[] = [];

    for (const e of edges) {
      const rA = rects[e.from];
      const rB = rects[e.to];
      const uNode = nodeMap.get(e.from);
      const vNode = nodeMap.get(e.to);
      if (!rA || !rB || !uNode || !vNode) continue;

      const colU = colIndexMap.get(uNode.column) ?? 0;
      const colV = colIndexMap.get(vNode.column) ?? 0;

      if (colU === colV) {
        // Vertical connection between stacked cards in the same column
        const padStart = e.kind === 'bridge' ? 4 : 1;
        const x1 = rA.cx;
        const y1 = rA.bottom + padStart;
        const x2 = rB.cx;
        const y2 = rB.top - 4;
        const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        nextLines.push({ id: `${e.from}->${e.to}`, edge: e, d, x1, y1 });
      } else {
        const outs = outGroups.get(e.from) ?? [e];
        const outIdx = outs.indexOf(e);
        const outOffset = (outIdx - (outs.length - 1) / 2) * 10;

        const ins = inGroups.get(e.to) ?? [e];
        const inIdx = ins.indexOf(e);
        const inOffset = (inIdx - (ins.length - 1) / 2) * 10;

        const padStart = e.kind === 'bridge' ? 4 : 1;
        const x1 = rA.right + padStart;
        const y1 = rA.cy + outOffset;
        const x2 = rB.left - 4;
        const y2 = rB.cy + inOffset;
        const dx = Math.max(32, (x2 - x1) * 0.52);

        const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        nextLines.push({ id: `${e.from}->${e.to}`, edge: e, d, x1, y1 });
      }
    }

    setCanvasSize({ w: cRect.width, h: cRect.height });
    setLines(nextLines);
  }, [colIndexMap, edges, nodeMap, nodes]);

  useIsomorphicLayoutEffect(() => {
    computeLines();
    const container = canvasRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(() => {
      computeLines();
    });
    ro.observe(container);
    window.addEventListener('resize', computeLines);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeLines);
    };
  }, [computeLines]);

  const activeNode = activeFocusId ? (nodeMap.get(activeFocusId) ?? null) : null;
  const selectedNode = selectedId ? (nodeMap.get(selectedId) ?? null) : null;

  const activeConnections = useMemo(() => {
    if (!activeNode) return { incoming: [], outgoing: [] };
    return {
      incoming: edges.filter((e) => e.to === activeNode.id),
      outgoing: edges.filter((e) => e.from === activeNode.id),
    };
  }, [activeNode, edges]);

  const filteredOngoing = useMemo(() => {
    if (!selectedNode) return ongoingWorks;
    const ids = new Set(selectedNode.ongoing ?? []);
    return ongoingWorks.filter((o) => ids.has(o.id));
  }, [ongoingWorks, selectedNode]);

  const filteredPapers = useMemo(() => {
    if (!selectedNode) return papers;
    const keys = new Set(selectedNode.papers);
    return papers.filter((p) => keys.has(p.key));
  }, [papers, selectedNode]);

  const filteredTalks = useMemo(() => {
    if (!selectedNode) return [];
    const dates = new Set(selectedNode.talks);
    return talks.filter((t) => dates.has(t.date));
  }, [selectedNode, talks]);

  const handleSelectNode = (id: string, scrollIfNeeded = false) => {
    setSelectedId((prev) => (prev === id ? null : id));
    if (scrollIfNeeded && detailRef.current && window.innerWidth < 768) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggleBibtex = (key: string) => {
    setOpenBibKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="rm-root">
      {/* Legend & interaction hint bar */}
      <div className="rm-toolbar">
        <div className="rm-mode-legend" aria-label="Panel styles">
          <span className="rm-legend-item">
            <span className="rm-mode-swatch rm-swatch-exp" aria-hidden="true" />
            Experiment
          </span>
          <span className="rm-legend-item">
            <span className="rm-mode-swatch rm-swatch-th" aria-hidden="true" />
            Theory
          </span>
          <span className="rm-legend-item">
            <span className="rm-mode-swatch rm-swatch-both" aria-hidden="true" />
            Theory + Exp.
          </span>
        </div>
        <div className="rm-legend" aria-hidden="true">
          <span className="rm-legend-item">
            <span className="rm-legend-line rm-legend-flow" />
            Progression
          </span>
          <span className="rm-legend-item">
            <span className="rm-legend-line rm-legend-bridge" />
            Conceptual bridge
          </span>
        </div>
      </div>

      {/* Interactive 3-column DAG canvas */}
      <div className="rm-canvas-frame">
        <div className="rm-canvas" ref={canvasRef}>
          {canvasSize.w > 0 && (
            <svg
              className="rm-svg"
              width={canvasSize.w}
              height={canvasSize.h}
              viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="rm-arrow-muted"
                  viewBox="0 0 8 8"
                  refX="6.5"
                  refY="4"
                  markerWidth="5.5"
                  markerHeight="5.5"
                  orient="auto"
                >
                  <path d="M 0.5 1.2 L 7 4 L 0.5 6.8 z" fill="var(--rm-edge-muted)" />
                </marker>
                <marker
                  id="rm-arrow-flow"
                  viewBox="0 0 8 8"
                  refX="6.5"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0.5 1.2 L 7 4 L 0.5 6.8 z" fill="var(--global-theme-color)" />
                </marker>
                <marker
                  id="rm-arrow-bridge"
                  viewBox="0 0 8 8"
                  refX="6.5"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0.5 1.2 L 7 4 L 0.5 6.8 z" fill="var(--rm-bridge-color)" />
                </marker>
              </defs>

              {lines.map((ln) => {
                const isBridge = ln.edge.kind === 'bridge';
                const isActive = highlightedEdges ? highlightedEdges.has(ln.id) : false;
                const isDimmed = highlightedEdges ? !isActive : false;

                let stroke = isBridge ? 'var(--rm-bridge-muted)' : 'var(--rm-edge-muted)';
                let markerEnd = isBridge ? 'url(#rm-arrow-bridge)' : 'url(#rm-arrow-muted)';
                if (isActive) {
                  stroke = isBridge ? 'var(--rm-bridge-color)' : 'var(--global-theme-color)';
                  markerEnd = isBridge ? 'url(#rm-arrow-bridge)' : 'url(#rm-arrow-flow)';
                }

                return (
                  <g
                    key={ln.id}
                    style={{
                      opacity: isDimmed ? 0.16 : 1,
                      transition: 'opacity 160ms ease',
                    }}
                  >
                    {!isBridge && (
                      <circle cx={ln.x1} cy={ln.y1} r={isActive ? 2.6 : 2} fill={stroke} />
                    )}
                    <path
                      d={ln.d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isActive ? 2.2 : 1.5}
                      strokeDasharray={isBridge ? '5 3.5' : undefined}
                      strokeLinecap="round"
                      markerStart={isBridge ? 'url(#rm-arrow-bridge)' : undefined}
                      markerEnd={markerEnd}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          <div className="rm-columns">
            {columns.map((col) => {
              const colNodes = nodes.filter((n) => n.column === col.id);
              return (
                <div className="rm-column" key={col.id}>
                  <div className="rm-col-header">
                    <div className="rm-col-title">{col.title}</div>
                    <div className="rm-col-subtitle">{col.subtitle}</div>
                  </div>
                  <div className="rm-col-cards">
                    {colNodes.map((node) => {
                      const isSelected = selectedId === node.id;
                      const isHighlighted = highlightedNodes ? highlightedNodes.has(node.id) : true;
                      const isOngoing = (node.ongoing?.length ?? 0) > 0;
                      const paperCount = node.papers.length;
                      const talkCount = node.talks.length;

                      const incomingForMobile = edges.filter((e) => e.to === node.id);
                      const outgoingForMobile = edges.filter((e) => e.from === node.id);

                      return (
                        <button
                          key={node.id}
                          type="button"
                          ref={(el) => {
                            nodeRefs.current[node.id] = el;
                          }}
                          className={[
                            'rm-node',
                            `rm-node-mode-${node.mode}`,
                            isSelected ? 'rm-node-selected' : '',
                            !isHighlighted ? 'rm-node-dimmed' : '',
                            isOngoing ? 'rm-node-ongoing' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onMouseEnter={() => setHoveredId(node.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onFocus={() => setHoveredId(node.id)}
                          onBlur={() => setHoveredId(null)}
                          onClick={() => handleSelectNode(node.id, true)}
                          aria-pressed={isSelected}
                        >
                          <div className="rm-node-top">
                            <span className="rm-node-title">{node.title}</span>
                          </div>
                          <div className="rm-node-tagline">{node.tagline}</div>
                          <div className="rm-node-meta">
                            <span className={`rm-mode-pill rm-mode-pill-${node.mode}`}>
                              {MODE_LABEL[node.mode]}
                            </span>
                            {isOngoing && <span className="rm-chip rm-chip-ongoing">Ongoing</span>}
                            {paperCount > 0 && (
                              <span className="rm-chip">
                                {paperCount} {paperCount === 1 ? 'paper' : 'papers'}
                              </span>
                            )}
                            {talkCount > 0 && paperCount === 0 && !isOngoing && (
                              <span className="rm-chip">
                                {talkCount} {talkCount === 1 ? 'talk' : 'talks'}
                              </span>
                            )}
                            {node.era && <span className="rm-era">{node.era}</span>}
                          </div>

                          {/* Mobile-only compact link summary */}
                          {(incomingForMobile.length > 0 || outgoingForMobile.length > 0) && (
                            <div className="rm-mobile-links">
                              {outgoingForMobile.map((e) => (
                                <span key={`${e.from}-${e.to}`} className="rm-mobile-link-tag">
                                  → {nodeMap.get(e.to)?.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live connection inspector strip inside the map frame */}
        <div className="rm-inspector">
          {activeNode ? (
            <div className="rm-inspector-active">
              <div className="rm-inspector-title">
                <strong>{activeNode.title}</strong>
                {selectedId === activeNode.id && (
                  <span className="rm-inspector-pin">Pinned · click again to show all</span>
                )}
              </div>
              <div className="rm-inspector-edges">
                {activeConnections.incoming.map((e) => {
                  const src = nodeMap.get(e.from);
                  return (
                    <div className="rm-edge-row" key={`in-${e.from}`}>
                      <span className={`rm-edge-badge ${e.kind === 'bridge' ? 'is-bridge' : ''}`}>
                        {e.kind === 'bridge' ? '⇄' : '←'} {src?.title}
                      </span>
                      <span className="rm-edge-desc">{e.label}</span>
                    </div>
                  );
                })}
                {activeConnections.outgoing.map((e) => {
                  const dst = nodeMap.get(e.to);
                  return (
                    <div className="rm-edge-row" key={`out-${e.to}`}>
                      <span className={`rm-edge-badge ${e.kind === 'bridge' ? 'is-bridge' : ''}`}>
                        {e.kind === 'bridge' ? '⇄' : '→'} {dst?.title}
                      </span>
                      <span className="rm-edge-desc">{e.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rm-inspector-idle">
              <span className="rm-bridge-callout">
                <strong>Key bridges across platforms:</strong> <em>SU(2) ↔ U(N)</em> unitary
                synthesis (Composite Raman pulses ↔ Coherent lattice rearrangements) &nbsp;·&nbsp;{' '}
                <em>3-band ↔ 1-band</em> cuprate physics (Emery model ↔ Doped t–t′ Hubbard)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selected topic overview banner */}
      <div ref={detailRef} className="rm-detail-anchor">
        {selectedNode ? (
          <div className="rm-selected-panel">
            <div className="rm-selected-header">
              <div>
                <div className="rm-selected-kicker">
                  {columns.find((c) => c.id === selectedNode.column)?.title}
                  {' · '}
                  <span className={`rm-kicker-mode rm-kicker-mode-${selectedNode.mode}`}>
                    {MODE_LABEL[selectedNode.mode]}
                  </span>
                </div>
                <h2 className="rm-selected-heading">{selectedNode.title}</h2>
              </div>
              <button type="button" className="rm-reset-btn" onClick={() => setSelectedId(null)}>
                Show all works ×
              </button>
            </div>
            <p className="rm-selected-summary">{selectedNode.summary}</p>
            <div className="rm-nav-pills">
              {edges
                .filter((e) => e.to === selectedNode.id)
                .map((e) => {
                  const src = nodeMap.get(e.from);
                  if (!src) return null;
                  return (
                    <button
                      key={`jump-in-${e.from}`}
                      type="button"
                      className={`rm-jump-pill ${e.kind === 'bridge' ? 'is-bridge' : ''}`}
                      onClick={() => setSelectedId(src.id)}
                    >
                      {e.kind === 'bridge' ? '⇄ Bridge to: ' : '← Builds on: '}
                      {src.title}
                    </button>
                  );
                })}
              {edges
                .filter((e) => e.from === selectedNode.id)
                .map((e) => {
                  const dst = nodeMap.get(e.to);
                  if (!dst) return null;
                  return (
                    <button
                      key={`jump-out-${e.to}`}
                      type="button"
                      className={`rm-jump-pill ${e.kind === 'bridge' ? 'is-bridge' : ''}`}
                      onClick={() => setSelectedId(dst.id)}
                    >
                      {e.kind === 'bridge' ? '⇄ Bridge to: ' : '→ Leads to: '}
                      {dst.title}
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="rm-all-header">
            <span>
              Showing all <strong>{ongoingWorks.length} ongoing directions</strong> and{' '}
              <strong>{papers.length} publications</strong> — hover any item to highlight its place
              in the map.
            </span>
          </div>
        )}
      </div>

      {/* Ongoing FermiQP Research */}
      {filteredOngoing.length > 0 && (
        <section className="rm-section">
          <h3 className="rm-section-title">ongoing research</h3>
          <ol className="rm-work-list">
            {filteredOngoing.map((item) => {
              const linkedNodes = ongoingToNodes.get(item.id) ?? [];
              return (
                <li
                  key={item.id}
                  className="rm-work-item"
                  onMouseEnter={() => setHoveredWorkNodeIds(linkedNodes.map((n) => n.id))}
                  onMouseLeave={() => setHoveredWorkNodeIds([])}
                >
                  <div className="rm-work-badge-col">
                    <span className="badge-abbr rm-badge-ongoing">{item.badge}</span>
                  </div>
                  <div className="rm-work-body">
                    <div className="rm-work-title">{item.title}</div>
                    <div className="rm-work-venue">
                      <em>{item.venue}</em>
                    </div>
                    <p className="rm-work-desc">{item.description}</p>
                    <div className="rm-topic-tags">
                      {linkedNodes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={`rm-topic-tag ${selectedId === n.id ? 'is-active' : ''}`}
                          onClick={() => handleSelectNode(n.id)}
                        >
                          {n.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Filtered Publications */}
      {filteredPapers.length > 0 && (
        <section className="rm-section">
          <h3 className="rm-section-title">
            {selectedNode ? 'publications in this thread' : 'publications'}
          </h3>
          <ol className="rm-work-list bibliography">
            {filteredPapers.map((p) => {
              const linkedNodes = paperToNodes.get(p.key) ?? [];
              const url = p.doi
                ? `https://doi.org/${p.doi}`
                : p.arxiv
                  ? `https://arxiv.org/abs/${p.arxiv}`
                  : '';
              const isBibOpen = Boolean(openBibKeys[p.key]);

              return (
                <li
                  key={p.key}
                  className="rm-work-item"
                  onMouseEnter={() => setHoveredWorkNodeIds(linkedNodes.map((n) => n.id))}
                  onMouseLeave={() => setHoveredWorkNodeIds([])}
                >
                  <div className="rm-work-badge-col">
                    {p.abbr && <span className="badge-abbr">{p.abbr}</span>}
                  </div>
                  <div className="rm-work-body">
                    <div className="title">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                    </div>
                    <div className="author">
                      {p.authors.map((al, idx) => {
                        const isLast = idx === p.authors.length - 1;
                        const nameEl = (
                          <>
                            {al.isSelf ? <strong>{al.name}</strong> : al.name}
                            {al.mark && <sup className="author-mark">{al.mark}</sup>}
                          </>
                        );
                        return (
                          <span key={`${p.key}-au-${idx}`}>
                            {al.url ? (
                              <a href={al.url} target="_blank" rel="noopener noreferrer">
                                {nameEl}
                              </a>
                            ) : (
                              nameEl
                            )}
                            {!isLast && ', '}
                          </span>
                        );
                      })}
                    </div>
                    <div className="periodical">
                      {p.venue && <em>{p.venue}</em>}
                      {p.venue && p.year ? ', ' : ''}
                      {p.year || ''}
                    </div>
                    <div className="links rm-links-row">
                      {p.doi && (
                        <a
                          href={`https://doi.org/${p.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm z-depth-0"
                        >
                          DOI
                        </a>
                      )}
                      {p.arxiv && (
                        <a
                          href={`https://arxiv.org/abs/${p.arxiv}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm z-depth-0"
                        >
                          arXiv
                        </a>
                      )}
                      {p.cleanBibtex && (
                        <button
                          type="button"
                          className="bibtex btn btn-sm z-depth-0"
                          onClick={() => toggleBibtex(p.key)}
                          style={{ cursor: 'pointer', background: 'none' }}
                        >
                          Bib
                        </button>
                      )}
                      {linkedNodes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={`rm-topic-tag ${selectedId === n.id ? 'is-active' : ''}`}
                          onClick={() => handleSelectNode(n.id)}
                        >
                          {n.title}
                        </button>
                      ))}
                    </div>
                    {isBibOpen && p.cleanBibtex && (
                      <div className="bibtex open hidden">
                        <pre>{p.cleanBibtex}</pre>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Related Invited Talks (shown when a topic with talks is selected) */}
      {selectedNode && filteredTalks.length > 0 && (
        <section className="rm-section">
          <h3 className="rm-section-title">related invited talks</h3>
          <ol className="rm-talk-list">
            {filteredTalks.map((t, idx) => (
              <li key={`${t.date}-${idx}`} className="rm-talk-item">
                <div className="rm-talk-date">{t.formattedDate}</div>
                <div className="rm-talk-body">
                  {t.type && (
                    <span className={`badge-abbr rm-talk-badge-${t.type}`}>
                      {t.typeLabel ?? t.type}
                    </span>
                  )}
                  <span className="rm-talk-title">{t.title}</span>
                  {(t.event || t.host) && (
                    <div className="rm-talk-venue">
                      {t.url ? (
                        <a href={t.url} target="_blank" rel="noopener noreferrer">
                          {t.event && <em>{t.event}</em>}
                          {t.event && t.host ? ', ' : ''}
                          {t.host}
                        </a>
                      ) : (
                        <>
                          {t.event && <em>{t.event}</em>}
                          {t.event && t.host ? ', ' : ''}
                          {t.host}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
