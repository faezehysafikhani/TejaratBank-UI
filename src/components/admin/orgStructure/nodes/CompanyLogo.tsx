// A company's logo where the company is shown (its card, its details, the list); without one, the given fallback.
import React, { useEffect, useState } from 'react';
import { companyLogoUrl } from '../../../../services/orgStructureApi';

export const CompanyLogo: React.FC<{ logoUrl?: string | null; name: string; className?: string; fallback: React.ReactNode }> = ({ logoUrl, name, className = 'w-11 h-11', fallback }) => {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    setSrc('');
    if (logoUrl) void companyLogoUrl(logoUrl).then((url) => { if (alive) setSrc(url); });
    return () => { alive = false; };
  }, [logoUrl]);
  return src
    ? <img src={src} alt={`لوگوی ${name}`} className={`${className} rounded-xl object-contain bg-white border border-slate-200 dark:border-slate-700 p-0.5 shrink-0`} />
    : <>{fallback}</>;
};
