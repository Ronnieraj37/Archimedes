'use client';

import React from 'react';

interface DashboardStatsProps {
  totalTVL: number;
  totalVolume24h: number;
  totalPools: number;
  avgAPR: number;
}

export default function DashboardStats({
  totalTVL,
  totalVolume24h,
  totalPools,
  avgAPR,
}: DashboardStatsProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const stats = [
    { label: 'Total TVL', value: formatCurrency(totalTVL), accent: 'text-blue-400' },
    { label: '24h Volume', value: formatCurrency(totalVolume24h), accent: 'text-purple-400' },
    { label: 'Pools', value: totalPools.toString(), accent: 'text-emerald-400' },
    { label: 'Avg APR', value: `${avgAPR.toFixed(1)}%`, accent: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
          className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 animate-fade-in"
          style={{ animationDelay: `${idx * 0.05}s` }}
        >
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{stat.label}</div>
          <div className={`text-xl font-bold ${stat.accent}`}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
