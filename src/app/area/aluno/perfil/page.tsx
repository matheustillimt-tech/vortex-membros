import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountShell } from "@/components/area/account-shell";
import { getSettings, getViewer } from "../../data";
import { AvatarUpload, PasswordDialog, ProfileForm } from "./profile-forms";

export const metadata: Metadata = { title: "Perfil" };

async function ProfileContent() {
  const [user, settings] = await Promise.all([getViewer(), getSettings()]);
  const sp = settings.studentProfile;
  const a = user.address;
  return (
    <ProfileForm
      values={{
        name: user.name,
        email: user.email,
        document: user.document ?? "",
        phone: user.phone ?? "",
        address: {
          cep: a?.cep ?? "",
          street: a?.street ?? "",
          number: a?.number ?? "",
          complement: a?.complement ?? "",
          reference: a?.reference ?? "",
          district: a?.district ?? "",
          city: a?.city ?? "",
          state: a?.state ?? "",
        },
      }}
      canEditNameAndDocument={sp.canEditNameAndDocument}
      canEditEmail={sp.canEditEmail}
      showDocument={sp.showDocument}
      showAddress={sp.showAddress}
      showPhone={sp.showPhone}
      aside={<AvatarUpload url={user.avatarUrl} />}
    />
  );
}

export default function ProfilePage() {
  return (
    <AccountShell current="/area/aluno/perfil" title="Perfil" action={<PasswordDialog />}>
      <Suspense fallback={<div aria-busy="true" className="h-96" />}>
        <ProfileContent />
      </Suspense>
    </AccountShell>
  );
}
