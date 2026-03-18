'use client';

import React, { useState } from 'react';
import Image from 'next/image';

type RessaPose = 1 | 2 | 3 | 4 | 5;

interface RessaImageProps {
  /**
   * Ressa pose number (1-5)
   * 1: Coach mode (Log Form)
   * 2: Encouraging (Empty States)
   * 3: Welcoming (Auth)
   * 4: Excited (Import)
   * 5: Focused/Technical (Advanced)
   */
  pose: RessaPose;
  
  /**
   * Size variant
   * 'compact': 60-100px (toasts, small modals)
   * 'medium': 150-200px (main modals, empty states)
   * 'large': 200-250px (hero sections)
   */
  size?: 'compact' | 'medium' | 'large';
  
  /**
   * Custom CSS class for additional styling
   */
  className?: string;
  
  /**
   * Whether to animate on mount (fade-in-up)
   */
  animate?: boolean;
  
  /**
   * Alt text for accessibility
   */
  alt?: string;
}

export function RessaImage({
  pose,
  size = 'medium',
  className = '',
  animate = true,
  alt = 'Ressa Kuzushi, judo training coach',
}: RessaImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Responsive sizing based on breakpoints
  const getSizeClasses = () => {
    switch (size) {
      case 'compact':
        return {
          width: 80,
          height: 80,
          responsive: 'w-20 h-20 sm:w-24 sm:h-24',
        };
      case 'medium':
        return {
          width: 180,
          height: 180,
          responsive: 'w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48',
        };
      case 'large':
        return {
          width: 240,
          height: 240,
          responsive: 'w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64',
        };
      default:
        return {
          width: 180,
          height: 180,
          responsive: 'w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48',
        };
    }
  };

  const sizeClasses = getSizeClasses();

  const animationClass = animate && isLoaded ? 'animate-fade-in-up' : '';

  // Image path - Next.js will handle WebP vs PNG fallback
  const imagePath = `/images/ressa/ressa-pose-${pose}`;

  return (
    <div
      className={`flex justify-center ${className} ${
        !isLoaded ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'
      }`}
    >
      <div className={`relative ${sizeClasses.responsive} ${animationClass}`}>
        <Image
          src={`${imagePath}.webp`}
          alt={alt}
          width={sizeClasses.width}
          height={sizeClasses.height}
          priority={false}
          onLoad={() => setIsLoaded(true)}
          className="w-full h-full object-contain"
          quality={80}
        />
      </div>
    </div>
  );
}
