import type { Metadata } from "next";
import { ToastViewport } from "../components/shared/toast-viewport";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Durozen CRM",
  description: "Sales Lead Management",
  icons: {
    icon: {
      url: "/images/durozen-favicon.png?v=2",
      type: "image/png",
      sizes: "128x128",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
