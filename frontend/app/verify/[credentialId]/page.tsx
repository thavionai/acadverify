import { VerifyResult } from "@/components/verify/verify-result";

export const metadata = {
  title: "Credential Result | AcadVerify",
};

export default async function CredentialVerifyPage(
  props: PageProps<"/verify/[credentialId]">,
) {
  const [{ credentialId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const disclose = searchParams.disclose === "gpa";

  return <VerifyResult credentialId={credentialId} discloseGpa={disclose} />;
}
