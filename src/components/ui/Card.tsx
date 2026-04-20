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
        "bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm",
        className
      )} 
      {...props}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold text-zinc-900">
            {title}
          </div>
          {action}
        </div>
      )}
      <div>
        {children}
      </div>
    </div>
  );
};
