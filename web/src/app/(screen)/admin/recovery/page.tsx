import Box from '@mui/material/Box';
import { PageHeader } from '@/components/admin/ui';
import AdminRecovery from '@/components/admin/AdminRecovery';

export const dynamic = 'force-dynamic';

export default function AdminRecoveryPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
        <PageHeader
          title="Loan Recovery"
          subtitle="Loans the protocol may settle out of collateral — overdue past the 7-day grace period, or no longer adequately collateralised."
        />
        <AdminRecovery />
      </Box>
    </Box>
  );
}
