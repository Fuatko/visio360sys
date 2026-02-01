import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  
  const checks = {
    status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
    timestamp: new Date().toISOString(),
    version: '3.7.0',
    responseTimeMs: 0,
    services: {
      database: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
      api: 'healthy' as 'healthy' | 'unhealthy',
    },
    details: {} as Record<string, unknown>,
  };

  try {
    // Supabase connection test
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      checks.services.database = 'unhealthy';
      checks.details.error = 'Missing Supabase configuration';
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Simple query to test connection
      const { error } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      checks.services.database = error ? 'unhealthy' : 'healthy';
      
      if (error) {
        checks.details.databaseError = error.message;
      }
    }

    // Calculate overall status
    const allHealthy = Object.values(checks.services).every(s => s === 'healthy');
    checks.status = allHealthy ? 'healthy' : 'degraded';

  } catch (error) {
    checks.status = 'unhealthy';
    checks.details.error = error instanceof Error ? error.message : 'Unknown error';
  }

  checks.responseTimeMs = Date.now() - startTime;

  return NextResponse.json(checks, {
    status: checks.status === 'healthy' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
