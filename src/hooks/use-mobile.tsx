import * as React from 'react';

// Keep this aligned with Tailwind's `xl` breakpoint used by the application
// navigation components.
export const APPLICATION_NAVIGATION_BREAKPOINT = 1280;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${APPLICATION_NAVIGATION_BREAKPOINT - 1}px)`
    );
    const onChange = () => {
      setIsMobile(mql.matches);
    };
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
