'use client';

import { useState } from 'react';
import { severityGood } from '@/lib/severity';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="text-xs px-3 py-1.5 rounded font-medium transition-colors flex-shrink-0"
      style={
        copied
          ? severityGood
          : { background: '#F2F2F2', color: '#111111', border: '1px solid #D0D0D0' }
      }
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
