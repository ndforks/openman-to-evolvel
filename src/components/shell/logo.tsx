/** The product mark and wordmark from the brand config. */
import { brand } from "@/config/brand";
import { BrandIcon } from "@/components/ui/brand-icon";
import { cn } from "@/components/ui/cn";

/** brand.ts points at the assets drawn for the dark app; each has a `-light` twin in ink for the light theme. */
const onLight = (path: string) => path.replace(/\.svg$/, "-light.svg");

function Piece({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <>
      <BrandIcon src={src} width={width} height={height} className="hidden dark:inline-block" />
      <BrandIcon src={onLight(src)} width={width} height={height} className="dark:hidden" />
    </>
  );
}

export function Logo({ wordmark = true, className }: { wordmark?: boolean; className?: string }) {
  return (
    <span role="img" aria-label={brand.name} className={cn("flex items-center gap-[2px]", className)}>
      <Piece src={brand.logoMark} width={28} height={28} />
      {wordmark ? <Piece src={brand.logoWord} width={90} height={28} /> : null}
    </span>
  );
}
