import { redirect } from "next/navigation";

export default function DisenadorPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/disenador/dashboard`);
}
