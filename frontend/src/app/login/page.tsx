import { AuthForm } from "@/features/auth/form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const params = await searchParams; return <AuthForm mode="login" returnTo={params.returnTo} />;
}
