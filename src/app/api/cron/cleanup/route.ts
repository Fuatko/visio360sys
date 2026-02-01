import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify cron secret (Vercel adds this header)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    timestamp: new Date().toISOString(),
    tasks: [] as { name: string; status: string; details?: string }[],
  };

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Clean old notifications (30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { error: notifError } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString())
      .eq('is_read', true);

    results.tasks.push({
      name: 'clean_old_notifications',
      status: notifError ? 'failed' : 'success',
      details: notifError ? notifError.message : 'Completed',
    });

    // 2. Clean old audit logs (1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { error: auditError } = await supabase
      .from('audit_logs')
      .delete()
      .lt('created_at', oneYearAgo.toISOString());

    results.tasks.push({
      name: 'clean_old_audit_logs',
      status: auditError ? 'failed' : 'success',
      details: auditError ? auditError.message : 'Completed',
    });

    // 3. Update expired sessions (if table exists)
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .lt('expires_at', new Date().toISOString())
      .eq('is_active', true);

    results.tasks.push({
      name: 'expire_old_sessions',
      status: sessionError ? 'skipped' : 'success',
      details: sessionError ? 'Table may not exist' : 'Completed',
    });

  } catch (error) {
    results.tasks.push({
      name: 'general',
      status: 'failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  const allSuccess = results.tasks.every(t => t.status === 'success' || t.status === 'skipped');

  return NextResponse.json(results, {
    status: allSuccess ? 200 : 500,
  });
}
