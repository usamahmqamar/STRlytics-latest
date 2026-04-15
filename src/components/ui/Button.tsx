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
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm",
    secondary: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm",
    outline: "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50",
    ghost: "bg-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
    danger: "bg-rose-500 text-white hover:bg-rose-600 shadow-sm"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-5 py-2.5 text-xs",
    lg: "px-8 py-4 text-sm"
  };

  return (
    <button 
      className={cn(
        "rounded-xl font-bold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2",
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
