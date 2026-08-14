import type { InspectorTab } from '@/config';
import { useT } from '@/i18n';
import { vars } from '@/lib/css';
import type { Palette } from '@/lib/palette';
import type { Estate } from '@/survey/mapping';
import type { AppState, CopyApi } from '@/state/useAppState';
import { SearchIcon } from '../icons';
import { Inspector } from './Inspector';
import { PolicyView } from './PolicyView';
import { TopologyCanvas } from './TopologyCanvas';

export interface TopologyViewProps {
  state: AppState;
  estate: Estate;
  palette: Palette;
  accent: string;
  copy: CopyApi;
  showLogical: boolean;
  showEstimated: boolean;
  animate: boolean;
  onSub: (sub: 'map' | 'policy') => void;
  onTab: (tab: InspectorTab) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPan: (x: number, y: number) => void;
  onToggleLegend: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

export function TopologyView(props: TopologyViewProps) {
  const { state, estate, palette, accent, copy, onSub, onTab, onSelect } = props;
  const t = useT();
  const onMap = state.sub === 'map';
  // The selection is an id, and a fresh survey can retire the node it named.
  const selectedNode =
    estate.nodes.find((n) => n.id === state.selected) ?? estate.nodes[0] ?? null;

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          background: 'var(--app)',
        }}
      >
        <div
          style={{
            height: 48,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 16px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--panel)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              flex: 'none',
              padding: 3,
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              gap: 2,
            }}
          >
            <SubTab label={t.topology.tabMap} active={onMap} onClick={() => onSub('map')} />
            <SubTab
              label={t.topology.tabPolicy}
              active={state.sub === 'policy'}
              onClick={() => onSub('policy')}
            />
          </div>

          <div
            className="chip"
            style={{ flex: '0 1 230px', minWidth: 0, overflow: 'hidden', color: 'var(--text3)' }}
          >
            <SearchIcon />
            <span className="ellipsis" style={{ fontSize: 11.5 }}>
              {t.topology.search}
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }} />
        </div>

        {onMap ? (
          <TopologyCanvas
            nodes={estate.nodes}
            links={estate.links}
            counts={estate.counts}
            palette={palette}
            accent={accent}
            selected={selectedNode?.id ?? ''}
            hovered={state.hovered}
            zoom={state.zoom}
            panX={state.panX}
            panY={state.panY}
            legendOpen={state.legendOpen}
            showLogical={props.showLogical}
            showEstimated={props.showEstimated}
            animate={props.animate}
            onSelect={onSelect}
            onHover={props.onHover}
            onPan={props.onPan}
            onToggleLegend={props.onToggleLegend}
            onZoomIn={props.onZoomIn}
            onZoomOut={props.onZoomOut}
            onZoomFit={props.onZoomFit}
          />
        ) : (
          <PolicyView
            palette={palette}
            zones={estate.zones}
            matrix={estate.matrix}
            matrixNote={estate.matrixNote}
            rules={estate.rules}
            signals={estate.signals}
          />
        )}
      </div>

      {onMap && selectedNode ? (
        <Inspector
          node={selectedNode}
          nodes={estate.nodes}
          links={estate.links}
          zones={estate.zones}
          rules={estate.rules}
          tab={state.tab}
          palette={palette}
          accent={accent}
          copy={copy}
          onTab={onTab}
          onSelectNode={onSelect}
        />
      ) : null}
    </div>
  );
}

function SubTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="subtab"
      aria-pressed={active}
      style={vars({
        '--tab-bg': active ? 'var(--panel)' : 'transparent',
        '--tab-fg': active ? 'var(--text)' : 'var(--text2)',
      })}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
