/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}) => {
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400",
    secondary: "bg-emerald-50 text-emerald-800 border border-emerald-100 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
    outline: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 hover:text-zinc-900 dark:hover:bg-zinc-850",
    ghost: "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850 hover:text-zinc-900 dark:hover:text-zinc-100",
    danger: "bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-400"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs font-medium",
    md: "h-9 px-4 text-[13px] font-medium",
    lg: "h-11 px-5 text-sm font-semibold"
  };

  return (
    <button 
      className={cn(
        "rounded-lg transition-colors active:translate-y-px disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
