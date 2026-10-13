import React from "react";

export const logoSources = {
  48: new URL("../images/generated/logo-48.webp", import.meta.url).href,
  96: new URL("../images/generated/logo-96.webp", import.meta.url).href,
  192: new URL("../images/generated/logo-192.webp", import.meta.url).href,
};

export default function CompanyLogo({ size = 48, className }: { size?: 48 | 96; className?: string }): React.JSX.Element {
  return <img src={logoSources[size]}
    srcSet={`${logoSources[48]} 48w, ${logoSources[96]} 96w, ${logoSources[192]} 192w`}
    sizes={`${size}px`} width={size} height={size} alt="Dectrocel logo" className={className} />;
}
