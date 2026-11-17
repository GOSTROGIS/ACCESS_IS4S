// The ArtCraft mark, from storytold/artcraft frontend/apps/artcraft/app/public/artcraft-icon.svg.
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 116.34 97.5" width={size} height={(size * 97.5) / 116.34} className={className} aria-hidden>
      <path fill="#4e7bfb" d="M104.28,49.49L81.55,0h-31.23l-3.17,4.76L14.75,53.63,0,75.85l21.55,21.55,63.79-36.94,16.99,37.04,14.01-21.74-12.06-26.27ZM32.89,65.66l32.42-48.87,10.91,23.77-43.32,25.09Z" />
    </svg>
  );
}
