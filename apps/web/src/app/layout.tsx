import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Careflow — A little more care. A lot less admin.",
  description:
    "Your connected clinic workspace. Appointments, patient records, billing, and better care, together.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
