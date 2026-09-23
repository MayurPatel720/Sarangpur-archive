import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Archive Tracker — Sarangpur Archive Program',
  description:
    'Intake, decision, digitization, MLS tagging, storage, returns and discards for the Sarangpur photo and video archive.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Apply the stored theme before the body paints so dark mode never
          flashes light. Mirrors useTheme() + THEME_STORAGE_KEY.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var k='archive-tracker.theme';var t=localStorage.getItem(k)||'system';if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
        {/*
          Loaded over a link rather than next/font so the production build never needs
          network access. Switch to next/font/google if you want the fonts self-hosted
          and the flash of fallback text removed.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
