import { RegisterParcelForm } from "@/app/components/admin/register-parcel-form";

export default function RegisterParcelPage() {
  return (
    <>
      <section>
        <h1 className="mb-1 text-2xl font-bold">Register a parcel</h1>
        <p className="m-0 text-muted">
          The tracking ID is computed by the server from these details plus a server-assigned
          creation time.
        </p>
      </section>
      <RegisterParcelForm />
    </>
  );
}
