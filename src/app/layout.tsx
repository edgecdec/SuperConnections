import type { Metadata } from "next";
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Connections",
  description: "A Connections-style game with massive scaling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
