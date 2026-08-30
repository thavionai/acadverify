import { HolderView } from "@/components/hold/holder-view";

export const metadata = {
  title: "Your credential | AcadVerify",
};

export default async function HolderPage(props: PageProps<"/hold/[token]">) {
  const { token } = await props.params;

  return <HolderView token={token} />;
}
