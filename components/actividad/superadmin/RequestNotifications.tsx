// components/activities/superadmin/RequestNotifications.tsx
"use client";
import useSWR from "swr";

export function RequestNotifications() {
  const { data: requests, mutate } = useSWR("/api/superadmin/requests");

  const handleApprove = async (requestId, activityId, newStatus) => {
    // 1. Aprobar solicitud
    // 2. Mover la actividad al nuevo estado
    await fetch("/api/activities/move", { method: 'POST', body: JSON.stringify(...) });
    mutate();
  };

  return (
    <div className="bg-amber-50 p-4 rounded-2xl mb-6 border border-amber-200">
      <h3 className="font-bold text-amber-800 mb-2">Solicitudes de Reapertura</h3>
      {requests?.map(req => (
        <div key={req.id} className="flex justify-between items-center bg-white p-2 rounded mb-2">
          <span>Actividad {req.activity_id} quiere volver a {req.requested_status}</span>
          <button onClick={() => handleApprove(req.id, req.activity_id, req.requested_status)}
                  className="bg-green-500 text-white px-2 py-1 rounded text-xs">
            Aprobar
          </button>
        </div>
      ))}
    </div>
  );
}
