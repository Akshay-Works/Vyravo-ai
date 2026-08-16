// Override the auth layout for the login page
export const dynamic = "force-dynamic";
export const metadata = { title: "Client Login", robots: { index: false, follow: false } };

export default function PortalLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
