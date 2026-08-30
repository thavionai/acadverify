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
  // A share link minted by the holder. `disclose` is deliberately not read any
  // more: it was a public query parameter that let any verifier reveal the GPA,
  // which is the opposite of the graduate deciding.
  const grant = typeof searchParams.grant === "string" ? searchParams.grant : undefined;

  return <VerifyResult credentialId={credentialId} grant={grant} />;
}
