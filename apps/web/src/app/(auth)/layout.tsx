export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 surface-grid">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,0.12),transparent_32rem)]" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}

