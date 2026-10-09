'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Store, CheckCircle } from 'lucide-react';

export default function PortalRegisterPage() {
  const supabase = createClient();
  const router = useRouter();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', password2: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'confirm' | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Şifre en az 8 karakter olmalı.'); return; }
    if (form.password !== form.password2) { setError('Şifreler eşleşmiyor.'); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: { full_name: form.full_name, dealer_portal: true }, emailRedirectTo: `${window.location.origin}/login?portal=1` },
    });
    if (error) {
      setBusy(false);
      setError(error.message.includes('already registered') ? 'Bu e-posta ile zaten hesap var. Giriş yapın.' : error.message);
      return;
    }
    if (!data.session) { setBusy(false); setDone('confirm'); return; }
    const { data: claim } = await supabase.rpc('portal_claim');
    setBusy(false);
    if (claim?.linked) { router.replace('/portal'); return; }
    await supabase.auth.signOut();
    setError('Bu e-posta için bayi daveti bulunamadı. Firmadaki bayi sorumlunuzdan bu e-postayla davet oluşturmasını isteyin.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-700"><Store className="h-7 w-7 text-white" /></div>
          <h1 className="text-xl font-bold text-slate-800">Bayi Portalı Hesabı</h1>
          <p className="text-sm text-slate-500">Davet edildiğiniz e-posta adresiyle kayıt olun</p>
        </div>
        {done === 'confirm' ? (
          <div className="space-y-3 text-center text-sm text-slate-600">
            <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
            <p>Hesabınız oluşturuldu. E-postanıza gelen onay bağlantısına tıklayın, ardından giriş yapın.</p>
            <Link href="/login?portal=1" className="inline-block rounded-lg bg-indigo-700 px-4 py-2 text-white">Girişe git</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {([
              ['full_name', 'Ad Soyad', 'text'],
              ['email', 'E-posta (davet edilen)', 'email'],
              ['password', 'Şifre (en az 8 karakter)', 'password'],
              ['password2', 'Şifre tekrar', 'password'],
            ] as const).map(([k, l, t]) => (
              <div key={k}>
                <label className="mb-1 block text-sm font-medium text-slate-600">{l}</label>
                <input type={t} required value={(form as any)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-indigo-500" />
              </div>
            ))}
            <button disabled={busy} className="w-full rounded-lg bg-indigo-700 py-2.5 font-medium text-white hover:bg-indigo-800 disabled:opacity-60">
              {busy ? 'Oluşturuluyor…' : 'Hesap oluştur'}
            </button>
            <p className="text-center text-sm text-slate-500">Hesabınız var mı? <Link href="/login?portal=1" className="text-indigo-600 hover:underline">Giriş yapın</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
