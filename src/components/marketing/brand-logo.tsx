// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Brand mark and wordmark from `src/config/brand.ts`, in the ink colour used on light marketing pages. */
import Image from "next/image";
import { brand } from "@/config/brand";

/** brand.ts points at the assets drawn for the dark app; each has a `-light` twin for light backgrounds. */
function onLight(path: string) {
  return path.replace(/\.svg$/, "-light.svg");
}

export function BrandMark({ width = 32, height = 32, className }: { width?: number; height?: number; className?: string }) {
  return (
    <Image
      src={onLight(brand.logoMark)}
      alt=""
      aria-hidden
      width={Math.round(width)}
      height={height}
      unoptimized
      priority
      className={className}
      style={{ width, height }}
    />
  );
}

export function BrandWord({ width = 103, height = 32, className }: { width?: number; height?: number; className?: string }) {
  return (
    <Image
      src={onLight(brand.logoWord)}
      alt={brand.name}
      width={Math.round(width)}
      height={height}
      unoptimized
      priority
      className={className}
      style={{ width, height }}
    />
  );
}

/** Mark followed by the wordmark, as shown at the left of the site header. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={`flex w-fit items-center gap-0.5 ${className ?? ""}`}>
      <BrandMark />
      <BrandWord />
    </span>
  );
}
