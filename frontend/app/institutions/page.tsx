import type { Metadata } from "next";
import { InstitutionsPageClient } from "@/components/institutions/institutions-page-client";

export const metadata: Metadata = {
  title: "Institutions | AcadVerify",
};

export default function InstitutionsPage() {
  return <InstitutionsPageClient />;
}
