import PackingListForm from "@/components/recepcion/PackingListForm";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PackingListForm base={`/${locale}/compras/packing-list`} />;
}
