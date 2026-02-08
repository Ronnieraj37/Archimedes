'use client';

import React from 'react';

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={
        'rounded-2xl border border-black/10 bg-white shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950 ' +
        (props.className || '')
      }
    />
  );
}

export function Button({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-white/20';
  const styles =
    variant === 'primary'
      ? 'bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
      : variant === 'secondary'
        ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800'
        : 'bg-transparent text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-900';

  return <button {...props} className={`${base} ${styles} ${props.className || ''}`} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-white/10 ' +
        (props.className || '')
      }
    />
  );
}

export function Badge(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={
        'inline-flex items-center rounded-full border border-black/10 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 ' +
        (props.className || '')
      }
    >
      {props.children}
    </span>
  );
}

