import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { KlCorridor, Sighting } from '../types';

interface WeeklyActivityChartProps {
  sightings: Sighting[];
  activeCorridor: KlCorridor | 'All';
}

interface WeeklyBucket {
  weekKey: string;
  weekLabel: string;
  rangeLabel: string;
  sightingsCount: number;
  ottersCount: number;
  liveCount: number;
  archiveCount: number;
  isCurrentWeek: boolean;
}

// Representative 11-week seasonal archive counts across KL corridors prior to current week
const ARCHIVE_WEEKLY_BY_CORRIDOR: Record<Exclude<KlCorridor, 'Other KL Waterway'>, number[]> = {
  'Perdana Botanical Gardens': [4, 5, 3, 6, 7, 5, 8, 6, 9, 7, 8],
  'Titiwangsa Lake': [3, 2, 4, 3, 5, 4, 6, 5, 4, 6, 5],
  'Klang River': [2, 3, 2, 4, 3, 5, 4, 7, 6, 5, 6],
  'Gombak River': [1, 1, 2, 1, 2, 2, 3, 2, 3, 2, 2],
  'Taman Jaya Lake': [2, 3, 2, 2, 4, 3, 4, 3, 5, 4, 4],
  'Kepong Metropolitan': [2, 1, 3, 2, 2, 3, 3, 4, 3, 4, 3],
};

const AVG_GROUP_SIZE: Record<KlCorridor, number> = {
  'Perdana Botanical Gardens': 4,
  'Titiwangsa Lake': 3,
  'Klang River': 3,
  'Gombak River': 3,
  'Taman Jaya Lake': 2,
  'Kepong Metropolitan': 4,
  'Other KL Waterway': 2,
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function getKlWeekStartMs(timestampMs: number): number {
  // Align to Monday 00:00 in Asia/Kuala_Lumpur (UTC+8)
  const klOffsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(timestampMs + klOffsetMs);
  const day = shifted.getUTCDay(); // 0 = Sun, 1 = Mon
  const daysSinceMonday = (day + 6) % 7;
  const mondayMidnightShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday,
    0,
    0,
    0,
    0
  );
  return mondayMidnightShifted - klOffsetMs;
}

function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: WeeklyBucket }>;
  metric: 'sightings' | 'otters';
}

