import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  surfaceClassName,
  type SurfaceStyleProps,
} from '@/vanilla/surface';

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>,
    SurfaceStyleProps {}

const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceClassName({ variant, padding }), className)}
      {...props}
    />
  )
);
Surface.displayName = 'Surface';

export { Surface };
