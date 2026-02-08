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
    {
      label: 'Total TVL',
      value: formatCurrency(totalTVL),
      icon: '📊',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      label: '24h Volume',
      value: formatCurrency(totalVolume24h),
      icon: '💹',
      color: 'from-purple-500 to-pink-500',
    },
    {
      label: 'Active Pools',
      value: totalPools.toString(),
      icon: '🏊',
      color: 'from-green-500 to-emerald-500',
    },
    {
      label: 'Avg APR',
      value: `${avgAPR.toFixed(2)}%`,
      icon: '📈',
      color: 'from-orange-500 to-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
          className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm p-3.5 hover-lift animate-fade-in"
          style={{ animationDelay: `${idx * 0.05}s` }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-lg">{stat.icon}</span>
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} opacity-20`} />
          </div>
          <div className="text-xl font-bold text-zinc-100">{stat.value}</div>
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
