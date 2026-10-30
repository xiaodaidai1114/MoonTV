'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Film, Tv, Star, Trophy, Gem, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import type { AiRecommendation, AiTierItem } from '@/lib/ai-recommend';

interface AiRecommendationPanelProps {
  query: string;
  results: any[];
  onSelectTier?: (tier: AiTierItem) => void;
}

export default function AiRecommendationPanel({ query, results, onSelectTier }: AiRecommendationPanelProps) {
  const [recommendation, setRecommendation] = useState<AiRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query || results.length === 0) {
      setRecommendation(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/ai-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, results }),
    })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.recommendation) {
          setRecommendation(data.recommendation);
        } else if (!cancelled && data.error) {
          setError(data.error);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query, results]);

  if (!query || results.length === 0) return null;

  const tierIcon = (tag: string) => {
    if (tag.includes('🏆') || tag.includes('4K')) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (tag.includes('💎')) return <Gem className="w-4 h-4 text-purple-400" />;
    return <Star className="w-4 h-4 text-blue-400" />;
  };

  return (
    <div className="mb-4 rounded-xl border border-zinc-700/50 bg-zinc-900/80 backdrop-blur overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-zinc-100">AI 智能选片</span>
          {recommendation && (
            <span className="flex items-center gap-1 ml-2 text-xs text-zinc-400">
              {recommendation.is_tv ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
              {recommendation.is_tv ? '电视剧' : '电影'}
              <span className="mx-1">·</span>
              {recommendation.resolution}
            </span>
          )}
          {recommendation?.engine === 'rule_fallback' && (
            <span className="ml-2 text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">规则推荐</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在分析资源质量...</span>
            </div>
          )}

          {error && (
            <div className="py-3 text-sm text-red-400">
              AI 推荐暂时不可用：{error}
            </div>
          )}

          {recommendation && !loading && (
            <>
              {/* 推荐理由 */}
              {recommendation.recommend_reason && (
                <p className="text-sm text-zinc-300 mb-2 leading-relaxed">
                  {recommendation.recommend_reason}
                </p>
              )}

              {/* 观影建议 */}
              {recommendation.viewing_tip && (
                <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                  💡 {recommendation.viewing_tip}
                </p>
              )}

              {/* 推荐档位 */}
              {recommendation.recommended_tiers.length > 0 && (
                <div className="space-y-2">
                  {recommendation.recommended_tiers.map((tier, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        tier.is_default
                          ? 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20'
                          : 'border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/60'
                      }`}
                      onClick={() => onSelectTier?.(tier)}
                    >
                      <div className="flex items-center gap-2.5">
                        {tierIcon(tier.tag)}
                        <div>
                          <div className="text-sm font-medium text-zinc-200">
                            {tier.tag} {tier.label}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {tier.highlight} · {tier.estimated_size}
                          </div>
                        </div>
                      </div>
                      {tier.is_default && (
                        <span className="text-xs text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full">
                          推荐
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 质量评分 */}
              {recommendation.quality_score > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                  <span>质量评分</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                      style={{ width: `${recommendation.quality_score}%` }}
                    />
                  </div>
                  <span>{recommendation.quality_score}/100</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
