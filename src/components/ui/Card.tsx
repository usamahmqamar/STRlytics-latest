/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className, title, action, ...props }) => {
  return (
    <div 
      className={cn(
        "bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-4 shadow-xs hover:shadow-sm transition-all duration-300",
        className
      )} 
      {...props}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {title}
          </div>
          {action}
        </div>
      )}
      <div className="text-zinc-800 dark:text-zinc-200">
        {children}
      </div>
    </div>
  );
};
