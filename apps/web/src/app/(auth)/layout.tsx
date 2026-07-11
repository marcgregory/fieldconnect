// Auth pages must be dynamic so the middleware can inject nonce attributes
// into inline scripts. Without this, Next.js pre-renders the HTML statically
// and the x-nonce header from middleware has no effect on the pre-built markup.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-10">
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}



