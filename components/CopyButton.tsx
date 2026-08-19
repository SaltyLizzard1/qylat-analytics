'use client';

import { useState } from 'react';

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
          ? { background: '#2D5A2D', color: '#90E890', border: '1px solid #3A7A3A' }
          : { background: '#3A2210', color: '#E8C84A', border: '1px solid #5A3820' }
      }
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
