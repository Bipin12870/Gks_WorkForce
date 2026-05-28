'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import BrandSplashScreen from '@/components/BrandSplashScreen';

export default function HomePage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!userData) return;
    if (userData.role === 'STAFF') {
      router.push('/staff/clock');
    } else {
      router.push('/dashboard');
    }
  }, [user, userData, loading, router]);

  return <BrandSplashScreen />;
}
