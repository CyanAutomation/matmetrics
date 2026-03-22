import { PawPrint } from 'lucide-react';

interface MatMetricsLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'solid' | 'minimal';
  className?: string;
}

const sizeMap = {
  sm: { container: 'w-8 h-8', icon: 'w-4 h-4' },
  md: { container: 'w-10 h-10', icon: 'w-5 h-5' },
  lg: { container: 'w-12 h-12', icon: 'w-6 h-6' },
  xl: { container: 'w-16 h-16', icon: 'w-8 h-8' },
};

export function MatMetricsLogo({
  size = 'md',
  variant = 'solid',
  className = '',
}: MatMetricsLogoProps) {
  const { container, icon } = sizeMap[size];

  if (variant === 'solid') {
    return (
      <div
        className={`${container} bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg ${className}`}
      >
        <PawPrint className={icon} />
      </div>
    );
  }

  return (
    <div
      className={`${container} flex items-center justify-center ${className}`}
    >
      <PawPrint className={`${icon} text-primary`} />
    </div>
  );
}
