import { AuthForm } from "@/features/auth/form";
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const params = await searchParams; return <AuthForm mode="register" returnTo={params.returnTo} />;
}
