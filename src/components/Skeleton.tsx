import MuiSkeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';

export function Skeleton({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return (
    <MuiSkeleton
      variant="rectangular"
      width={width}
      height={height}
      sx={{ bgcolor: '#1E2035', borderRadius: 1 }}
    />
  );
}

export function SkeletonCard() {
  return (
    <Box sx={{ p: 2, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
      <MuiSkeleton width={96}  height={12} sx={{ bgcolor: '#1E2035' }} />
      <MuiSkeleton width={128} height={28} sx={{ bgcolor: '#1E2035', mt: 1.5 }} />
      <MuiSkeleton width={80}  height={12} sx={{ bgcolor: '#1E2035', mt: 1 }} />
    </Box>
  );
}
