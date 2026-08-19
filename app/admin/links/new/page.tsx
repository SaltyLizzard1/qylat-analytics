'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createLink, CreateLinkState } from './actions';
import { CopyButton } from '@/components/CopyButton';
import { generateSlug } from '@/lib/utm';

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'] as const;
const FORMATS: Record<string, string[]> = {
  instagram: ['reel', 'carousel', 'story', 'bio'],
  facebook: ['reel', 'carousel', 'story', 'bio'],
  tiktok: ['short', 'bio'],
  youtube: ['short', 'bio'],
};
const CTAS = [
  { value: 'leap-log', label: 'Leap Log' },
  { value: 'quiz', label: 'Readiness Quiz' },
  { value: 'leap-kit', label: '60-Day Leap Kit' },
  { value: 'other', label: 'Other' },
];

const FIELD = {
  background: '#1A1008',
  border: '1px solid #3A2210',
  color: '#FBF6E3',
  borderRadius: '0.5rem',
  padding: '0.75rem 1rem',
  width: '100%',
  fontSize: '0.9rem',
  outline: 'none',
};

const initialState: CreateLinkState = { status: 'idle' };

export default function NewLinkPage() {
  const [state, formAction, isPending] = useActionState(createLink, initialState);
  const [platform, setPlatform] = useState('instagram');
  const [format, setFormat] = useState('reel');
  const [customSlug, setCustomSlug] = useState('');

  const formats = FORMATS[platform] ?? ['reel', 'carousel', 'bio', 'other'];
  const previewSlug = customSlug.trim() || generateSlug(platform, format);

  if (state.status === 'success') {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shortUrl = `${origin}/go/${state.slug}`;
    return <SuccessView shortUrl={shortUrl} utmUrl={state.utmUrl} slug={state.slug} />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-7">
        <Link href="/admin/links" className="text-sm" style={{ color: '#8A7A60' }}>
          ← All links
        </Link>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
        >
          New Link
        </h1>
      </div>

      <form action={formAction} className="space-y-5">
        {/* Platform */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8A7A60' }}>
            Platform
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className="flex items-center justify-center py-3 rounded-lg cursor-pointer text-sm font-medium transition-colors"
                style={
                  platform === p
                    ? { background: '#3A2210', color: '#E8C84A', border: '1.5px solid #E8C84A' }
                    : { background: '#1A1008', color: '#8A7A60', border: '1px solid #3A2210' }
                }
              >
                <input
                  type="radio"
                  name="platform"
                  value={p}
                  className="sr-only"
                  checked={platform === p}
                  onChange={() => {
                    setPlatform(p);
                    const newFormats = FORMATS[p] ?? [];
                    if (!newFormats.includes(format as never)) setFormat(newFormats[0] ?? 'reel');
                  }}
                />
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* Format */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8A7A60' }}>
            Format
          </label>
          <div className="flex flex-wrap gap-2">
            {formats.map((f) => (
              <label
                key={f}
                className="flex items-center justify-center px-4 py-2 rounded-lg cursor-pointer text-sm font-medium transition-colors"
                style={
                  format === f
                    ? { background: '#3A2210', color: '#E8C84A', border: '1.5px solid #E8C84A' }
                    : { background: '#1A1008', color: '#8A7A60', border: '1px solid #3A2210' }
                }
              >
                <input
                  type="radio"
                  name="format"
                  value={f}
                  className="sr-only"
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8A7A60' }}>
            CTA Destination
          </label>
          <select name="cta_type" style={FIELD}>
            <option value="">None / not set</option>
            {CTAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Content theme */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8A7A60' }}>
            Content Theme
            <span className="ml-2 normal-case" style={{ color: '#5A4A30' }}>
              (optional, e.g. "thailand-60-days")
            </span>
          </label>
          <input
            type="text"
            name="content_theme"
            placeholder="thailand-60-days"
            style={FIELD}
          />
        </div>

        {/* Destination URL */}
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#8A7A60' }}>
            Destination URL
          </label>
          <input
            type="url"
            name="destination_url"
            placeholder="https://quityourlifeandtravel.com/leap-log"
            required
            style={FIELD}
          />
        </div>

        {/* Slug preview + optional override */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: '#0F0A05', border: '1px solid #3A2210' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest" style={{ color: '#8A7A60' }}>
              Your short link
            </span>
            <code className="text-sm" style={{ color: '#E8C84A' }}>
              /go/{previewSlug}
            </code>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#5A4A30' }}>
              Custom slug (leave blank to auto-generate)
            </label>
            <input
              type="text"
              name="custom_slug"
              placeholder={`auto: ${generateSlug(platform, format)}`}
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              style={{ ...FIELD, fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
            />
          </div>
        </div>

        {state.status === 'error' && (
          <p className="text-sm" style={{ color: '#E8A87C' }}>
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3.5 rounded-lg font-semibold tracking-wide transition-opacity disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #8B6914 0%, #E8C84A 35%, #F5E070 55%, #C9A030 75%, #8B6914 100%)',
            border: '1.5px solid #2D1A00',
            color: '#2D1A00',
            fontSize: '0.95rem',
          }}
        >
          {isPending ? 'Creating...' : 'Create Link'}
        </button>
      </form>
    </div>
  );
}

function SuccessView({ shortUrl, utmUrl, slug }: { shortUrl: string; utmUrl: string; slug: string }) {
  const utmParams = (() => {
    try {
      return Object.fromEntries(new URL(utmUrl).searchParams);
    } catch {
      return {};
    }
  })();

  return (
    <div>
      <div className="mb-7">
        <div
          className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full mb-4"
          style={{ background: '#1A3A1A', color: '#90E890', border: '1px solid #2A5A2A' }}
        >
          Link created
        </div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
        >
          Ready to post
        </h1>
      </div>

      {/* The short link */}
      <div
        className="rounded-xl p-5 mb-4"
        style={{ background: '#1A1008', border: '1px solid #3A2210' }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#8A7A60' }}>
          Your short link
        </p>
        <div className="flex items-center gap-3">
          <code className="text-base flex-1 min-w-0 break-all" style={{ color: '#E8C84A' }}>
            {shortUrl}
          </code>
          <CopyButton text={shortUrl} label="Copy" />
        </div>
      </div>

      {/* UTMs applied */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{ background: '#0F0A05', border: '1px solid #3A2210' }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#8A7A60' }}>
          UTMs applied automatically
        </p>
        <div className="space-y-1.5">
          {Object.entries(utmParams).map(([key, val]) => (
            <div key={key} className="flex gap-3 text-sm">
              <code className="flex-shrink-0" style={{ color: '#5A4A30' }}>{key}</code>
              <code style={{ color: '#FBF6E3' }}>{val}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/admin/links/new"
          className="flex-1 py-3 text-center rounded-lg text-sm font-semibold"
          style={{
            background: 'linear-gradient(135deg, #8B6914, #E8C84A)',
            color: '#2D1A00',
            border: '1.5px solid #2D1A00',
          }}
        >
          Create another
        </Link>
        <Link
          href="/admin/links"
          className="flex-1 py-3 text-center rounded-lg text-sm"
          style={{ border: '1px solid #3A2210', color: '#8A7A60' }}
        >
          View all links
        </Link>
      </div>
    </div>
  );
}
