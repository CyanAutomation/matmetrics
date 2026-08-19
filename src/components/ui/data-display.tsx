import { cn } from '@/lib/utils';
import { Surface, type SurfaceProps } from '@/components/ui/surface';

type DataSurfaceProps = SurfaceProps;

export function DataSurface({
  children,
  className,
  ...props
}: DataSurfaceProps) {
  return (
    <Surface className={cn(className)} {...props}>
      {children}
    </Surface>
  );
}
