import { useState, useRef, useCallback } from 'react';
import type { CollectionEntry } from '../../lib/types';
import { getCardImageUrl } from '../../lib/scryfall';

interface CardPreviewProps {
  entry: CollectionEntry;
  children: React.ReactNode;
}

export default function CardPreview({ entry, children }: CardPreviewProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = entry.scryfallData;
  const imgUrl = getCardImageUrl(card, 'normal');

  const show = useCallback((e: React.MouseEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    }, 400);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  const move = useCallback((e: React.MouseEvent) => {
    if (visible) setPos({ x: e.clientX, y: e.clientY });
  }, [visible]);

  const tooltipX = Math.min(pos.x + 16, window.innerWidth - 240);
  const tooltipY = Math.min(pos.y + 16, window.innerHeight - 360);

  return (
    <div onMouseEnter={show} onMouseLeave={hide} onMouseMove={move} className="contents">
      {children}
      {visible && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{ left: tooltipX, top: tooltipY }}
        >
          <div className="rounded-xl border border-primary/20 bg-card shadow-lg overflow-hidden w-[220px]">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={card.name}
                className="w-full h-auto"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-[180px] bg-surface-secondary flex items-center justify-center text-text-muted text-xs">
                No Image
              </div>
            )}
            <div className="px-3 py-2.5 space-y-1.5">
              <div>
                <span className="text-sm font-semibold text-text block truncate">{card.name}</span>
                <span className="text-[11px] text-text-muted truncate">{card.type_line || ''}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-text-secondary">CMC {card.cmc || 0}</span>
                {card.mana_cost && (
                  <span className="text-[10px] text-text-muted font-mono">{card.mana_cost.replace(/[{}]/g, '')}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold ${
                  entry.scores.composite >= 70 ? 'text-success'
                  : entry.scores.composite >= 45 ? 'text-primary'
                  : 'text-danger'
                }`}>
                  Score {entry.scores.composite}
                </span>
                {!entry.scores.valid && (
                  <span className="text-[10px] text-danger bg-danger/10 px-1.5 py-0.5 rounded-full">
                    Invalid
                  </span>
                )}
              </div>
              {card.oracle_text && (
                <p className="text-[10px] text-text-muted leading-relaxed line-clamp-3 italic">
                  {card.oracle_text}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
