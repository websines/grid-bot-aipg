'use client';
import dynamic from 'next/dynamic';

const GridTradingBot = dynamic(() => import('@/components/GridTradingBot'), { ssr: false });

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <GridTradingBot />
    </div>
  );
}