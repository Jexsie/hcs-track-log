import { RecordEventForm } from "@/app/components/admin/record-event-form";

export default function RecordEventPage() {
  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Add update</h1>
      <RecordEventForm initialParcelHash="" />
    </>
  );
}
