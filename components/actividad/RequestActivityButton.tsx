// components/RequestActivityButton.tsx
"use client";
import { requestActivity } from "@/lib/actividades/apiService";
import { useState } from "react";

export default function RequestActivityButton({ fromRole }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    await requestActivity({
      title: e.target.title.value,
      targetRole: "superAdmin",
      message: e.target.message.value,
    });
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase"
      >
        Solicitar al SuperAdmin
      </button>

      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="fixed inset-0 bg-black/50 flex items-center justify-center"
        >
          <div className="bg-white p-6 rounded-2xl w-96">
            <h3 className="font-bold mb-4">Nueva Solicitud</h3>
            <input
              name="title"
              placeholder="Título"
              className="w-full mb-2 p-2 border rounded"
            />
            <textarea
              name="message"
              placeholder="Detalles de la solicitud..."
              className="w-full mb-4 p-2 border rounded"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded"
            >
              Enviar
            </button>
          </div>
        </form>
      )}
    </>
  );
}
