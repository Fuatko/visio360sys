import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Fallback: console'a logla
      console.error('[CLIENT ERROR]', body);
      return NextResponse.json({ logged: true });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Error logs tablosuna kaydet
    await supabase.from('error_logs').insert({
      error_type: 'client_error',
      error_message: body.message,
      stack_trace: body.stack,
      request_url: body.url,
      user_agent: body.userAgent,
      created_at: body.timestamp,
    });

    return NextResponse.json({ logged: true });
  } catch (error) {
    console.error('Error logging failed:', error);
    return NextResponse.json({ logged: false }, { status: 500 });
  }
}
