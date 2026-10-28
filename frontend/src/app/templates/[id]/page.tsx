import { TemplateDetail } from "@/features/templates/detail";
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <TemplateDetail id={id} />;
}
