'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createLink, CreateLinkState } from './actions';
import { CopyButton } from '@/components/CopyButton';
import { generateSlug } from '@/lib/utm';
import { severityGood, severityBad } from '@/lib/severity';
import { BASE_URL } from '@/lib/config';
import { PILLARS } from '@/lib/pillars';

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'] as const;
const FORMATS: Record<string, string[]> = {
  instagram: ['reel', 'carousel', 'story', 'short', 'bio', 'other'],
  facebook: ['reel', 'carousel', 'story', 'short', 'bio', 'other'],
  tiktok: ['short', 'bio', 'other'],
  youtube: ['short', 'bio', 'other'],
};
const FORMAT_LABELS: Record<string, string> = { other: 'Post' };
const CTAS = [
  { value: 'leap-log', label: 'Leap Log' },
  { value: 'quiz', label: 'Readiness Quiz' },
  { value: 'leap-kit', label: '60-Day Leap Kit' },
  { value: 'other', label: 'Other' },
];

const FIELD = {
  background: '#FFFFFF',
  border: '1px solid #D0D0D0',
  color: '#111111',
  borderRadius: '0.375rem',
  padding: '0.75rem 1rem',
  width: '100%',
  fontSize: '0.9rem',
  outline: 'none',
};

const initialState: CreateLinkState = { status: 'idle' };

export default function NewLinkPage() {
  const [formKey, setFormKey] = useState(0);
  return <LinkForm key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
}

function LinkForm({ onReset }: { onReset: () => void }) {
  const [state, formAction, isPending] = useActionState(createLink, initialState);
  const [platform, setPlatform] = useState('instagram');
  const [format, setFormat] = useState('reel');
  const [customSlug, setCustomSlug] = useState('');
  const [theme, setTheme] = useState('');

  const formats = FORMATS[platform] ?? ['reel', 'carousel', 'bio', 'other'];
  const previewSlug = customSlug.trim() || generateSlug(platform, format);

  if (state.status === 'success') {
    const shortUrl = `${BASE_URL}/${state.slug}`;
    return <SuccessView shortUrl={shortUrl} utmUrl={state.utmUrl} onReset={onReset} />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-7">
        <Link href="/admin/links" style={{ color: '#111111', textDecoration: 'underline', fontSize: '0.875rem' }}>
          Back to All Links
        </Link>
        <h1 className="text-2xl" style={{ fontWeight: 600, color: '#111111' }}>
          New Link
        </h1>
      </div>

      <form action={formAction} className="space-y-5">
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#555555' }}>
            Platform
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className="flex items-center justify-center py-3 rounded-lg cursor-pointer text-sm font-medium"
                style={
                  platform === p
                    ? { background: '#111111', color: '#FFFFFF', border: '1px solid #111111' }
                    : { background: '#FFFFFF', color: '#555555', border: '1px solid #D0D0D0' }
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

        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#555555' }}>
            Format
          </label>
          <div className="flex flex-wrap gap-2">
            {formats.map((f) => (
              <label
                key={f}
                className="flex items-center justify-center px-4 py-2 rounded-lg cursor-pointer text-sm font-medium"
                style={
                  format === f
                    ? { background: '#111111', color: '#FFFFFF', border: '1px solid #111111' }
                    : { background: '#FFFFFF', color: '#555555', border: '1px solid #D0D0D0' }
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
                {FORMAT_LABELS[f] ?? f.charAt(0).toUpperCase() + f.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#555555' }}>
            CTA Destination
          </label>
          <select name="cta_type" style={FIELD}>
            <option value="">None / not set</option>
            {CTAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#555555' }}>
            Content Theme
            <span className="ml-2 normal-case" style={{ color: '#555555' }}>
              (pick a pillar, so this link joins to the matching post)
            </span>
          </label>
          {/*
            Same four pillars as the post tagging screen. The theme string is
            what joins a link to a post, so both sides have to use one
            vocabulary or the Themes view stays empty.
          */}
          <div className="flex flex-wrap gap-2 mb-2">
            {PILLARS.map((p) => {
              const active = theme === p.slug;
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setTheme(active ? '' : p.slug)}
                  title={p.covers}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={
                    active
                      ? { background: '#111111', color: '#FFFFFF', border: '1px solid #111111' }
                      : { background: '#FFFFFF', color: '#555555', border: '1px solid #D0D0D0' }
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            name="content_theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="or type your own"
            style={FIELD}
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#555555' }}>
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

        <div
          className="rounded-lg p-4 space-y-3"
          style={{ background: '#F2F2F2', border: '1px solid #D0D0D0' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest" style={{ color: '#555555' }}>
              Your short link
            </span>
            <code className="text-sm break-all" style={{ color: '#111111' }}>
              {BASE_URL}/{previewSlug}
            </code>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: '#555555' }}>
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
          <p className="text-sm px-3 py-2 rounded-lg" style={severityBad}>
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3.5 rounded-lg font-semibold tracking-wide transition-opacity disabled:opacity-50"
          style={{
            background: '#111111',
            border: '1px solid #111111',
            color: '#FFFFFF',
            fontSize: '0.95rem',
          }}
        >
          {isPending ? 'Creating...' : 'Create Link'}
        </button>
      </form>
    </div>
  );
}

function SuccessView({
  shortUrl,
  utmUrl,
  onReset,
}: {
  shortUrl: string;
  utmUrl: string;
  onReset: () => void;
}) {
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
          style={severityGood}
        >
          Link created
        </div>
        <h1 className="text-2xl" style={{ fontWeight: 600, color: '#111111' }}>
          Ready to post
        </h1>
      </div>

      <div
        className="rounded-lg p-5 mb-4"
        style={{ background: '#FFFFFF', border: '1px solid #D0D0D0' }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#555555' }}>
          Your short link
        </p>
        <div className="flex items-center gap-3">
          <code className="text-base flex-1 min-w-0 break-all" style={{ color: '#111111' }}>
            {shortUrl}
          </code>
          <CopyButton text={shortUrl} label="Copy" />
        </div>
      </div>

      <div
        className="rounded-lg p-5 mb-6"
        style={{ background: '#F2F2F2', border: '1px solid #D0D0D0' }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#555555' }}>
          UTMs applied automatically
        </p>
        <div className="space-y-1.5">
          {Object.entries(utmParams).map(([key, val]) => (
            <div key={key} className="flex gap-3 text-sm">
              <code className="flex-shrink-0" style={{ color: '#555555' }}>{key}</code>
              <code style={{ color: '#111111' }}>{val}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 py-3 text-center rounded-lg text-sm font-semibold"
          style={{
            background: '#111111',
            color: '#FFFFFF',
            border: '1px solid #111111',
          }}
        >
          Create another
        </button>
        <Link
          href="/admin/links"
          className="flex-1 py-3 text-center rounded-lg text-sm"
          style={{ border: '1px solid #D0D0D0', color: '#111111', textDecoration: 'none' }}
        >
          View all links
        </Link>
      </div>
    </div>
  );
}
