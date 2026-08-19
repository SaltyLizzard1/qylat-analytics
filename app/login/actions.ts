'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const password = formData.get('password') as string;

  if (!password || password !== process.env.ANALYTICS_PASSWORD) {
    return { error: 'Incorrect password.' };
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return { error: 'Server misconfiguration: SESSION_SECRET not set.' };
  }

  const cookieStore = await cookies();
  cookieStore.set('analytics_auth', secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  redirect('/dashboard');
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('analytics_auth');
  redirect('/login');
}
