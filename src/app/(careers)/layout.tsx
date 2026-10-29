import type { Metadata } from "next";
import "@/styles/ximena.css";
import "@/styles/ximena-extras.css";

export const metadata: Metadata = {
  title: "Careers — Trading Solutions",
  description:
    "Your next chapter starts here. Join the boutique freight forwarder operating in more than 150 countries.",
  openGraph: {
    title: "Careers — Trading Solutions",
    description:
      "Your next chapter starts here. Join the boutique freight forwarder operating in more than 150 countries.",
    images: ["/careers/img/careers-hero-1600.webp"],
    siteName: "Trading Solutions Careers",
  },
  icons: {
    icon: "/careers/logo-ts.png",
    apple: "/careers/logo-ts.png",
  },
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preload" href="/fonts/OpenSauceTwo-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      {children}
    </>
  );
}
