import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const GLOBAL_OG_IMAGE = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Coffeee.png'

export const metadata: Metadata = {
  title: {
    default: "Process.Direct",
    template: "%s | Process.Direct",
  },
  description: "We help businesses lower payment-processing costs and get the right payment equipment for the way they sell.",
  metadataBase: new URL('https://process.direct'),
  openGraph: {
    siteName:    'Process.Direct',
    type:        'website',
    images: [{ url: GLOBAL_OG_IMAGE, width: 1200, height: 630, alt: 'Process.Direct' }],
  },
  twitter: {
    card:   'summary_large_image',
    images: [GLOBAL_OG_IMAGE],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
