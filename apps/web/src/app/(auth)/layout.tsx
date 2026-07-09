export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-10">
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}