function WeeklyChartTooltip({ active, payload, metric }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;

  return (
    <div className="bg-white border border-[#DCE3DA] rounded-lg px-3.5 py-2.5 shadow-md text-xs space-y-1.5 min-w-[190px]">
      <div className="font-semibold text-[#141E1A] border-b border-[#EDF1EC] pb-1">
        {bucket.rangeLabel}
        {bucket.isCurrentWeek ? ' · Current Week' : ''}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[#5D6D64]">Sightings logged</span>
        <span className="font-mono font-semibold tabular-nums text-[#141E1A]">
          {bucket.sightingsCount}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[#5D6D64]">Otters counted</span>
        <span className="font-mono font-semibold tabular-nums text-[#141E1A]">
          {bucket.ottersCount}
        </span>
      </div>
      <div className="pt-1 border-t border-[#EDF1EC] text-[11px] text-[#5D6D64] flex items-center justify-between gap-3">
        <span>Live reports: {bucket.liveCount}</span>
        <span>Archive: {bucket.archiveCount}</span>
      </div>
      {metric === 'otters' && (
        <div className="text-[11px] text-[#0D6E59] font-medium">
          Avg {bucket.sightingsCount > 0 ? (bucket.ottersCount / bucket.sightingsCount).toFixed(1) : '0.0'} otters per sighting
        </div>
      )}
    </div>
  );
}

export function WeeklyActivityChart({ sightings, activeCorridor }: WeeklyActivityChartProps) {
  const [metric, setMetric] = useState<'sightings' | 'otters'>('sightings');
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');

  const effectiveCorridor: KlCorridor | 'All' = scope === 'all' ? 'All' : activeCorridor;

  const { buckets, totalSightings, totalOtters, peakBucket, avgPerWeek } = useMemo(() => {
    const currentWeekStart = getKlWeekStartMs(Date.now());
    const totalWeeks = 12; // ~3 months (84 days)

    const initialBuckets: WeeklyBucket[] = Array.from({ length: totalWeeks }, (_, index) => {
      const offsetWeeks = totalWeeks - 1 - index;
      const startMs = currentWeekStart - offsetWeeks * WEEK_MS;
      const endMs = startMs + 6 * 24 * 60 * 60 * 1000;

      let archiveCount = 0;
      let archiveOtters = 0;

      // Populate prior 11 weeks from KL Watch historical archive
      if (index < 11) {
        if (effectiveCorridor === 'All') {
          (Object.keys(ARCHIVE_WEEKLY_BY_CORRIDOR) as Array<keyof typeof ARCHIVE_WEEKLY_BY_CORRIDOR>).forEach(
            (corr) => {
              const count = ARCHIVE_WEEKLY_BY_CORRIDOR[corr][index] || 0;
              archiveCount += count;
              archiveOtters += count * AVG_GROUP_SIZE[corr];
            }
          );
        } else if (effectiveCorridor !== 'Other KL Waterway') {
          const count = ARCHIVE_WEEKLY_BY_CORRIDOR[effectiveCorridor][index] || 0;
          archiveCount = count;
          archiveOtters = count * AVG_GROUP_SIZE[effectiveCorridor];
        }
      }

      return {
        weekKey: String(startMs),
        weekLabel: formatShortDate(startMs),
        rangeLabel: `${formatShortDate(startMs)} – ${formatShortDate(endMs)}`,
        sightingsCount: archiveCount,
        ottersCount: archiveOtters,
        liveCount: 0,
        archiveCount,
        isCurrentWeek: index === totalWeeks - 1,
      };
    });

    // Bucket actual live + curated baseline sightings into their corresponding week
    sightings.forEach((sighting) => {
      if (effectiveCorridor !== 'All' && sighting.corridor !== effectiveCorridor) return;
      const sightingWeekStart = getKlWeekStartMs(sighting.createdAtMs);
      const target = initialBuckets.find((b) => Number(b.weekKey) === sightingWeekStart);
      if (target) {
        target.sightingsCount += 1;
        target.ottersCount += sighting.count;
        target.liveCount += 1;
      }
    });

    let sumSightings = 0;
    let sumOtters = 0;
    let peak: WeeklyBucket | null = null;

    initialBuckets.forEach((b) => {
      sumSightings += b.sightingsCount;
      sumOtters += b.ottersCount;
      const value = metric === 'sightings' ? b.sightingsCount : b.ottersCount;
      const peakVal = peak ? (metric === 'sightings' ? peak.sightingsCount : peak.ottersCount) : -1;
      if (value > peakVal) {
        peak = b;
      }
    });

    return {
      buckets: initialBuckets,
      totalSightings: sumSightings,
      totalOtters: sumOtters,
      peakBucket: peak as WeeklyBucket | null,
      avgPerWeek: (sumSightings / totalWeeks).toFixed(1),
    };
  }, [effectiveCorridor, metric, sightings]);

  const dataKey = metric === 'sightings' ? 'sightingsCount' : 'ottersCount';

  return (
    <section
      id="activity-trends"
      className="max-w-[1360px] mx-auto px-6 pb-10"
      aria-labelledby="weekly-chart-heading"
    >
      <div className="surface-card rounded-2xl p-5 sm:p-7 space-y-5">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0D6E59]" />
              <h2
                id="weekly-chart-heading"
                className="font-display text-lg sm:text-xl font-semibold text-[#141E1A] tracking-tight"
              >
                Otter Sightings per Week
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#4A5A52]">
              Trailing 3-month activity across{' '}
              <span className="font-medium text-[#141E1A]">
                {effectiveCorridor === 'All' ? 'All Kuala Lumpur Waterways' : effectiveCorridor}
              </span>{' '}
              to spot seasonal and weekly movement peaks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeCorridor !== 'All' && (
              <div className="flex items-center gap-1 p-1 bg-[#F2F5F1] border border-[#DCE3DA] rounded-xl">
                <button
                  type="button"
                  onClick={() => setScope('filtered')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    scope === 'filtered'
                      ? 'bg-white text-[#141E1A] shadow-xs'
                      : 'text-[#5D6D64] hover:text-[#141E1A]'
                  }`}
                >
                  {activeCorridor}
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    scope === 'all'
                      ? 'bg-white text-[#141E1A] shadow-xs'
                      : 'text-[#5D6D64] hover:text-[#141E1A]'
                  }`}
                >
                  All KL
                </button>
              </div>
            )}

            <div className="flex items-center gap-1 p-1 bg-[#F2F5F1] border border-[#DCE3DA] rounded-xl">
              <button
                type="button"
                onClick={() => setMetric('sightings')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  metric === 'sightings'
                    ? 'bg-white text-[#141E1A] shadow-xs'
                    : 'text-[#5D6D64] hover:text-[#141E1A]'
                }`}
              >
                Sightings
              </button>
              <button
                type="button"
                onClick={() => setMetric('otters')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                  metric === 'otters'
                    ? 'bg-white text-[#141E1A] shadow-xs'
                    : 'text-[#5D6D64] hover:text-[#141E1A]'
                }`}
              >
                Otters Counted
              </button>
            </div>
          </div>
        </div>

        {/* Summary Metrics Strip (Unboxed Tabular Figures) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-3.5 rounded-xl bg-[#F7F9F6] border border-[#E6ECE5] text-xs">
          <div>
            <div className="text-[#6B7B72]">3-Month Sightings</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#141E1A] mt-0.5">
              {totalSightings}
            </div>
          </div>
          <div>
            <div className="text-[#6B7B72]">Otters Recorded (3 mo)</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#141E1A] mt-0.5">
              {totalOtters}
            </div>
          </div>
          <div>
            <div className="text-[#6B7B72]">Peak Activity Week</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#C26D1F] mt-0.5">
              {peakBucket ? `${peakBucket.weekLabel} (${peakBucket[dataKey]})` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#6B7B72]">Weekly Average</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#0D6E59] mt-0.5">
              {avgPerWeek} / wk
            </div>
          </div>
        </div>

        {/* Recharts Bar Chart */}
        <div className="w-full h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={buckets}
              margin={{ top: 10, right: 12, left: -16, bottom: 4 }}
              barCategoryGap="24%"
            >
              <defs>
                <linearGradient id="otterBarTeal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#148F73" />
                  <stop offset="100%" stopColor="#0D6E59" />
                </linearGradient>
                <linearGradient id="otterBarCurrent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1BA888" />
                  <stop offset="100%" stopColor="#0F7C64" />
                </linearGradient>
                <linearGradient id="otterBarPeak" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#DD8433" />
                  <stop offset="100%" stopColor="#C26D1F" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EEE8" />
              <XAxis
                dataKey="weekLabel"
                axisLine={{ stroke: '#DCE3DA' }}
                tickLine={false}
                tick={{ fill: '#5D6D64', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                dy={6}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#5D6D64', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(13, 110, 89, 0.05)' }}
                content={<WeeklyChartTooltip metric={metric} />}
              />
              <Bar dataKey={dataKey} radius={[7, 7, 0, 0]} maxBarSize={42}>
                {buckets.map((entry) => {
                  const isPeak = peakBucket && entry.weekKey === peakBucket.weekKey;
                  const fillUrl = isPeak
                    ? 'url(#otterBarPeak)'
                    : entry.isCurrentWeek
                    ? 'url(#otterBarCurrent)'
                    : 'url(#otterBarTeal)';
                  return <Cell key={entry.weekKey} fill={fillUrl} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Clean Unboxed Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#5D6D64] pt-1">
          <div className="flex flex-wrap items-center gap-5">
            <div className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0D6E59] inline-block" />
              <span>Weekly activity</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#C26D1F] inline-block" />
              <span>Peak week</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#12896F] inline-block" />
              <span>Current week (updates live)</span>
            </div>
          </div>
          <span>Peak daily windows: 07:15–09:00 & 17:45–19:00 MYT</span>
        </div>
      </div>
    </section>
  );
}
