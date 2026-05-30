import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import BadgeManager from "@/components/BadgeManager";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f9fafb",
};

export const metadata: Metadata = {
  title: "GKS Workforce Management",
  description: "Staff availability, shift rostering, and time tracking for GKS",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GKS Workforce",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sourceSerif4.className} antialiased`}
      >
        <ServiceWorkerRegister />
        <AuthProvider>
          <NotificationProvider>
            <BadgeManager />
            {children}
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
