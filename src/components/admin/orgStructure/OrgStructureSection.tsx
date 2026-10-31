import React from 'react';
import { Notice } from '../AdminUi';
import { ORG_STRUCTURE_PERMISSIONS as P } from '../../../services/orgStructureApi';
import { KindsChart } from './kinds/KindsChart';

/**
 * «ساختار سازمانی»: one page, one chart. The organization is built and edited in «چارت مرتب» (a «+» beside every
 * node opens one form); «چارت درختی» draws the same data. Shown only when the backend has the organization-structure
 * module (see SystemAdministration); the server checks every permission again. «جایگاه من» is on the profile page.
 */
export const OrgStructureSection: React.FC<{ can: (permission: string) => boolean }> = ({ can }) => {
  if (!Object.values(P).some(can)) return <Notice type="info">دسترسی به ساختار سازمانی برای شما فعال نیست.</Notice>;
  return <KindsChart can={can} />;
};
