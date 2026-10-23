import type { Metadata } from "next";
// Self-hosted from the geist package, so builds don't download fonts from Google.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { DialogHost } from "@/components/dialog";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Resume Tailor",
  description: "Tailor your resume to any job description, check ATS-friendliness, and export to PDF or Word.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} flex min-h-screen flex-col antialiased`}>
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <DialogHost />
        {/* Anonymous page-load timings for the Vercel dashboard; it only reports when deployed on Vercel. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
