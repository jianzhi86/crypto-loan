export function Skeleton({ w = 'w-full', h = 'h-4', className = '' }: { w?: string; h?: string; className?: string }) {
  return <div className={`rounded animate-pulse ${w} ${h} ${className}`} style={{ backgroundColor: '#1E2035' }} />;
}

export function SkeletonCard() {
  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
      <Skeleton w="w-24" h="h-3" />
      <Skeleton w="w-32" h="h-7" className="mt-3" />
      <Skeleton w="w-20" h="h-3" className="mt-2" />
    </div>
  );
}
